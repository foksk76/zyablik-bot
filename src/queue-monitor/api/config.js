// SPDX-License-Identifier: Apache-2.0
'use strict';

// ADR-0046: REST API /api/config/* на dashboard-сервере.
// Handler'ы следуют контракции queue-monitor:
//   (ctx) => { statusCode, headers?, body? } | undefined
// http-server.js применит headers к ответу (Content-Disposition для export).
//
// Маршруты:
//   GET  /api/config          — effective-конфиг (секреты — только статус)
//   GET  /api/config/schema   — merged-схема (система + плагины)
//   GET  /api/config/status   — idle/pending/confirmed/rolled_back/quarantine
//   GET  /api/config/stage    — текущий staged + diff
//   PUT  /api/config/stage    — валидация + запись staged
//   POST /api/config/apply    — 202, write + рестарт (single-flight, rate limit)
//   POST /api/config/rollback — 202, восстановление lkg (single-flight)
//   GET  /api/config/export   — редактированный JSON (секреты — $VAR)
//   POST /api/config/import   — валидация → staged + diff (reject литералов)
//
// Мутирующие эндпоинты (apply/rollback/import) — single-flight (409) +
// sliding-window rate limit (ADR-0046, отдельный пул от auth).

const { resolveConfigPath, CONFIG_VALIDATION_ERROR_CODE, SECRET_VAR_UNRESOLVED_ERROR_CODE } = require('../../bot-platform/core/config');
const { getMergedConfigSchema, SYSTEM_SCHEMA, SYSTEM_SECTION_KEYS } = require('../../bot-platform/core/config-schema');
const { CURRENT_VERSION } = require('../../bot-platform/core/config-migrations');
const {
    readStaged,
    writeStaged,
    stagedExists,
    clearStaged,
    readJsonFile,
    preValidateConfigFile,
    mergePreservedSecrets,
    applyConfig,
    rollbackConfig,
    confirmConfigApplied,
    DEFAULT_STARTUP_WAIT_MS
} = require('../../bot-platform/core/config-store');

const MODULE_NAME = 'queue-monitor-config-api';

// ADR-0046: дефолты sliding-window rate limit для мутирующих /api/config/*.
// Отдельный пул от auth (ADR-0039), лимиты переопределяются через options.
const DEFAULT_MUTATION_MAX = 10;
const DEFAULT_MUTATION_WINDOW_MS = 60_000;

// Таймаут чтения тела запроса — защита от зависших соединений: без него
// обещание readJsonBody могло не сеттлиться вовсе и мутационный single-flight
// lock навсегда оставался занятым.
const READ_BODY_TIMEOUT_MS = 30_000;

function createConfigMutationRateLimiter(options = {}) {
    const max = typeof options.max === 'number' && options.max > 0 ? options.max : DEFAULT_MUTATION_MAX;
    const windowMs = typeof options.windowMs === 'number' && options.windowMs > 0 ? options.windowMs : DEFAULT_MUTATION_WINDOW_MS;
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
    const timestamps = [];

    function evictOld(windowStart) {
        while (timestamps.length > 0 && timestamps[0] <= windowStart) {
            timestamps.shift();
        }
    }

    function tryAcquire() {
        const now = nowFn();
        const windowStart = now - windowMs;
        evictOld(windowStart);
        if (timestamps.length >= max) {
            const waitMs = timestamps[0] + windowMs - now;
            return { allowed: false, waitMs: Math.max(0, waitMs) };
        }
        timestamps.push(now);
        return { allowed: true, waitMs: 0 };
    }

    function stats() {
        evictOld(nowFn() - windowMs);
        return { mutations: timestamps.length, limit: max, windowMs };
    }

    function reset() {
        timestamps.length = 0;
    }

    return { tryAcquire, stats, reset };
}

