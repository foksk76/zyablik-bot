// SPDX-License-Identifier: Apache-2.0
'use strict';

// ADR-0045: жизненный цикл применения конфигурации.
// Служебные файлы в каталоге активного конфига:
//   zyablik.config.json            — активный конфиг
//   zyablik.config.json.lkg     — last known good (копия активного перед Apply)
//   zyablik.config.json.pending    — pending-маркер (содержит хеш применяемого конфига)
//   zyablik.config.bad.json        — карантин невалидного файла
//   zyablik.config.staged.json     — полный снапшот для Stage→Apply
//
// Запись конфига и staged — атомарная (temp + rename). lkg — простая
// ротация бэкапов. БД не используется (ADR-0045: конфигурация — файл).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
    createConfigError,
    CONFIG_VALIDATION_ERROR_CODE,
    SECRET_VAR_UNRESOLVED_ERROR_CODE
} = require('./config');
const {
    validateConfigFile,
    isVarReference,
    SYSTEM_SCHEMA,
    SYSTEM_SECTION_KEYS
} = require('./config-schema');
const { prepareConfigForLoad } = require('./config-migrations');

const LKG_SUFFIX = '.lkg';
const PENDING_SUFFIX = '.pending';
const BAD_SUFFIX = '.bad.json';
const STAGED_SUFFIX = '.staged.json';

const DEFAULT_STARTUP_WAIT_MS = 30_000;
// Максимум стартов без подтверждения (ready), после чего pending считается
// crash-loop'ом и откатывается к lkg (защита от бесконечного рестарта).
// boots инкрементируется ДО проверки и включает текущий старт, поэтому
// откат происходит на (maxStartupAttempts+1)-м старте без подтверждения,
// т.е. после maxStartupAttempts неудачных попыток.
const DEFAULT_MAX_STARTUP_ATTEMPTS = 5;

// ADR-0029: аудит-события конфигурации (ADR-0045).
// Формат — как в существующем audit (delivery/auth): module=config,
// action=config.*, context без литеральных секретов.
function logConfigAudit(logger, action, context) {
    if (!logger || typeof logger.info !== 'function') {
        return;
    }
    logger.info({
        level: 'info',
        module: 'config',
        action,
        context
    });
}

function appendSuffix(filePath, suffix) {
    return `${filePath}${suffix}`;
}

function serviceFilePaths(configPath) {
    return {
        configPath,
        lkgPath: appendSuffix(configPath, LKG_SUFFIX),
        pendingPath: appendSuffix(configPath, PENDING_SUFFIX),
        badPath: appendSuffix(configPath, BAD_SUFFIX),
        stagedPath: appendSuffix(configPath, STAGED_SUFFIX)
    };
}

// Толерантное чтение JSON-файла без raw-исключений: повреждённый (невалидный)
// JSON возвращает { ok:false, error } вместо бросания SyntaxError. Используется
// стартовым детектором, чтобы коррупция активного конфига попадала в карантин
// и восстановление из lkg, а не роняла процесс на битом файле.
// Нормальный результат: { ok:true, data } (data === null, если файла нет).
function readJsonFileSafe(filePath) {
    if (!fs.existsSync(filePath)) {
        return { ok: true, data: null };
    }
    try {
        return { ok: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
    } catch (error) {
        return { ok: false, error };
    }
}

function readJsonFile(filePath) {
    const result = readJsonFileSafe(filePath);
    if (!result.ok) {
        throw result.error;
    }
    return result.data;
}

function atomicWriteJson(filePath, value) {
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        fs.renameSync(tempPath, filePath);
    } catch (error) {
        // Не оставлять .tmp-мусор после сбоя (падение записи, диск заполнен).
        removeFileIfExists(tempPath);
        throw error;
    }
}

function writeMarker(filePath, content) {
    atomicWriteJson(filePath, content);
}

