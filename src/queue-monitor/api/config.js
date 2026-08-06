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
// Мутирующие эндпоинты (stage/apply/rollback/import) — single-flight (409) +
// sliding-window rate limit (ADR-0046, отдельный пул от auth).

const { resolveConfigPath, CONFIG_VALIDATION_ERROR_CODE, SECRET_VAR_UNRESOLVED_ERROR_CODE } = require('../../bot-platform/core/config');
const { getMergedConfigSchema, SYSTEM_SCHEMA, SYSTEM_SECTION_KEYS, isVarReference } = require('../../bot-platform/core/config-schema');
const { CURRENT_VERSION } = require('../../bot-platform/core/config-migrations');
const {
    readStaged,
    readStagedSafe,
    writeStaged,
    stagedExists,
    clearStaged,
    readJsonFile,
    readJsonFileSafe,
    preValidateConfigFile,
    mergePreservedSecrets,
    applyConfig,
    rollbackConfig,
    confirmConfigApplied,
    readPending,
    pendingExists,
    computeConfigHash,
    serviceFilePaths,
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
    const pluginSchemas = buildPluginSchemas(plugins);

    function isSecretField(sectionName, key) {
        const schemaSection = SYSTEM_SCHEMA[sectionName];
        const field = schemaSection ? schemaSection[key] : null;
        return Boolean(field && field.secret);
    }

    // L1 (review R7): объявленное системной схемой поле (включая несекретные).
    // Необъявленный ключ — потенциальный секрет (асимметрия с плагинами,
    // m4): его значение не должно уходить в diff/маскированные ответы.
    function isDeclaredSystemField(sectionName, key) {
        const schemaSection = SYSTEM_SCHEMA[sectionName];
        const field = schemaSection ? schemaSection[key] : null;
        return Boolean(field);
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
                    if (isPluginSecretField(pluginSchemas, pluginName, key)) {
                        continue;
                    }
                    // Необъявленные configSchema ключи (ветка без configSchema)
                    // — потенциальные секреты: в diff не попадают (m4).
                    if (!isDeclaredPluginField(pluginSchemas, pluginName, key)) {
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
            // L1 (review R7): необъявленные ключи системных секций — те же
            // потенциальные секреты, что и необъявленные ключи плагинов (m4):
            // в diff не попадают, иначе литерал из ручной правки утекал бы в
            // stage/diff-ответы.
            if (!isDeclaredSystemField(sectionName, key)) {
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

// configSchema плагинов: pluginName → schema (для фильтрации секретов
// в ветках plugins.<name>.*).
function buildPluginSchemas(plugins = []) {
    const schemas = {};
    for (const plugin of plugins || []) {
        if (plugin && plugin.name && plugin.configSchema && typeof plugin.configSchema === 'object') {
            schemas[plugin.name] = plugin.configSchema;
        }
    }
    return schemas;
}

// Объявленное configSchema секретное поле ветки плагина.
function isPluginSecretField(pluginSchemas, pluginName, key) {
    const schema = pluginSchemas[pluginName];
    const field = schema ? schema[key] : null;
    return Boolean(field && field.secret);
}

// Объявленное configSchema НЕсекретное поле ветки плагина. Ветки без
// configSchema (неизвестный плагин) и необъявленные ключи не имеют таких
// полей — их значения считаются потенциальными секретами и не раскрываются
// (defense-in-depth, m4).
function isDeclaredPluginField(pluginSchemas, pluginName, key) {
    const schema = pluginSchemas[pluginName];
    const field = schema ? schema[key] : null;
    return Boolean(field && !field.secret);
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
        // L1 (review R7) + R8: необъявленные ключи системных секций — те же
        // потенциальные секреты, что и в ветках плагинов (m4). Без схемы
        // нельзя отличить настройку от литерального секрета, поэтому:
        // непустая строка ($VAR-ссылка или литерал) маскируется до
        // { secret: true, set }; нестроковое значение (объект/массив/число/
        // булево) отбрасывается целиком — структура/значение не утекают.
        // (GET /api/config не затронут — buildEffectiveSections отдаёт только
        // ключи схемы; здесь маскируется сам stage/diff-снапшот.)
        for (const [key, value] of Object.entries(masked)) {
            if (SYSTEM_SCHEMA[sectionName][key]) {
                continue;
            }
            if (typeof value === 'string') {
                if (value !== '') {
                    masked[key] = maskSecret(value);
                }
                continue;
            }
            delete masked[key];
        }
        result[sectionName] = masked;
    }

    const pluginSchemas = buildPluginSchemas(plugins);
    if (result.plugins && typeof result.plugins === 'object') {
        // L3 (review R4): Object.create(null) — если в plugins попадётся
        // ключ __proto__, присваивание в обычный {} меняло бы прототип
        // вместо создания свойства (данные терялись при JSON.stringify).
        const maskedPlugins = Object.create(null);
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
            // Defense-in-depth (m4): защита веток без configSchema и
            // необъявленных ключей. H3 (review): объявленные поля configSchema
            // (в т.ч. НЕсекретные — обычные значения, секреты уже замаскированы
            // в цикле выше) пропускаются. Необъявленный ключ: непустая строка
            // ($VAR-ссылка или литерал) маскируется до { secret, set };
            // нестроковое значение (объект/массив/число/булево) отбрасывается
            // целиком (R8: та же политика, что и для системных секций).
            for (const [key, value] of Object.entries(masked)) {
                if (schema && schema[key]) {
                    continue;
                }
                if (typeof value === 'string') {
                    if (value !== '') {
                        masked[key] = maskSecret(value);
                    }
                    continue;
                }
                delete masked[key];
            }
            maskedPlugins[pluginName] = masked;
        }
        result.plugins = maskedPlugins;
    }

    return result;
}

// F10-L1 (review R10): ключи, которые UI не сможет отредактировать и
// round-trip «форма → Save» молча потеряет. Это необъявленные ключи
// (системные секции и ветки плагинов), маскируемые/отбрасываемые в ответе,
// которых НЕТ в активном конфиге: mergePreservedSecrets доставляет их в
// staged только из активного, а пришедшие с импортом ничем не защищены.
// Ключи, уже присутствующие в активном конфиге, переживут Save (merge
// вернёт их) — в предупреждение не попадают. Возвращает массив строк
// "plugins.legacy.token" / "bot.extraKey".
function findUndeclaredMaskedKeys(fileConfig, activeConfig, plugins = []) {
    const warnings = [];
    if (!fileConfig || typeof fileConfig !== 'object') {
        return warnings;
    }
    const pluginSchemas = buildPluginSchemas(plugins);

    for (const sectionName of SYSTEM_SECTION_KEYS) {
        const section = fileConfig[sectionName];
        if (!section || typeof section !== 'object') {
            continue;
        }
        const activeSection = activeConfig && activeConfig[sectionName] && typeof activeConfig[sectionName] === 'object'
            ? activeConfig[sectionName] : {};
        for (const key of Object.keys(section)) {
            if (SYSTEM_SCHEMA[sectionName][key]) {
                continue;
            }
            if (activeSection[key] !== undefined) {
                continue;
            }
            warnings.push(`${sectionName}.${key}`);
        }
    }

    if (fileConfig.plugins && typeof fileConfig.plugins === 'object') {
        for (const [pluginName, pluginValue] of Object.entries(fileConfig.plugins)) {
            if (!pluginValue || typeof pluginValue !== 'object' || Array.isArray(pluginValue)) {
                continue;
            }
            const activePlugin = activeConfig && activeConfig.plugins && activeConfig.plugins[pluginName]
                && typeof activeConfig.plugins[pluginName] === 'object' && !Array.isArray(activeConfig.plugins[pluginName])
                ? activeConfig.plugins[pluginName] : {};
            const schema = pluginSchemas[pluginName];
            for (const key of Object.keys(pluginValue)) {
                if (schema && schema[key]) {
                    continue;
                }
                if (activePlugin[key] !== undefined) {
                    continue;
                }
                warnings.push(`plugins.${pluginName}.${key}`);
            }
        }
    }

    return warnings;
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

    const pluginSchemas = buildPluginSchemas(plugins);
    // L3 (review R4): Object.create(null) — защита от __proto__ как имени
    // плагина (присваивание в {} меняет прототип, JSON.stringify теряет).
    const pluginSection = Object.create(null);
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
            // Defense-in-depth (m4) + R8/N1: защита веток без configSchema и
            // необъявленных ключей — единая политика с maskStagedSecrets.
            // H3 (review): объявленные поля configSchema (секреты уже
            // замаскированы в цикле выше, НЕсекретные — обычные значения)
            // пропускаются. Необъявленный ключ: непустая строка ($VAR-ссылка
            // или литерал) маскируется до { secret, set }; нестроковое
            // значение (объект/массив/число/булево) отбрасывается целиком —
            // иначе в GET /api/config утекала бы структура ветки.
            for (const [key, value] of Object.entries(section)) {
                if (schema && schema[key]) {
                    continue;
                }
                if (typeof value === 'string') {
                    if (value !== '') {
                        section[key] = maskSecret(value);
                    }
                    continue;
                }
                delete section[key];
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

// Экспорт-дамп — резервная копия активного конфига для бэкапа/переноса.
// ADR-0045 требует, чтобы файл содержал только $VAR-ссылки (литеральные
// секреты — только в env/docker-секретах). R5-L1 (review PR #23): инвариант
// может быть нарушен вне apply-потока (ручная правка активного файла,
// stage-merge с повреждённым активным файлом и т.п.), а export — это output,
// уходящий наружу. Поэтому литерал в объявленном секретном поле заменяется
// на '' — бэкап не становится каналом утечки. $VAR-ссылки сохраняются.
function buildExportConfig(fileConfig, plugins = []) {
    if (!fileConfig || typeof fileConfig !== 'object') {
        return fileConfig || { version: CURRENT_VERSION, bot: {}, queue: {}, ingress: {}, monitor: {}, plugins: {} };
    }
    const result = { ...fileConfig };
    for (const sectionName of SYSTEM_SECTION_KEYS) {
        const section = result[sectionName];
        if (!section || typeof section !== 'object') {
            continue;
        }
        const masked = { ...section };
        for (const [key, field] of Object.entries(SYSTEM_SCHEMA[sectionName])) {
            if (field.secret && masked[key] !== undefined && !isVarReference(masked[key])) {
                masked[key] = '';
            }
        }
        result[sectionName] = masked;
    }
    const pluginSchemas = buildPluginSchemas(plugins);
    if (result.plugins && typeof result.plugins === 'object') {
        const maskedPlugins = Object.create(null);
        for (const [pluginName, pluginValue] of Object.entries(result.plugins)) {
            if (!pluginValue || typeof pluginValue !== 'object' || Array.isArray(pluginValue)) {
                maskedPlugins[pluginName] = pluginValue;
                continue;
            }
            const schema = pluginSchemas[pluginName];
            const masked = { ...pluginValue };
            if (schema) {
                for (const [key, field] of Object.entries(schema)) {
                    if (field.secret && masked[key] !== undefined && !isVarReference(masked[key])) {
                        masked[key] = '';
                    }
                }
            }
            maskedPlugins[pluginName] = masked;
        }
        result.plugins = maskedPlugins;
    }
    return result;
}

// Толерантное чтение активного конфига для просмотра/экспорта: повреждённый
// (невалидный JSON) файл не роняет API — возвращается { data: null,
// fileExists: true } (показ дефолтов). Карантин битого файла обрабатывает
// стартовый детектор (config-store.runStartupConfigDetector).
function readActiveConfigForDisplay(configPath) {
    try {
        const data = readJsonFile(configPath);
        return { data, fileExists: data !== null };
    } catch (error) {
        return { data: null, fileExists: true };
    }
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
    // R5-L3: момент старта этого процесса. Используется в getStatus, чтобы
    // отличить «рестарт ещё не произошёл» от «процесс уже перезапущен, ждём
    // confirm()»: если маркер pending написан предыдущим процессом, а этот
    // стартовал позже appliedAt — рестарт уже состоялся.
    const processStartedAtMs = Date.now();

    // R11-L3 (review PR #23): предупреждения loadConfig (неопознанные ключи,
    // устаревшие $VAR), накопленные в createCore. Пустой массив — когда
    // конфиг загрузился чисто или API создан вне app.js (юнит-тесты).
    const configWarnings = Array.isArray(options.configWarnings) ? options.configWarnings : [];

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
    // ADR-0046 (M6): результат стартового детектора (rolled_back/quarantine)
    // прокидывается из createCore через options.recovery. Без этого после
    // crash-restart баннер отката был бы недостижим: in-memory состояние API
    // каждый рестарт сбрасывалось в idle, хотя конфиг уже откатился к lkg.
    const recovery = options.recovery || null;
    if (recovery && (recovery.state === 'rolled_back' || recovery.state === 'quarantine')) {
        state = {
            state: recovery.state,
            reason: recovery.reason || null,
            appliedAt: null,
            appliedHash: null,
            appliedAtMs: null,
            restoredAt: new Date().toISOString(),
            restoredFrom: recovery.restoredFrom || null
        };
    }
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
        // отсутствии файла (показываем дефолты). Повреждённый файл не роняет
        // API (500): карантин битого файла — задача стартового детектора.
        const { data: fileConfig, fileExists } = readActiveConfigForDisplay(configPath);
        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: {
                    ...buildEffectiveSections(fileConfig, fileExists, plugins),
                    // R11-L3 (review PR #23): предупреждения loadConfig доступны
                    // UI (баннер на странице настроек), а не только в логах —
                    // иначе оператор не узнает о неопознанных ключах и
                    // устаревших $VAR, пока не откроет логи процесса.
                    warnings: configWarnings
                }
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
        // L2 (review R4): после crash-restart in-memory state сбрасывается
        // в idle, но pending-маркер на диске ещё жив — StartupWait окно
        // активно. Без этого /api/config/status показывал бы idle (баннер
        // pending не отрисовывался), хотя конфиг ещё не подтверждён.
        let effectiveState = state.state;
        let reason = state.reason;
        let restartInitiated = state.restartInitiated;
        let appliedAt = state.appliedAt;
        let appliedHash = state.appliedHash;
        let appliedAtMs = state.appliedAtMs;
        let restoredAt = state.restoredAt;
        let restoredFrom = state.restoredFrom;

        // Pending-маркер читается один раз: нужен и для вывода pending после
        // рестарта, и для согласованной базы pendingRemainingMs (L2 review).
        const pending = pendingExists(configPath) ? readPending(configPath) : null;

        if (effectiveState === 'idle' && pending && pending.hash) {
            const { configPath: activePath } = serviceFilePaths(configPath);
            const activeResult = readJsonFileSafe(activePath);
            const activeHash = activeResult.ok && activeResult.data !== null
                ? computeConfigHash(activeResult.data)
                : null;
            // Hash проверяется как в confirmConfigApplied: если активный
            // файл изменён вне apply-потока — маркер устарел, не показываем
            // ложный pending.
            if (activeHash !== null && pending.hash === activeHash) {
                effectiveState = 'pending';
                reason = 'Apply initiated — waiting for restart confirmation';
                restartInitiated = pending.restartInitiated;
                appliedAt = pending.appliedAt;
                appliedHash = pending.hash;
                appliedAtMs = pending.appliedAt
                    ? new Date(pending.appliedAt).getTime() || null
                    : null;
            }
        }

        // pendingRemainingMs — только для state=pending c авто-рестартом
        // (restartInitiated): при ручном рестарте окна StartupWait нет —
        // первый boot после Apply не откатывается по возрасту appliedAt.
        // L2 (review PR #23): UI-таймер считается от той же базы, что и откат
        // в runStartupConfigDetector. Детектор отсчитывает окно от lastBoot
        // (момент последнего реального старта), а не от appliedAt: appliedAt
        // включает время остановки + рестарт, и медленный, но штатный boot не
        // должен ложно откатываться. После первого boot детектор пишет
        // lastBoot в маркер — берём его; до него (первый boot после Apply или
        // apply ещё в этом процессе) — appliedAt.
        let pendingRemainingMs = null;
        if (effectiveState === 'pending' && restartInitiated) {
            let baseMs = null;
            if (pending && pending.lastBoot) {
                baseMs = new Date(pending.lastBoot).getTime() || null;
            } else if (appliedAtMs) {
                baseMs = appliedAtMs;
            }
            if (baseMs !== null) {
                pendingRemainingMs = Math.max(0, baseMs + startupWaitMs - Date.now());
            }
        }

        // R5-L3: рестарт уже состоялся, если текущий процесс стартовал ПОСЛЕ
        // Apply (appliedAt). В pending после рестарта баннер «перезапустите
        // вручную» вводил бы в заблуждение — оператор/авто-рестарт уже
        // перезапустил процесс, идёт окно подтверждения (confirm).
        // >= (не >): appliedAt пишется предыдущим процессом, текущий стартует
        // строго позже; совпадение миллисекунд возможно только в быстром
        // тесте и должно трактоваться как «рестарт состоялся».
        const restartHappened = Boolean(
            appliedAtMs && processStartedAtMs >= appliedAtMs
        );

        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: {
                    state: effectiveState,
                    reason,
                    restartInitiated: Boolean(restartInitiated),
                    restartHappened,
                    appliedAt,
                    appliedHash,
                    restoredAt,
                    restoredFrom,
                    pendingRemainingMs
                }
            }
        };
    }

    // --- GET /api/config/stage ---

    function getStage(ctx) {
        // Толерантное чтение: повреждённый staged/активный файл не роняет
        // API (500) — показывается как отсутствующий (карантин битого файла
        // обрабатывает стартовый детектор).
        let staged = null;
        try {
            staged = readStaged(configPath);
        } catch (error) {
            staged = null;
        }
        let active = null;
        try {
            active = readJsonFile(configPath);
        } catch (error) {
            active = null;
        }
        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: {
                    exists: stagedExists(configPath),
                    staged: maskStagedSecrets(staged, plugins),
                    // Без staged diff пуст: показывать активный конфиг как
                    // «удалён» (new:null) вводяще (review).
                    diff: staged === null ? [] : computeConfigDiff(active, staged, plugins),
                    // F10-L1 (review R10): предупреждение о ключах, которые
                    // форма не отредактирует и Save может потерять.
                    warnings: staged === null ? [] : findUndeclaredMaskedKeys(staged, active, plugins)
                }
            }
        };
    }

    // --- PUT /api/config/stage ---

    // Общий путь «сохранить в staged» для putStage и importConfig (M4 review):
    // единый код вместо дублирования, один порядок merge → preValidate → write.
    // L3 (review PR #23): валидация выполняется ПОСЛЕ слияния секретов
    // активного конфига (mergePreservedSecrets), как в applyConfig. Раньше
    // preValidate шёл до merge: литеральный секрет из ручной правки активного
    // файла переезжал в staged через merge (200 OK) и всплывал только на Apply
    // (400) — оператор не мог увидеть/исправить его в UI. Теперь такой staged
    // отклоняется на этапе редактирования (400 со списком полей).
    function stageConfig(rawConfig, auditAction) {
        let active = null;
        try {
            active = readJsonFile(configPath);
        } catch (error) {
            active = null;
        }
        const merged = mergePreservedSecrets(active, rawConfig, plugins);
        const { fileConfig } = preValidateConfigFile(merged, { environment, plugins });
        writeStaged(configPath, fileConfig);
        logConfigAudit(auditAction, { configPath });
        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: {
                    staged: maskStagedSecrets(fileConfig, plugins),
                    diff: computeConfigDiff(active, fileConfig, plugins),
                    // F10-L1 (review R10): необъявленные ключи, которые UI не
                    // отредактирует и round-trip «форма → Save» потеряет.
                    warnings: findUndeclaredMaskedKeys(fileConfig, active, plugins)
                }
            }
        };
    }

    async function putStage(ctx) {
        // Single-flight сначала: конфликт (409) не должен расходовать
        // слот sliding-window rate limit'а (ADR-0046).
        if (!tryAcquireMutation()) {
            return conflict();
        }

        try {
            // M1 (review R4): PUT /stage — мутирующая операция, должна
            // расходовать слот rate limit наравне с apply/rollback/import.
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

            try {
                return stageConfig(rawConfig, 'config.stage');
            } catch (error) {
                return validationErrorResponse(error);
            }
        } finally {
            releaseMutation();
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

            // review: битый staged (повреждённый JSON) не должен давать
            // 500 — Apply очищает его и возвращает 400 с понятным сообщением.
            const stagedRead = readStagedSafe(configPath);
            if (!stagedRead.ok) {
                clearStaged(configPath);
                logConfigAudit('config.apply.rejected_broken_staged', { configPath });
                return { statusCode: 400, body: { status: 'error', error: 'Staged config is broken — it has been cleared. Save changes again.' } };
            }

            const staged = stagedRead.data;
            const result = applyConfig(configPath, staged, {
                environment,
                plugins,
                logger,
                restart
            });

            const restartInitiated = restart !== null;
            state = {
                state: 'pending',
                reason: restartInitiated
                    ? 'Apply initiated — waiting for restart'
                    : 'Apply applied — restart the process manually',
                restartInitiated,
                // appliedAt/время окна StartupWait имеют смысл только при
                // авто-рестарте: при ручном рестарте окна нет, и timestamp
                // apply в статусе вводил бы в заблуждение (review).
                appliedAt: restartInitiated ? new Date().toISOString() : null,
                appliedHash: result.hash,
                appliedAtMs: restartInitiated ? Date.now() : null,
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
            // M3 (review R5): plugins передаются в rollbackConfig — валидация
            // lkg по configSchema плагинов (как в apply/detector/import).
            const result = rollbackConfig(configPath, { environment, plugins, logger, restart });
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
        // Толерантное чтение: повреждённый файл не роняет API (500) — дамп
        // пустого конфига (карантин битого файла — задача стартового детектора).
        let active = null;
        try {
            active = readJsonFile(configPath);
        } catch (error) {
            active = null;
        }
        const dump = buildExportConfig(active, plugins);
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

            return stageConfig(rawConfig, 'config.import');
        } catch (error) {
            return validationErrorResponse(error);
        } finally {
            releaseMutation();
        }
    }

    // Подтверждение apply по готовности процесса (ready): снимает pending-маркер.
    function confirm() {
        // После ручного рестарта in-memory appliedHash === null (apply был в
        // прошлом процессе), а pending.hash фиксирует применённый конфиг.
        // Читаем hash до снятия маркера, чтобы статус сохранил его.
        const pending = pendingExists(configPath) ? readPending(configPath) : null;
        const pendingHash = pending && pending.hash ? pending.hash : null;
        const confirmed = confirmConfigApplied(configPath, { logger });
        if (confirmed) {
            state = {
                state: 'confirmed',
                reason: 'apply confirmed on ready',
                appliedAt: new Date().toISOString(),
                appliedHash: state.appliedHash || pendingHash || null,
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
    findUndeclaredMaskedKeys,
    buildExportConfig,
    DEFAULT_MUTATION_MAX,
    DEFAULT_MUTATION_WINDOW_MS
};