// Чтение JSON-тела запроса (с лимитом размера). Возвращает Promise.
// Гарантированно сеттлится ровно один раз: таймаут, close/aborted на
// соединении и error всегда отклоняют, даже если 'data'/'end' уже пришли —
// иначе мутационный single-flight lock в putStage/importConfig никогда не
// освобождается (finally ждёт этот Promise вечно).
function readJsonBody(req, limitBytes = 1_000_000) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let settled = false;
        let timer = null;

        // settle не должен бросать: исключение из cleanup (например, у
        // тестового stream'а нет removeListener) не должно орфанить Promise —
        // иначе 'finally' мутационного single-flight lock повиснет навсегда.
        const settle = (error, value) => {
            if (settled) {
                return;
            }
            settled = true;
            if (timer !== null) {
                clearTimeout(timer);
            }
            try {
                cleanup();
            } catch {
                // noop
            }
            if (error) {
                reject(error);
            } else {
                resolve(value);
            }
        };

        const fail = (error) => settle(error || new Error('Request body read aborted'));

        function cleanup() {
            if (typeof req.removeListener !== 'function') {
                return;
            }
            req.removeListener('data', onData);
            req.removeListener('end', onEnd);
            req.removeListener('error', onError);
            req.removeListener('close', onClose);
            req.removeListener('aborted', onAborted);
        }

        function onData(chunk) {
            size += chunk.length;
            if (size > limitBytes) {
                fail(new Error('Body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        }

        function onEnd() {
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                settle(null, raw.trim() === '' ? null : JSON.parse(raw));
            } catch (error) {
                fail(error);
            }
        }

        function onError(error) {
            fail(error);
        }

        function onClose() {
            fail(new Error('Request closed before body was fully read'));
        }

        function onAborted() {
            fail(new Error('Request aborted before body was fully read'));
        }

        // Плавающий таймаут: защита от зависших соединений. Сеттлит reject
        // даже если событий не было вовсе.
        timer = setTimeout(() => {
            fail(new Error('Request body read timed out'));
            req.destroy();
        }, READ_BODY_TIMEOUT_MS);
        timer.unref();

        req.on('data', onData);
        req.on('end', onEnd);
        req.on('error', onError);
        req.on('close', onClose);
        req.on('aborted', onAborted);
    });
}

// Дифф staged-конфига против активного (только изменённые поля).
// Секретные поля (field.secret) не показываются: в UI/диффе — только статус
// «задан / не задан» (ADR-0045/0046). Для системных секций фильтруются ключи
// со secret:true; для веток plugins.<name>.* — секретные под-ключи по
// configSchema плагина. Формат строк совпадает с клиентским buildDiff:
// системная секция — { section, key }, плагин — { section: pluginName, key }.
function computeConfigDiff(activeConfig, stagedConfig, plugins = []) {
    const active = activeConfig || {};
    const staged = stagedConfig || {};
    const diff = [];

    // configSchema плагинов: pluginName → schema (для фильтрации секретов
    // в ветках plugins.<name>.*).
    const pluginSchemas = {};
    for (const plugin of plugins || []) {
        if (plugin && plugin.name && plugin.configSchema && typeof plugin.configSchema === 'object') {
            pluginSchemas[plugin.name] = plugin.configSchema;
        }
    }

    function isSecretField(sectionName, key) {
        const schemaSection = SYSTEM_SCHEMA[sectionName];
        const field = schemaSection ? schemaSection[key] : null;
        return Boolean(field && field.secret);
    }

    function isPluginSecretField(pluginName, key) {
        const schema = pluginSchemas[pluginName];
        const field = schema ? schema[key] : null;
        return Boolean(field && field.secret);
    }

    function pushRow(section, key, oldValue, newValue) {
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            diff.push({
                section,
                key,
                old: oldValue === undefined ? null : oldValue,
                new: newValue === undefined ? null : newValue
            });
        }
    }

    const sectionNames = new Set([...Object.keys(active), ...Object.keys(staged)]);
    for (const sectionName of sectionNames) {
        if (sectionName === 'version') {
            continue;
        }
        const activeSection = active[sectionName] && typeof active[sectionName] === 'object' ? active[sectionName] : {};
        const stagedSection = staged[sectionName] && typeof staged[sectionName] === 'object' ? staged[sectionName] : {};
        if (sectionName === 'plugins') {
            // plugins.<name>.* — дифф по под-ключам, секреты пропускаются.
            const pluginNames = new Set([...Object.keys(activeSection), ...Object.keys(stagedSection)]);
            for (const pluginName of pluginNames) {
                const a = activeSection[pluginName] && typeof activeSection[pluginName] === 'object' && !Array.isArray(activeSection[pluginName])
                    ? activeSection[pluginName] : {};
                const s = stagedSection[pluginName] && typeof stagedSection[pluginName] === 'object' && !Array.isArray(stagedSection[pluginName])
                    ? stagedSection[pluginName] : {};
                const keys = new Set([...Object.keys(a), ...Object.keys(s)]);
                for (const key of keys) {
                    if (isPluginSecretField(pluginName, key)) {
                        continue;
                    }
                    pushRow(pluginName, key, a[key], s[key]);
                }
            }
            continue;
        }
        const keys = new Set([...Object.keys(activeSection), ...Object.keys(stagedSection)]);
        for (const key of keys) {
            if (isSecretField(sectionName, key)) {
                continue;
            }
            pushRow(sectionName, key, activeSection[key], stagedSection[key]);
        }
    }

    return diff;
}

