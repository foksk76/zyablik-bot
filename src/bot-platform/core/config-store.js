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
const { validateConfigFile, isVarReference } = require('./config-schema');
const { prepareConfigForLoad } = require('./config-migrations');

const LKG_SUFFIX = '.lkg';
const PENDING_SUFFIX = '.pending';
const BAD_SUFFIX = '.bad.json';
const STAGED_SUFFIX = '.staged.json';

const DEFAULT_STARTUP_WAIT_MS = 30_000;

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

function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function atomicWriteJson(filePath, value) {
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
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

function writePending(configPath, fileConfig, appliedAt = new Date()) {
    const { pendingPath } = serviceFilePaths(configPath);
    writeMarker(pendingPath, {
        hash: computeConfigHash(fileConfig),
        appliedAt: new Date(appliedAt).toISOString()
    });
}

function readPending(configPath) {
    const { pendingPath } = serviceFilePaths(configPath);
    const marker = readJsonFile(pendingPath);
    if (!marker) {
        return null;
    }
    return {
        hash: typeof marker.hash === 'string' ? marker.hash : null,
        appliedAt: typeof marker.appliedAt === 'string' ? marker.appliedAt : null
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

function quarantineActiveFile(configPath) {
    const { badPath, configPath: activePath } = serviceFilePaths(configPath);
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

    // $VAR-резолв секретов (fail-fast) без записи — используем loadConfig
    // с копией файла через временный каталог? Нет: резолв в памяти.
    const secretErrors = [];
    const { SYSTEM_SCHEMA, SYSTEM_SECTION_KEYS } = require('./config-schema');
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

// Apply: pre-validate → lkg → атомарный write → staged очистка → рестарт.
// options: { environment, restart } (restart — async функция, в тестах фейк).
// Возвращает { hash, fileConfig, lkgWritten, restarted }.
function applyConfig(configPath, fileConfig, options = {}) {
    const environment = options.environment || process.env;
    const { lkgPath, configPath: activePath } = serviceFilePaths(configPath);

    // 1. pre-validate (не трогает активный конфиг при отказе).
    const { hash } = preValidateConfigFile(fileConfig, { environment, plugins: options.plugins });

    // 2. lkg = копия активного (до записи нового).
    const activeConfig = readJsonFile(activePath);
    let lkgWritten = false;
    if (activeConfig !== null) {
        writeLkg(configPath, activeConfig);
        lkgWritten = true;
    }

    // 3. Pending-маркер: фиксирует хеш применяемого конфига до рестарта.
    // По готовности (ready) маркер снимается (config.confirmed). Краш до
    // ready → при следующем запуске авто-откат на lkg.
    writePending(configPath, fileConfig);
    logConfigAudit(options.logger, 'config.pending', {
        configPath: activePath,
        hash
    });

    // 4. Атомарный write активного конфига.
    atomicWriteJson(activePath, fileConfig);

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

    return { hash, fileConfig, lkgWritten, restarted };
}

// --- Стартовый детектор + авто-откат (Task 3) ---

// Стартовый детектор: вызывается до создания сервисов (после plugin-loader).
// Возвращает { state, reason, restoredFrom, quarantinePath, fileConfig }.
// state: 'ok' | 'quarantine' | 'rolled_back' | 'refused' (имена — по ADR-0046)
function runStartupConfigDetector(configPath, options = {}) {
    const { configPath: activePath } = serviceFilePaths(configPath);
    const lkg = readLkg(configPath);
    const pending = readPending(configPath);
    const active = readJsonFile(activePath);
    const warnings = [];

    // 1. Валидационный отказ активного файла → карантин + восстановление lkg.
    if (active !== null) {
        try {
            preValidateConfigFile(active, { environment: options.environment || process.env });
        } catch (validationError) {
            if (lkg === null) {
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
                preValidateConfigFile(lkg, { environment: options.environment || process.env });
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
    // Свежий маркер (записан < startupWaitMs назад) — штатный restart после
    // Apply: процесс стартует с нового конфига, по ready confirm() снимет
    // маркер. Старый маркер (>= startupWaitMs) — предыдущий процесс не вышел
    // на ready (краш до ready) → авто-откат к lkg.
    if (pending !== null) {
        const startupWaitMs = options.startupWaitMs || DEFAULT_STARTUP_WAIT_MS;
        const appliedAtMs = pending.appliedAt ? Date.parse(pending.appliedAt) : null;
        const pendingAgeMs = appliedAtMs ? Date.now() - appliedAtMs : Infinity;

        if (Number.isFinite(pendingAgeMs) && pendingAgeMs < startupWaitMs) {
            logConfigAudit(options.logger, 'config.pending', {
                configPath: activePath,
                reason: 'штатный restart после Apply (окно StartupWait), ожидается подтверждение по ready',
                pendingAgeMs
            });
            return {
                state: 'ok',
                reason: 'pending-маркер свежий (штатный restart после Apply, окно StartupWait)',
                fileConfig: active
            };
        }

        if (lkg === null) {
            return {
                state: 'ok',
                reason: 'pending-маркер есть, но lkg отсутствует — откат невозможен, продолжаем',
                fileConfig: active
            };
        }
        try {
            preValidateConfigFile(lkg, { environment: options.environment || process.env });
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
        // Авто-откат к lkg: маркер снимается (lkg подтверждён), staged очищается.
        atomicWriteJson(activePath, lkg);
        clearPending(configPath);
        clearStaged(configPath);
        logConfigAudit(options.logger, 'config.rollback', {
            configPath: activePath,
            reason: 'предыдущий Apply не подтверждён (краш до ready)',
            auto: true,
            restoredFrom: 'lkg',
            success: true
        });
        return {
            state: 'rolled_back',
            reason: 'предыдущий Apply не подтверждён (краш до ready), восстановлен lkg',
            restoredFrom: 'lkg',
            fileConfig: lkg
        };
    }

    return { state: 'ok', reason: null, fileConfig: active, warnings };
}

// Подтверждение конфига по готовности (ready): снятие pending-маркера.
// Возвращает true, если маркер был снят.
function confirmConfigApplied(configPath, options = {}) {
    if (!pendingExists(configPath)) {
        return false;
    }
    const pending = readPending(configPath);
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
// options: { restart, environment }.
function rollbackConfig(configPath, options = {}) {
    const { configPath: activePath } = serviceFilePaths(configPath);
    const lkg = readLkg(configPath);

    if (lkg === null) {
        throw createConfigError(CONFIG_VALIDATION_ERROR_CODE, 'Нет lkg для восстановления (rollback невозможен)');
    }

    const environment = options.environment || process.env;
    preValidateConfigFile(lkg, { environment });

    atomicWriteJson(activePath, lkg);
    clearPending(configPath);
    clearStaged(configPath);

    logConfigAudit(options.logger, 'config.rollback', {
        configPath: activePath,
        auto: false,
        restoredFrom: 'lkg',
        success: true
    });

    let restarted = false;
    if (typeof options.restart === 'function') {
        options.restart({ configPath });
        restarted = true;
    }

    return { restoredFrom: 'lkg', restarted, fileConfig: lkg };
}

module.exports = {
    serviceFilePaths,
    readJsonFile,
    atomicWriteJson,
    computeConfigHash,
    writeStaged,
    readStaged,
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
    applyConfig,
    runStartupConfigDetector,
    confirmConfigApplied,
    rollbackConfig,
    logConfigAudit,
    DEFAULT_STARTUP_WAIT_MS,
    LKG_SUFFIX,
    PENDING_SUFFIX,
    BAD_SUFFIX,
    STAGED_SUFFIX
};