function removeFileIfExists(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function computeConfigHash(fileConfig) {
    return crypto.createHash('sha256').update(JSON.stringify(fileConfig)).digest('hex');
}

// --- Staged (Task 1) ---

function writeStaged(configPath, fileConfig) {
    const { stagedPath } = serviceFilePaths(configPath);
    atomicWriteJson(stagedPath, fileConfig);
    return stagedPath;
}

function readStaged(configPath) {
    const { stagedPath } = serviceFilePaths(configPath);
    return readJsonFile(stagedPath);
}

// review: терпимое чтение staged для Apply — битый staged (повреждённый
// JSON) не должен давать 500: Apply вернёт 400 и очистит битый staged.
function readStagedSafe(configPath) {
    const { stagedPath } = serviceFilePaths(configPath);
    return readJsonFileSafe(stagedPath);
}

function clearStaged(configPath) {
    const { stagedPath } = serviceFilePaths(configPath);
    removeFileIfExists(stagedPath);
}

function stagedExists(configPath) {
    const { stagedPath } = serviceFilePaths(configPath);
    return fs.existsSync(stagedPath);
}

// --- lkg (Tasks 2-4) ---

function writeLkg(configPath, fileConfig) {
    const { lkgPath } = serviceFilePaths(configPath);
    atomicWriteJson(lkgPath, fileConfig);
    return lkgPath;
}

function readLkg(configPath) {
    const { lkgPath } = serviceFilePaths(configPath);
    return readJsonFile(lkgPath);
}

function lkgExists(configPath) {
    const { lkgPath } = serviceFilePaths(configPath);
    return fs.existsSync(lkgPath);
}

// --- Pending-маркер (Task 3) ---
// Поля: hash (применяемого конфига), appliedAt (момент Apply), lastBoot
// (последний старт процесса), boots (счётчик стартов без подтверждения),
// restartInitiated (инициировал ли Apply рестарт сам — см. стартовый детектор).
function writePending(configPath, fileConfig, appliedAt = new Date(), options = {}) {
    const { pendingPath } = serviceFilePaths(configPath);
    writeMarker(pendingPath, {
        hash: computeConfigHash(fileConfig),
        appliedAt: new Date(appliedAt).toISOString(),
        restartInitiated: options.restartInitiated === true
    });
}

function readPending(configPath) {
    const { pendingPath } = serviceFilePaths(configPath);
    // Повреждённый pending-маркер приравнивается к отсутствующему: маркер —
    // производные данные, а не конфиг, и не должен блокировать старт.
    const result = readJsonFileSafe(pendingPath);
    if (!result.ok || !result.data) {
        return null;
    }
    const marker = result.data;
    return {
        hash: typeof marker.hash === 'string' ? marker.hash : null,
        appliedAt: typeof marker.appliedAt === 'string' ? marker.appliedAt : null,
        lastBoot: typeof marker.lastBoot === 'string' ? marker.lastBoot : null,
        boots: typeof marker.boots === 'number' ? marker.boots : null,
        // Отсутствие поля в старых маркерах = ручной режим (рестарт наружу не
        // делегировался — в проде apply всегда был ручным).
        restartInitiated: marker.restartInitiated === true
    };
}

function clearPending(configPath) {
    const { pendingPath } = serviceFilePaths(configPath);
    removeFileIfExists(pendingPath);
}

function pendingExists(configPath) {
    const { pendingPath } = serviceFilePaths(configPath);
    return fs.existsSync(pendingPath);
}

// --- Карантин (Task 3) ---

// Карантин активного файла: перемещение в уникальный bad-файл с временной
// меткой, чтобы повторный карантин не затирал предыдущий невалидный конфиг
// (сохранение улик для диагностики). Имя строится от пути без расширения
// .json (если оно есть): для имени файла без .json наивный
// configPath.replace(/\.json$/, ...) возвращал бы configPath без замены, и
// renameSync стал бы no-op — невалидный файл затирался бы без улики.
function quarantineActiveFile(configPath) {
    const { configPath: activePath } = serviceFilePaths(configPath);
    const base = configPath.replace(/\.json$/, '');
    const badPath = `${base}.${Date.now()}.bad.json`;
    fs.renameSync(activePath, badPath);
    return badPath;
}

// --- Pre-validate (Task 2) ---

// Полная предварительная валидация staged/файла перед применением:
// JSON-структура, version, схема, литеральные секреты, $VAR-резолв.
// dryRun: options.validators — injected hooks для внешних проверок
// (например, dry-run старта). Возвращает { fileConfig, hash } или бросает
// CONFIG_VALIDATION_ERROR.
function preValidateConfigFile(rawConfig, options = {}) {
    const environment = options.environment || process.env;
    const prepared = prepareConfigForLoad(rawConfig);
    if (prepared.error) {
        throw createConfigError(CONFIG_VALIDATION_ERROR_CODE, prepared.error, {
            reason: 'version'
        });
    }

    const fileConfig = prepared.config;
    const validation = validateConfigFile(fileConfig, { plugins: options.plugins });
    if (validation.errors.length > 0) {
        throw createConfigError(CONFIG_VALIDATION_ERROR_CODE, 'Конфиг-файл не прошёл валидацию', {
            errors: validation.errors,
            reason: 'schema'
        });
    }

    // $VAR-резолв секретов (fail-fast) без записи — резолв в памяти.
    const secretErrors = [];
    for (const sectionName of SYSTEM_SECTION_KEYS) {
        const sectionValue = fileConfig[sectionName];
        if (sectionValue === undefined || sectionValue === null) {
            continue;
        }
        for (const [key, field] of Object.entries(SYSTEM_SCHEMA[sectionName])) {
            if (!field.secret) {
                continue;
            }
            const value = sectionValue[key];
            if (typeof value !== 'string' || !isVarReference(value)) {
                continue;
            }
            const varName = value.slice(1);
            const envValue = environment && typeof environment[varName] === 'string'
                ? environment[varName].trim()
                : '';
            if (envValue === '') {
                secretErrors.push({
                    key: field.flat,
                    reason: `$VAR-ссылка ${value} не разрешена: переменная ${varName} не задана`
                });
            }
        }
    }
    if (secretErrors.length > 0) {
        throw createConfigError(SECRET_VAR_UNRESOLVED_ERROR_CODE, 'Не разрешённые $VAR-ссылки секретов', {
            errors: secretErrors
        });
    }

    if (typeof options.additionalValidators === 'function') {
        options.additionalValidators(fileConfig);
    }

    return { fileConfig, hash: computeConfigHash(fileConfig) };
}

// --- Apply (Task 2) ---

// UI/import не передают секретные поля (buildStagedConfig их пропускает,
// export-дамп маскирует). При применении сохраняем существующие $VAR-ссылки
// из активного конфига, чтобы не затирать секреты при частичном обновлении
// (ADR-0045/0046). H2 (review): то же для плагинов — объявленные configSchema
// секреты и любые НЕобъявленные ключи веток plugins.<name>.* (которые UI не
// знает и потому не передаёт).
function mergePreservedSecrets(activeConfig, fileConfig, plugins = []) {
    if (!activeConfig || !fileConfig) {
        return fileConfig;
    }
    for (const sectionName of SYSTEM_SECTION_KEYS) {
        const activeSection = activeConfig[sectionName];
        const fileSection = fileConfig[sectionName];
        if (!activeSection || !fileSection || typeof activeSection !== 'object' || typeof fileSection !== 'object') {
            continue;
        }
        for (const [key, field] of Object.entries(SYSTEM_SCHEMA[sectionName])) {
            if (!field.secret) {
                continue;
            }
            if (fileSection[key] === undefined && activeSection[key] !== undefined) {
                fileSection[key] = activeSection[key];
            }
        }
    }

    // Плагины (H2): активная ветка plugins.<name>.* сохраняется настолько,
    // насколько её не знает новый конфиг:
    //   1) объявленные configSchema секретные поля — как системные секреты;
    //   2) НЕобъявленные ключи (в т.ч. вся ветка плагина без configSchema) —
    //      buildStagedConfig переносит только известные схеме несекретные поля,
    //      поэтому лишние ключи активного конфига должны доживать до файла.
    const activePlugins = activeConfig.plugins;
    const filePlugins = fileConfig.plugins;
    if (activePlugins && filePlugins
        && typeof activePlugins === 'object' && !Array.isArray(activePlugins)
        && typeof filePlugins === 'object' && !Array.isArray(filePlugins)) {
        const schemasByName = new Map();
        for (const plugin of plugins || []) {
            if (plugin && typeof plugin.name === 'string' && plugin.configSchema && typeof plugin.configSchema === 'object') {
                schemasByName.set(plugin.name, plugin.configSchema);
            }
        }
        for (const [pluginName, filePlugin] of Object.entries(filePlugins)) {
            const activePlugin = activePlugins[pluginName];
            if (!activePlugin || typeof activePlugin !== 'object' || Array.isArray(activePlugin)) {
                continue;
            }
            if (!filePlugin || typeof filePlugin !== 'object' || Array.isArray(filePlugin)) {
                continue;
            }
            const schema = schemasByName.get(pluginName);
            for (const [key, activeValue] of Object.entries(activePlugin)) {
                if (filePlugin[key] !== undefined) {
                    continue;
                }
                const field = schema ? schema[key] : null;
                const declaredSecret = Boolean(field && field.secret);
                const undeclared = schema === undefined || !(key in schema);
                if (declaredSecret || undeclared) {
                    filePlugin[key] = activeValue;
                }
            }
        }
    }

    return fileConfig;
}

// Apply: pre-validate → lkg → атомарный write → staged очистка → рестарт.
// options: { environment, restart } (restart — async функция, в тестах фейк).
// Возвращает { hash, fileConfig, lkgWritten, restarted }.
function applyConfig(configPath, fileConfig, options = {}) {
    const environment = options.environment || process.env;
    const { lkgPath, configPath: activePath } = serviceFilePaths(configPath);

    // 1. Сохраняем существующие секреты активного конфига (UI их не шлёт).
    // Повреждённый активный файл не должен блокировать Apply: секреты не
    // сохраняются, lkg не пишется (нечего бэкапить).
    const activeResult = readJsonFileSafe(activePath);
    const activeConfig = activeResult.ok ? activeResult.data : null;
    const fileConfigToWrite = mergePreservedSecrets(activeConfig, fileConfig, options.plugins);

    // 2. pre-validate (не трогает активный конфиг при отказе). Нормализованный
    // fileConfig (явный version) пишем на диск и в pending — иначе versionless
    // конфиг уходил бы в файл без version, а возвращаемый hash (от
    // нормализованного) не совпадал бы с pending.hash (M1, review R12).
    const { fileConfig: normalizedConfig, hash } = preValidateConfigFile(fileConfigToWrite, {
        environment,
        plugins: options.plugins
    });

    // 3. lkg = копия активного (до записи нового).
    let lkgWritten = false;
    if (activeConfig !== null) {
        writeLkg(configPath, activeConfig);
        lkgWritten = true;
    }

    // 3. Pending-маркер: фиксирует хеш применяемого конфига до рестарта.
    // По готовности (ready) маркер снимается (config.confirmed). Краш до
    // ready → при следующем запуске авто-откат на lkg. restartInitiated
    // сообщает детектору, что рестарт инициировал сам Apply (окно StartupWait
    // отсчитывается от appliedAt); при ручном рестарте окно по appliedAt не
    // применяется (задержка между Apply и рестартом не признак краша).
    writePending(configPath, normalizedConfig, new Date(), {
        restartInitiated: typeof options.restart === 'function'
    });
    logConfigAudit(options.logger, 'config.pending', {
        configPath: activePath,
        hash,
        restartInitiated: typeof options.restart === 'function'
    });

    // 4. Атомарный write активного конфига.
    atomicWriteJson(activePath, normalizedConfig);

    // 5. Очистка staged после успешного Apply.
    clearStaged(configPath);
    logConfigAudit(options.logger, 'config.applied', {
        configPath,
        hash,
        lkgWritten,
        restarted: typeof options.restart === 'function'
    });

    // 6. Инициализация рестарта (delegated наружу).
    let restarted = false;
    if (typeof options.restart === 'function') {
        options.restart({ configPath, hash, lkgPath });
        restarted = true;
    }

    return { hash, fileConfig: normalizedConfig, lkgWritten, restarted };
}

// --- Стартовый детектор + авто-откат (Task 3) ---

// Стартовый детектор: вызывается до создания сервисов (после plugin-loader).
// Возвращает { state, reason, restoredFrom, quarantinePath, fileConfig }.
// state: 'ok' | 'quarantine' | 'rolled_back' | 'refused' (имена — по ADR-0046)
function runStartupConfigDetector(configPath, options = {}) {
    const { configPath: activePath, pendingPath, lkgPath } = serviceFilePaths(configPath);
    // Толерантное чтение: коррупция (невалидный JSON) активного/lkg файла не
    // роняет детектор raw-исключением, а попадает в ветки карантина/отказа —
    // иначе битый файл обходил бы всю защиту ADR-0045.
    const activeResult = readJsonFileSafe(activePath);
    const lkgResult = readJsonFileSafe(lkgPath);
    const pending = readPending(configPath);
    const active = activeResult.ok ? activeResult.data : null;
    const lkg = lkgResult.ok ? lkgResult.data : null;
    const activeReadError = activeResult.ok ? null : activeResult.error;
    const lkgReadError = lkgResult.ok ? null : lkgResult.error;

    // 1. Валидационный отказ активного файла (включая коррупцию JSON) →
    // карантин + восстановление lkg.
    if (active !== null || activeReadError !== null) {
        let validationError = activeReadError;
        if (validationError === null) {
            try {
                preValidateConfigFile(active, {
                    environment: options.environment || process.env,
                    plugins: options.plugins
                });
            } catch (error) {
                validationError = error;
            }
        }
        if (validationError !== null) {
            if (lkg === null || lkgReadError !== null) {
                logConfigAudit(options.logger, 'config.validate_failed', {
                    configPath: activePath,
                    reason: validationError.message,
                    recovered: false
                });
                return {
                    state: 'refused',
                    reason: `активный конфиг невалиден (${validationError.message}) и нет lkg для восстановления`,
                    fileConfig: null
                };
            }
            try {
                preValidateConfigFile(lkg, {
                    environment: options.environment || process.env,
                    plugins: options.plugins
                });
            } catch (lkgError) {
                logConfigAudit(options.logger, 'config.validate_failed', {
                    configPath: activePath,
                    reason: lkgError.message,
                    recovered: false
                });
                return {
                    state: 'refused',
                    reason: `lkg тоже невалиден (${lkgError.message}) — отказ старта (fail loudly)`,
                    fileConfig: null
                };
            }
            const quarantinePath = quarantineActiveFile(configPath);
            atomicWriteJson(activePath, lkg);
            // Активный конфиг карантинирован, восстановлен lkg — pending-маркер
            // неактуален: confirm() по ready не должен «подтверждать» откаченный
            // конфиг (ложный config.confirmed). Снимаем его здесь, как это
            // делают обе rollback-ветки ниже.
            clearPending(configPath);
            clearStaged(configPath);
            logConfigAudit(options.logger, 'config.quarantine', {
                configPath: activePath,
                quarantinePath,
                reason: validationError.message
            });
            return {
                state: 'quarantine',
                reason: validationError.message,
                restoredFrom: 'lkg',
                quarantinePath,
                fileConfig: lkg
            };
        }
    }

    // 2. Pending-маркер. ADR-0045: подтверждающий режим с окном StartupWait.
    // База отсчёта окна — момент последнего старта (lastBoot), а не
    // appliedAt: appliedAt ставится процессом, который писал Apply, и
    // включает время остановки + рестарт. Медленный, но штатный boot не
    // должен ложно откатываться.
    //
    // Первый boot после Apply (lastBoot ещё не записан): окно стартует с
    // момента первого boot — в том числе для restartInitiated (L3 review):
    // appliedAt включает задержку рестарт-цикла, и медленный, но штатный
    // рестарт не должен ложно откатываться. Без авто-рестарта первый boot
    // продолжается вовсе без окна (задержка между Apply и ручным рестартом
    // оператора — не признак краша).
    //
    // Счётчик boots защищает от бесконечного crash-loop: конфиг, падающий
    // до ready, откатывается после maxStartupAttempts стартов — независимо
    // от того, авто- или ручной рестарт.
    if (pending !== null) {
        // L2 (review): pending.hash фиксирует конфиг, который записал Apply.
        // Если активный файл с тех пор изменён (ручная правка или внешняя
        // синхронизация), подтверждать его по готовности нельзя — иначе
        // config.confirmed зафиксирует конфиг вне жизненного цикла
        // staged→Apply→lkg, а авто-откат мог бы затереть правку оператора.
        // Снимаем устаревший маркер и продолжаем с валидированного активного
        // файла без окна StartupWait (hash сходится в штатном потоке:
        // applyConfig пишет pending.hash и активный файл из одного объекта).
        const activeHash = active !== null ? computeConfigHash(active) : null;
        if (activeHash === null || pending.hash !== activeHash) {
            clearPending(configPath);
            clearStaged(configPath);
            logConfigAudit(options.logger, 'config.pending_stale', {
                configPath: activePath,
                reason: 'hash активного файла не совпадает с pending.hash — маркер снят, окно StartupWait отменено',
                pendingHash: pending.hash,
                activeHash: activeHash === null ? null : activeHash
            });
            return {
                state: 'ok',
                reason: 'pending-маркер устарел (активный файл изменён после Apply) — продолжаем с текущего файла',
                fileConfig: active
            };
        }

        const startupWaitMs = options.startupWaitMs || DEFAULT_STARTUP_WAIT_MS;
        const maxStartupAttempts = options.maxStartupAttempts || DEFAULT_MAX_STARTUP_ATTEMPTS;
        const lastBootMs = pending.lastBoot ? Date.parse(pending.lastBoot) : null;
        const appliedAtMs = pending.appliedAt ? Date.parse(pending.appliedAt) : null;
        // Окно StartupWait отсчитывается от lastBoot (последний реальный старт).
        // Для первого boot после Apply — от appliedAt, но только если рестарт
        // инициировал сам Apply (restartInitiated): иначе appliedAt отражает
        // задержку между Apply и ручным рестартом оператора, а не краш.
        const hasWindow = Number.isFinite(lastBootMs)
            || (pending.restartInitiated && Number.isFinite(appliedAtMs));
        let pendingAgeMs;
        if (Number.isFinite(lastBootMs)) {
            pendingAgeMs = Date.now() - lastBootMs;
        } else {
            // L3 (review): для restartInitiated окно StartupWait стартует с
            // момента первого boot, а не от appliedAt. appliedAt включает
            // задержку рестарт-цикла (graceful stop до 90с + старт) — при
            // медленном, но штатном рестарте окно от appliedAt истекло бы до
            // старта процесса и дало ложный откат. Crash-loop по-прежнему
            // ловится счётчиком boots (и старым lastBoot на следующих boot).
            pendingAgeMs = 0;
        }
        const boots = (typeof pending.boots === 'number' && pending.boots >= 0) ? pending.boots + 1 : 1;
        const crashLoop = boots > maxStartupAttempts;

        if (!crashLoop && pendingAgeMs < startupWaitMs) {
            // Штатный restart после Apply (окно не истекло) ИЛИ первый boot без
            // авто-рестарта (окно не применяется) — продолжаем с нового конфига
            // и фиксируем в маркере факт старта (lastBoot) + счётчик попыток.
            writeMarker(pendingPath, {
                hash: pending.hash,
                appliedAt: pending.appliedAt,
                restartInitiated: pending.restartInitiated,
                lastBoot: new Date().toISOString(),
                boots
            });
            const reason = hasWindow
                ? 'pending-маркер свежий (штатный restart после Apply, окно StartupWait)'
                : 'pending-маркер без авто-рестарта — продолжаем без окна StartupWait';
            logConfigAudit(options.logger, 'config.pending', {
                configPath: activePath,
                reason,
                pendingAgeMs,
                boots,
                restartInitiated: pending.restartInitiated
            });
            return {
                state: 'ok',
                reason,
                fileConfig: active
            };
        }

        if (lkg === null || lkgReadError !== null) {
            return {
                state: 'ok',
                reason: 'pending-маркер есть, но lkg отсутствует или повреждён — откат невозможен, продолжаем',
                fileConfig: active
            };
        }
        try {
            preValidateConfigFile(lkg, {
                environment: options.environment || process.env,
                plugins: options.plugins
            });
        } catch (lkgError) {
            logConfigAudit(options.logger, 'config.rollback', {
                configPath: activePath,
                reason: `невалидный lkg: ${lkgError.message}`,
                success: false
            });
            return {
                state: 'refused',
                reason: `pending + невалидный lkg (${lkgError.message}) — отказ старта (fail loudly)`,
                fileConfig: null
            };
        }
        // Авто-откат к lkg: активный файл (применённый конфиг, возможно с
        // ручной правкой после Apply) сохраняется в карантин как улика,
        // маркер снимается (lkg подтверждён), staged очищается.
        const rollbackReason = crashLoop
            ? `конфиг не подтверждён после ${maxStartupAttempts} стартов (crash-loop до ready)`
            : 'предыдущий Apply не подтверждён (краш до ready)';
        let quarantinePath = null;
        if (fs.existsSync(activePath)) {
            quarantinePath = quarantineActiveFile(configPath);
        }
        atomicWriteJson(activePath, lkg);
        clearPending(configPath);
        clearStaged(configPath);
        logConfigAudit(options.logger, 'config.rollback', {
            configPath: activePath,
            reason: rollbackReason,
            auto: true,
            restoredFrom: 'lkg',
            quarantinePath: quarantinePath || undefined,
            success: true
        });
        return {
            state: 'rolled_back',
            reason: `${rollbackReason}, восстановлен lkg`,
            restoredFrom: 'lkg',
            quarantinePath,
            fileConfig: lkg
        };
    }

    return { state: 'ok', reason: null, fileConfig: active };
}

// Подтверждение конфига по готовности (ready): снятие pending-маркера.
// Возвращает true, если маркер был снят.
function confirmConfigApplied(configPath, options = {}) {
    if (!pendingExists(configPath)) {
        return false;
    }
    const pending = readPending(configPath);
    // L2 (review): подтверждаем только конфиг, соответствующий pending.hash
    // (файл, который записал Apply). Если активный файл изменён после Apply —
    // маркер устарел: снимаем его и не фиксируем config.confirmed.
    const { configPath: activePath } = serviceFilePaths(configPath);
    const activeResult = readJsonFileSafe(activePath);
    const activeHash = activeResult.ok && activeResult.data !== null
        ? computeConfigHash(activeResult.data)
        : null;
    if (activeHash === null || pending.hash !== activeHash) {
        clearPending(configPath);
        logConfigAudit(options.logger, 'config.pending_stale', {
            configPath: activePath,
            reason: 'confirm: hash активного файла не совпадает с pending.hash — конфиг не подтверждён',
            pendingHash: pending.hash,
            activeHash: activeHash === null ? null : activeHash
        });
        return false;
    }
    clearPending(configPath);
    logConfigAudit(options.logger, 'config.confirmed', {
        configPath,
        hash: pending ? pending.hash : undefined
    });
    return true;
}

// --- Ручной rollback (Task 4) ---

// Восстановление lkg + рестарт. Ручной rollback снимает pending-маркер
// (явное решение оператора — повторный авто-откат не нужен) и очищает staged.
// options: { restart, environment, plugins }.
// M3 (review R5): плагины передаются в preValidateConfigFile — иначе ветка
// плагина в lkg, нарушающая configSchema, прошла бы ручной rollback, но
// упала бы в детекторе на следующем boot (несогласованная поверхность
// валидации apply/detector/import vs rollback).
// M1 (review R6): битый lkg (коррупция JSON) читается толерантно и
// превращается в CONFIG_VALIDATION_ERROR (400), а не raw SyntaxError (500).
// Откат — самая аварийная операция, и именно в ней битый lkg наиболее
// вероятен; остальное окружение уже толерантно (readJsonFileSafe:
// детектор, apply, getStage, getConfig).
// L2 (review R7): текущий активный файл перед записью lkg карантинится
// (асимметрия с авто-откатом, который сохраняет «плохой» конфиг как улику).
// Худший случай — битый JSON активного файла: ручной rollback не должен
// молча затирать его без улики.
function rollbackConfig(configPath, options = {}) {
    const { configPath: activePath, lkgPath } = serviceFilePaths(configPath);
    const lkgResult = readJsonFileSafe(lkgPath);
    if (!lkgResult.ok) {
        throw createConfigError(CONFIG_VALIDATION_ERROR_CODE, 'lkg повреждён — rollback невозможен', {
            reason: 'corrupt-lkg'
        });
    }
    const lkg = lkgResult.data;

    if (lkg === null) {
        throw createConfigError(CONFIG_VALIDATION_ERROR_CODE, 'Нет lkg для восстановления (rollback невозможен)');
    }

    const environment = options.environment || process.env;
    const plugins = options.plugins || [];
    preValidateConfigFile(lkg, { environment, plugins });

    let quarantinePath = null;
    if (fs.existsSync(activePath)) {
        quarantinePath = quarantineActiveFile(configPath);
    }
    atomicWriteJson(activePath, lkg);
    clearPending(configPath);
    clearStaged(configPath);

    logConfigAudit(options.logger, 'config.rollback', {
        configPath: activePath,
        auto: false,
        restoredFrom: 'lkg',
        quarantinePath,
        success: true
    });

    let restarted = false;
    if (typeof options.restart === 'function') {
        options.restart({ configPath });
        restarted = true;
    }

    return { restoredFrom: 'lkg', restarted, fileConfig: lkg, quarantinePath };
}

module.exports = {
    serviceFilePaths,
    readJsonFile,
    readJsonFileSafe,
    atomicWriteJson,
    computeConfigHash,
    writeStaged,
    readStaged,
    readStagedSafe,
    clearStaged,
    stagedExists,
    writeLkg,
    readLkg,
    lkgExists,
    writePending,
    readPending,
    clearPending,
    pendingExists,
    quarantineActiveFile,
    preValidateConfigFile,
    mergePreservedSecrets,
    applyConfig,
    runStartupConfigDetector,
    confirmConfigApplied,
    rollbackConfig,
    logConfigAudit,
    DEFAULT_STARTUP_WAIT_MS,
    DEFAULT_MAX_STARTUP_ATTEMPTS,
    LKG_SUFFIX,
    PENDING_SUFFIX,
    BAD_SUFFIX,
    STAGED_SUFFIX
};