// Маска секрета для API-ответов: только статус { secret: true, set },
// само значение ($VAR-ссылка) наружу не отдаётся.
function maskSecret(value) {
    return { secret: true, set: typeof value === 'string' && value !== '' };
}

// Маскирование staged-снапшота для ответов API: секретные поля системы и
// плагинов не уходят наружу даже как $VAR-имя — только статус
// { secret: true, set }. Файл на диске не трогается; export остаётся
// сырым редактором ($VAR в нём легитимен).
function maskStagedSecrets(fileConfig, plugins = []) {
    if (!fileConfig || typeof fileConfig !== 'object') {
        return fileConfig;
    }
    const result = { ...fileConfig };

    for (const sectionName of SYSTEM_SECTION_KEYS) {
        const section = result[sectionName];
        if (!section || typeof section !== 'object') {
            continue;
        }
        const masked = { ...section };
        for (const [key, field] of Object.entries(SYSTEM_SCHEMA[sectionName])) {
            if (field.secret && masked[key] !== undefined) {
                masked[key] = maskSecret(masked[key]);
            }
        }
        result[sectionName] = masked;
    }

    const pluginSchemas = {};
    for (const plugin of plugins || []) {
        if (plugin && plugin.name && plugin.configSchema && typeof plugin.configSchema === 'object') {
            pluginSchemas[plugin.name] = plugin.configSchema;
        }
    }
    if (result.plugins && typeof result.plugins === 'object') {
        const maskedPlugins = {};
        for (const [pluginName, pluginValue] of Object.entries(result.plugins)) {
            if (!pluginValue || typeof pluginValue !== 'object' || Array.isArray(pluginValue)) {
                maskedPlugins[pluginName] = pluginValue;
                continue;
            }
            const schema = pluginSchemas[pluginName];
            const masked = { ...pluginValue };
            if (schema) {
                for (const [key, field] of Object.entries(schema)) {
                    if (field.secret && masked[key] !== undefined) {
                        masked[key] = maskSecret(masked[key]);
                    }
                }
            }
            maskedPlugins[pluginName] = masked;
        }
        result.plugins = maskedPlugins;
    }

    return result;
}

// Сериализация effective-конфига: секреты маскируются до { secret: true, set }.
// set = в файле есть непустое значение ($VAR-ссылка). Возвращает { version, fileExists, sections }.
// plugins — список загруженных плагинов (для маскирования секретов в plugins.*).
function buildEffectiveSections(fileConfig, fileExists, plugins = []) {
    const sections = {};

    for (const sectionName of SYSTEM_SECTION_KEYS) {
        const schemaSection = SYSTEM_SCHEMA[sectionName];
        const fileSection = fileConfig && fileConfig[sectionName] ? fileConfig[sectionName] : {};
        const section = {};
        for (const [key, field] of Object.entries(schemaSection)) {
            const value = fileSection[key];
            if (field.secret) {
                section[key] = maskSecret(value);
            } else {
                section[key] = value === undefined ? field.default : value;
            }
        }
        sections[sectionName] = section;
    }

    const pluginSchemas = {};
    for (const plugin of plugins) {
        if (plugin && plugin.name && plugin.configSchema && typeof plugin.configSchema === 'object') {
            pluginSchemas[plugin.name] = plugin.configSchema;
        }
    }
    const pluginSection = {};
    if (fileConfig && fileConfig.plugins && typeof fileConfig.plugins === 'object') {
        for (const [pluginName, pluginValue] of Object.entries(fileConfig.plugins)) {
            if (!pluginValue || typeof pluginValue !== 'object' || Array.isArray(pluginValue)) {
                pluginSection[pluginName] = pluginValue === undefined ? {} : pluginValue;
                continue;
            }
            const schema = pluginSchemas[pluginName];
            const section = { ...pluginValue };
            if (schema) {
                for (const [key, field] of Object.entries(schema)) {
                    if (field.secret && section[key] !== undefined) {
                        section[key] = maskSecret(section[key]);
                    }
                }
            }
            pluginSection[pluginName] = section;
        }
    }
    sections.plugins = pluginSection;

    return {
        version: fileConfig && fileConfig.version !== undefined ? fileConfig.version : CURRENT_VERSION,
        fileExists,
        sections
    };
}

// Экспорт-дамп: тот же fileConfig (в нём секреты уже $VAR-ссылки по ADR-0045).
// Дополнительно гарантируется: литеральных секретов нет (инвариант файла).
function buildExportConfig(fileConfig) {
    return fileConfig || { version: CURRENT_VERSION, bot: {}, queue: {}, ingress: {}, monitor: {}, plugins: {} };
}

function createConfigApi(options = {}) {
    const environment = options.environment || process.env;
    const logger = options.logger || console;
    const plugins = options.plugins || [];
    // configPath: явный (app.js передаёт core.configPath) или из environment.
    const configPath = options.configPath || resolveConfigPath(environment, options);
    // restart — делегированная наружу функция рестарта (ADR-0045).
    const restart = typeof options.restart === 'function' ? options.restart : null;
    const startupWaitMs = options.startupWaitMs || DEFAULT_STARTUP_WAIT_MS;

    // ADR-0046: отдельный sliding-window пул для мутирующих /api/config/*.
    const mutationLimiter = options.rateLimiter || createConfigMutationRateLimiter({
        max: options.mutationRateLimitMax,
        windowMs: options.mutationRateLimitWindowMs,
        now: options.rateLimiterNow
    });

    function logConfigAudit(action, context) {
        // Аудит конфигурационных операций из API (ADR-0029). context без
        // литеральных секретов.
        if (logger && typeof logger.info === 'function') {
            logger.info({ level: 'info', module: MODULE_NAME, action, context });
        }
    }

    // Внутреннее состояние статуса (ADR-0046):
    // idle | pending | confirmed | rolled_back | quarantine.
    let state = {
        state: 'idle',
        reason: null,
        appliedAt: null,
        appliedHash: null,
        appliedAtMs: null,
        restoredAt: null,
        restoredFrom: null
    };
    let mutationInProgress = false;

    function tryAcquireMutation() {
        if (mutationInProgress) {
            return false;
        }
        mutationInProgress = true;
        return true;
    }

    function releaseMutation() {
        mutationInProgress = false;
    }

    function tooManyRequests(waitMs) {
        const retryAfter = waitMs ? Math.max(1, Math.ceil(waitMs / 1000)) : 60;
        return {
            statusCode: 429,
            headers: { 'Retry-After': String(retryAfter) },
            body: { status: 'error', error: 'Too Many Requests' }
        };
    }

    function conflict(message) {
        return {
            statusCode: 409,
            body: { status: 'error', error: message || 'Another config mutation is already in progress' }
        };
    }

    // --- GET /api/config ---

    function getConfig(ctx) {
        // Для просмотра маскируем по raw-файлу (источник правды для статуса
        // секретов: $VAR-ссылка задана/не задана). loadConfig не используется —
        // он бросает на неразрешённых $VAR, а просмотр должен работать и при
        // отсутствии файла (показываем дефолты).
        const fileConfig = readJsonFile(configPath);
        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: buildEffectiveSections(fileConfig, fileConfig !== null, plugins)
            }
        };
    }

    // --- GET /api/config/schema ---

    function getSchema(ctx) {
        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: {
                    version: CURRENT_VERSION,
                    schema: getMergedConfigSchema(plugins)
                }
            }
        };
    }

    // --- GET /api/config/status ---

    function getStatus(ctx) {
        // pendingRemainingMs — только для state=pending.
        let pendingRemainingMs = null;
        if (state.state === 'pending' && state.appliedAtMs) {
            pendingRemainingMs = Math.max(0, state.appliedAtMs + startupWaitMs - Date.now());
        }

        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: {
                    state: state.state,
                    reason: state.reason,
                    appliedAt: state.appliedAt,
                    appliedHash: state.appliedHash,
                    restoredAt: state.restoredAt,
                    restoredFrom: state.restoredFrom,
                    pendingRemainingMs
                }
            }
        };
    }

    // --- GET /api/config/stage ---

    function getStage(ctx) {
        const staged = readStaged(configPath);
        const active = readJsonFile(configPath);
        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: {
                    exists: stagedExists(configPath),
                    staged: maskStagedSecrets(staged, plugins),
                    diff: computeConfigDiff(active, staged, plugins)
                }
            }
        };
    }

    // --- PUT /api/config/stage ---

    async function putStage(ctx) {
        let rawConfig;
        try {
            rawConfig = await readJsonBody(ctx.req);
        } catch (error) {
            return { statusCode: 400, body: { status: 'error', error: `Invalid JSON body: ${error.message}` } };
        }

        if (rawConfig === null || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
            return { statusCode: 400, body: { status: 'error', error: 'Body must be a config object' } };
        }

        try {
            const { fileConfig } = preValidateConfigFile(rawConfig, { environment, plugins });
            // UI/import не передают секреты — сохраняем $VAR-ссылки активного
            // конфига, чтобы diff был корректным и Apply не затирал их.
            const active = readJsonFile(configPath);
            const merged = mergePreservedSecrets(active, fileConfig);
            writeStaged(configPath, merged);
            logConfigAudit('config.stage', { configPath });
            return {
                statusCode: 200,
                body: {
                    status: 'ok',
                    data: {
                        staged: maskStagedSecrets(merged, plugins),
                        diff: computeConfigDiff(active, merged, plugins)
                    }
                }
            };
        } catch (error) {
            return validationErrorResponse(error);
        }
    }

    // --- POST /api/config/apply ---

    async function apply(ctx) {
        // Single-flight сначала: конфликт (409) не должен расходовать
        // слот sliding-window rate limit'а (ADR-0046).
        if (!tryAcquireMutation()) {
            return conflict();
        }

        try {
            const rate = mutationLimiter.tryAcquire();
            if (!rate.allowed) {
                return tooManyRequests(rate.waitMs);
            }
            if (!stagedExists(configPath)) {
                return { statusCode: 400, body: { status: 'error', error: 'Staged config not found — save changes first' } };
            }

            const staged = readStaged(configPath);
            const result = applyConfig(configPath, staged, {
                environment,
                plugins,
                logger,
                restart
            });

            state = {
                state: 'pending',
                reason: 'Apply initiated — waiting for restart',
                appliedAt: new Date().toISOString(),
                appliedHash: result.hash,
                appliedAtMs: Date.now(),
                restoredAt: null,
                restoredFrom: null
            };

            return {
                statusCode: 202,
                body: {
                    status: 'ok',
                    data: { hash: result.hash, lkgWritten: result.lkgWritten }
                }
            };
        } catch (error) {
            return validationErrorResponse(error);
        } finally {
            releaseMutation();
        }
    }

    // --- POST /api/config/rollback ---

    async function rollback(ctx) {
        // Single-flight сначала (409 не расходует слот rate limit'а).
        if (!tryAcquireMutation()) {
            return conflict();
        }

        try {
            const rate = mutationLimiter.tryAcquire();
            if (!rate.allowed) {
                return tooManyRequests(rate.waitMs);
            }
            const result = rollbackConfig(configPath, { environment, logger, restart });
            state = {
                state: 'rolled_back',
                reason: 'manual rollback',
                appliedAt: null,
                appliedHash: null,
                appliedAtMs: null,
                restoredAt: new Date().toISOString(),
                restoredFrom: 'manual'
            };
            return {
                statusCode: 202,
                body: {
                    status: 'ok',
                    data: { restoredFrom: result.restoredFrom }
                }
            };
        } catch (error) {
            return validationErrorResponse(error);
        } finally {
            releaseMutation();
        }
    }

    // --- GET /api/config/export ---

    function exportConfig(ctx) {
        const active = readJsonFile(configPath);
        const dump = buildExportConfig(active);
        const now = new Date();
        const ts = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
        return {
            statusCode: 200,
            headers: {
                'Content-Disposition': `attachment; filename="zyablik.config_${ts}.json"`
            },
            body: { status: 'ok', data: dump }
        };
    }

    // --- POST /api/config/import ---

    async function importConfig(ctx) {
        // Single-flight сначала (409 не расходует слот rate limit'а).
        if (!tryAcquireMutation()) {
            return conflict();
        }

        try {
            const rate = mutationLimiter.tryAcquire();
            if (!rate.allowed) {
                return tooManyRequests(rate.waitMs);
            }
            let rawConfig;
            try {
                rawConfig = await readJsonBody(ctx.req);
            } catch (error) {
                return { statusCode: 400, body: { status: 'error', error: `Invalid JSON body: ${error.message}` } };
            }

            if (rawConfig === null || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
                return { statusCode: 400, body: { status: 'error', error: 'Body must be a config object' } };
            }

            const { fileConfig } = preValidateConfigFile(rawConfig, { environment, plugins });
            // Сохраняем существующие секреты активного конфига (импорт обычно
            // редактирует несекретные поля).
            const active = readJsonFile(configPath);
            const merged = mergePreservedSecrets(active, fileConfig);
            writeStaged(configPath, merged);
            logConfigAudit('config.import', { configPath });
            return {
                statusCode: 200,
                body: {
                    status: 'ok',
                    data: {
                        staged: maskStagedSecrets(merged, plugins),
                        diff: computeConfigDiff(active, merged, plugins)
                    }
                }
            };
        } catch (error) {
            return validationErrorResponse(error);
        } finally {
            releaseMutation();
        }
    }

    // Подтверждение apply по готовности процесса (ready): снимает pending-маркер.
    function confirm() {
        const confirmed = confirmConfigApplied(configPath, { logger });
        if (confirmed) {
            state = {
                state: 'confirmed',
                reason: 'apply confirmed on ready',
                appliedAt: new Date().toISOString(),
                appliedHash: state.appliedHash,
                appliedAtMs: null,
                restoredAt: null,
                restoredFrom: null
            };
        }
        return confirmed;
    }

    function getApiStatus() {
        return { ...state };
    }

    return {
        getConfig,
        getSchema,
        getStatus,
        getStage,
        putStage,
        apply,
        rollback,
        exportConfig,
        importConfig,
        confirm,
        getApiStatus,
        _rateLimiter: mutationLimiter,
        _configPath: configPath
    };
}

// Нормализация ошибки валидации preValidateConfigFile → HTTP-ответ.
function validationErrorResponse(error) {
    const isValidation = error && (
        error.code === CONFIG_VALIDATION_ERROR_CODE ||
        error.code === SECRET_VAR_UNRESOLVED_ERROR_CODE
    );
    if (!isValidation) {
        throw error;
    }

    const details = error.details || {};
    const fieldErrors = (details.errors || []).map((item) => {
        if (item && typeof item === 'object') {
            return {
                field: item.key !== null && item.key !== undefined ? item.key : (item.section || null),
                section: item.section || null,
                reason: item.reason || ''
            };
        }
        return { field: null, section: null, reason: String(item) };
    });

    return {
        statusCode: 400,
        body: {
            status: 'error',
            error: error.message,
            code: error.code,
            errors: fieldErrors
        }
    };
}

module.exports = {
    MODULE_NAME,
    createConfigApi,
    createConfigMutationRateLimiter,
    computeConfigDiff,
    maskStagedSecrets,
    buildEffectiveSections,
    buildExportConfig,
    DEFAULT_MUTATION_MAX,
    DEFAULT_MUTATION_WINDOW_MS
};
