// SPDX-License-Identifier: Apache-2.0
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
    SYSTEM_SCHEMA,
    SYSTEM_SECTION_KEYS,
    BASE_ENV_KEYS,
    MANAGED_ENV_KEYS,
    FILE_SECRET_ENV_KEYS,
    FLAT_ONLY_KEYS,
    validateConfigFile,
    defaultsFromSchema,
    isVarReference
} = require('./config-schema');
const { prepareConfigForLoad, CURRENT_VERSION } = require('./config-migrations');

const moduleName = 'config';
const DEFAULT_CONFIG_PATH = './config/zyablik.json';
const CONFIG_VALIDATION_ERROR_CODE = 'CONFIG_VALIDATION_ERROR';
const TRANSPORT_NOT_IMPLEMENTED_ERROR_CODE = 'TRANSPORT_NOT_IMPLEMENTED';
const WEBHOOK_NOT_IMPLEMENTED_MESSAGE = 'Не реализовано: transport mode webhook';
const INVALID_LIVE_RUNTIME_MESSAGE = 'Invalid MAX live runtime configuration';
const SECRET_VAR_UNRESOLVED_ERROR_CODE = 'CONFIG_SECRET_VAR_UNRESOLVED';

// Список env-переменных .env-слоя (ADR-0045): bootstrap, node runtime,
// секреты, неизменяемая база.
const ENV_LAYER_KEYS = Object.freeze([
    'ZYABLIK_CONFIG',
    'NODE_EXTRA_CA_CERTS',
    'MAX_BOT_TOKEN',
    'METRICS_API_KEY',
    'SESSION_SECRET',
    'IDP_CLIENT_SECRET',
    'MAX_API_URL',
    'IDP_ISSUER',
    'IDP_AUDIENCE',
    'IDP_CLIENT_ID',
    'IDP_REDIRECT_URI'
]);

function resolveConfigPath(environment = process.env, options = {}) {
    if (options.configPath) {
        return path.resolve(options.configPath);
    }
    const envPath = environment && environment.ZYABLIK_CONFIG;
    return path.resolve(envPath || DEFAULT_CONFIG_PATH);
}

// --- Чтение env-слоя (используется при отсутствии файла и для секретов) ---

function readEnvValue(environment, key, fallback = '') {
    const value = environment && typeof environment[key] === 'string'
        ? environment[key].trim()
        : '';

    return value || fallback;
}

function readBoolEnvValue(environment, key, fallback = false) {
    const rawValue = readEnvValue(environment, key);

    if (!rawValue) {
        return fallback;
    }

    return rawValue.toLowerCase() === 'true';
}

function readIntegerEnvValue(environment, key, fallback, min, max) {
    const rawValue = readEnvValue(environment, key);

    if (!rawValue) {
        return fallback;
    }

    const value = Number(rawValue);

    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`Invalid ${key} value: ${rawValue}`);
    }

    return value;
}

function readListEnvValue(environment, key, fallback) {
    const rawValue = readEnvValue(environment, key);

    if (!rawValue) {
        return [...fallback];
    }

    const values = rawValue
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    if (values.length === 0) {
        return [...fallback];
    }

    return values;
}

function readBoolEnvValueNullable(environment, key) {
    const rawValue = readEnvValue(environment, key);

    if (!rawValue) {
        return null;
    }

    return rawValue.toLowerCase() === 'true';
}

// Коэрция env-строки в тип поля схемы. Повторяет прежнее env-based поведение
// (используется только при отсутствии файла — обратная совместимость).
function readEnvField(environment, flatKey, envKey, field) {
    switch (field.type) {
    case 'number':
        return readIntegerEnvValue(environment, envKey, field.default, field.min, field.max);
    case 'boolean':
        if (field.nullable) {
            return readBoolEnvValueNullable(environment, envKey);
        }
        return readBoolEnvValue(environment, envKey, field.default);
    case 'list':
        return readListEnvValue(environment, envKey, field.default);
    case 'string':
    case 'enum': {
        const value = readEnvValue(environment, envKey, field.default);
        if (Array.isArray(field.enum) && !field.enum.includes(value)) {
            throw new Error(`Invalid ${envKey} value: ${value}`);
        }
        return value;
    }
    default:
        return field.default;
    }
}

// Полный env-based effective-конфиг (без файла): defaults + .env-слой +
// управляемые env (обратная совместимость точки входа). Возвращает плоский
// объект без секций.
function createBotPlatformConfig(environment = process.env) {
    const flat = defaultsFromSchema();

    for (const [flatKey, field] of Object.entries(FLAT_MANAGED_FIELDS)) {
        if (field.secret) {
            const envKey = FILE_SECRET_ENV_KEYS[flatKey];
            flat[flatKey] = readEnvValue(environment, envKey);
            continue;
        }
        const envKey = MANAGED_ENV_KEYS[flatKey];
        flat[flatKey] = readEnvField(environment, flatKey, envKey, field);
    }

    for (const [flatKey, envKey] of Object.entries(BASE_ENV_KEYS)) {
        flat[flatKey] = readEnvValue(environment, envKey);
    }

    flat.moduleName = moduleName;
    flat.status = 'available';

    return flat;
}

// Плоский env-based конфиг queue-monitor (без файла). Обратная совместимость
// с createQueueMonitorConfig; значения берутся из общего результата.
function createQueueMonitorConfig(environment = process.env) {
    const flat = createBotPlatformConfig(environment);
    return buildMonitorFlat(flat);
}

// --- Сборка из секций (файл) ---

// Все управляемые flat-поля из системной схемы (flat → field).
const FLAT_MANAGED_FIELDS = (() => {
    const map = {};
    for (const sectionName of SYSTEM_SECTION_KEYS) {
        for (const field of Object.values(SYSTEM_SCHEMA[sectionName])) {
            map[field.flat] = field;
        }
    }
    return map;
})();

// Секция monitor плоского результата (поля, которые потребляет queue-monitor).
function buildMonitorFlat(flat) {
    return {
        moduleName: 'queue-monitor-config',
        monitorEnabled: flat.monitorEnabled,
        monitorPort: flat.monitorPort,
        metricsApiKey: flat.metricsApiKey,
        idpIssuer: flat.idpIssuer,
        idpClientId: flat.idpClientId,
        idpClientSecret: flat.idpClientSecret,
        idpRedirectUri: flat.idpRedirectUri,
        sessionSecret: flat.sessionSecret,
        authRateLimit: flat.authRateLimit,
        authRateLimitMax: flat.authRateLimitMax,
        authRateLimitWindowMs: flat.authRateLimitWindowMs,
        authRateConcurrency: flat.authRateConcurrency,
        idpRequireDiscovery: flat.idpRequireDiscovery,
        idpRelaxSsrf: flat.idpRelaxSsrf
    };
}

// Резолв $VAR-ссылок в плоском конфиге из env.
// Секрет без env-значения — fail-fast; не-секрет — warn + default.
// Возвращает { flat, warnings, errors }.
function resolveVarReferences(flat, environment, warnings = []) {
    const errors = [];
    const resolved = { ...flat };

    for (const [flatKey, field] of Object.entries(FLAT_MANAGED_FIELDS)) {
        const value = resolved[flatKey];
        if (typeof value !== 'string' || !isVarReference(value)) {
            continue;
        }

        const varName = value.slice(1);
        const envValue = readEnvValue(environment, varName);

        if (envValue === '') {
            if (field.secret) {
                errors.push({
                    key: flatKey,
                    reason: `$VAR-ссылка ${value} не разрешена: переменная ${varName} не задана`
                });
            } else {
                warnings.push({
                    key: flatKey,
                    reason: `$VAR-ссылка ${value} не разрешена: используется default (${JSON.stringify(field.default)})`
                });
                resolved[flatKey] = Array.isArray(field.default) ? [...field.default] : field.default;
            }
            continue;
        }

        resolved[flatKey] = envValue;
    }

    return { flat: resolved, warnings, errors };
}

// Чтение файла конфигурации.
// Возвращает { fileExists, rawConfig, configPath, error }.
function readConfigFile(configPath) {
    if (!fs.existsSync(configPath)) {
        return { fileExists: false, rawConfig: null, configPath, error: null };
    }

    let rawConfig;
    try {
        rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (parseError) {
        return {
            fileExists: true,
            rawConfig: null,
            configPath,
            error: `Не удалось распарсить конфиг-файл: ${parseError.message}`
        };
    }

    return { fileExists: true, rawConfig, configPath, error: null };
}

// Сборка effective-конфига из defaults + файла + .env-слоя.
// Возвращает { config (плоский), sections, warnings } или выбрасывает
// CONFIG_VALIDATION_ERROR / CONFIG_SECRET_VAR_UNRESOLVED.
function buildConfigFromFile(rawConfig, environment, configPath) {
    const prepared = prepareConfigForLoad(rawConfig);
    if (prepared.error) {
        throw createConfigError(CONFIG_VALIDATION_ERROR_CODE, prepared.error, {
            configPath,
            reason: 'version'
        });
    }

    const fileConfig = prepared.config;
    const validation = validateConfigFile(fileConfig);
    if (validation.errors.length > 0) {
        throw createConfigError(CONFIG_VALIDATION_ERROR_CODE, 'Конфиг-файл не прошёл валидацию', {
            configPath,
            errors: validation.errors,
            reason: 'schema'
        });
    }

    const warnings = [...validation.warnings];

    // defaults → файл
    const flat = defaultsFromSchema();
    const sections = {};

    for (const sectionName of SYSTEM_SECTION_KEYS) {
        const sectionValue = fileConfig[sectionName];
        sections[sectionName] = sectionValue === undefined ? {} : { ...sectionValue };

        for (const [key, field] of Object.entries(SYSTEM_SCHEMA[sectionName])) {
            const fileValue = sectionValue !== undefined && sectionValue !== null ? sectionValue[key] : undefined;
            if (fileValue !== undefined) {
                flat[field.flat] = Array.isArray(fileValue) ? [...fileValue] : fileValue;
            }
        }
    }

    // plugins-секция — проброс (в Sprint 39 валидируется merged-схемой).
    sections.plugins = fileConfig.plugins === undefined ? {} : { ...fileConfig.plugins };

    // .env-слой: неизменяемая база
    for (const [flatKey, envKey] of Object.entries(BASE_ENV_KEYS)) {
        flat[flatKey] = readEnvValue(environment, envKey);
    }

    // .env-слой: секреты из $VAR-ссылок (fail-fast для секретов)
    const resolved = resolveVarReferences(flat, environment, warnings);
    if (resolved.errors.length > 0) {
        throw createConfigError(SECRET_VAR_UNRESOLVED_ERROR_CODE, 'Не разрешённые $VAR-ссылки секретов', {
            configPath,
            errors: resolved.errors
        });
    }

    flat.moduleName = moduleName;
    flat.status = 'available';

    return { config: resolved.flat, sections, warnings };
}

// Сборка effective-конфига из env (без файла): defaults + .env-слой +
// управляемые env. Обратная совместимость точки входа.
function buildConfigFromEnv(environment) {
    const flat = createBotPlatformConfig(environment);
    const sections = {};

    for (const sectionName of SYSTEM_SECTION_KEYS) {
        sections[sectionName] = {};
        for (const [key, field] of Object.entries(SYSTEM_SCHEMA[sectionName])) {
            sections[sectionName][key] = flat[field.flat];
        }
    }

    sections.plugins = {};

    return { config: flat, sections, warnings: [] };
}

// Единая точка входа конфигурации (ADR-0045): трёхслойный мерж
// defaults → файл → .env.
// options: { environment, configPath, logger }.
// Возвращает:
// {
//   configPath, fileExists, version, warnings,
//   config (плоский effective-конфиг),
//   sections (bot/queue/ingress/monitor/plugins),
//   monitor (плоская секция queue-monitor)
// }
function loadConfig(options = {}) {
    const environment = options.environment || process.env;
    const configPath = resolveConfigPath(environment, options);

    const { fileExists, rawConfig, configPath: resolvedPath, error: readError } = readConfigFile(configPath);

    if (fileExists) {
        if (readError) {
            throw createConfigError(CONFIG_VALIDATION_ERROR_CODE, readError, {
                configPath: resolvedPath,
                reason: 'parse'
            });
        }

        const built = buildConfigFromFile(rawConfig, environment, resolvedPath);
        return {
            configPath: resolvedPath,
            fileExists: true,
            version: prepareConfigForLoad(rawConfig).version || CURRENT_VERSION,
            warnings: built.warnings,
            config: built.config,
            sections: built.sections,
            monitor: buildMonitorFlat(built.config)
        };
    }

    const built = buildConfigFromEnv(environment);
    return {
        configPath: resolvedPath,
        fileExists: false,
        version: CURRENT_VERSION,
        warnings: built.warnings,
        config: built.config,
        sections: built.sections,
        monitor: buildMonitorFlat(built.config)
    };
}

// --- Live runtime ---

function createLiveRuntimeConfig(environment = process.env) {
    const config = createBotPlatformConfig(environment);

    if (config.maxTransportMode === 'webhook') {
        return {
            moduleName,
            status: 'available',
            mode: 'webhook',
            error: createConfigError(TRANSPORT_NOT_IMPLEMENTED_ERROR_CODE, WEBHOOK_NOT_IMPLEMENTED_MESSAGE)
        };
    }

    const missingFields = [];

    if (config.maxApiUrl === '') {
        missingFields.push('MAX_API_URL');
    }

    if (config.maxBotToken === '') {
        missingFields.push('MAX_BOT_TOKEN');
    }

    if (missingFields.length > 0) {
        throw createConfigError(CONFIG_VALIDATION_ERROR_CODE, INVALID_LIVE_RUNTIME_MESSAGE, {
            missing: missingFields
        });
    }

    return {
        moduleName,
        status: 'available',
        mode: 'long_polling',
        maxApiUrl: config.maxApiUrl,
        maxBotToken: config.maxBotToken,
        httpProxy: config.httpProxy,
        logLevel: config.logLevel,
        maxTransportMode: config.maxTransportMode,
        maxPollLimit: config.maxPollLimit,
        maxPollTimeoutSeconds: config.maxPollTimeoutSeconds,
        maxPollTypes: config.maxPollTypes
    };
}

function createConfigError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;

    if (details && Object.keys(details).length > 0) {
        error.details = details;
    }

    return error;
}

// --- Генерация первого конфиг-файла (--generate-config) ---

// Маппинг flat → env для управляемых полей (дополняет MANAGED_ENV_KEYS).
function buildConfigFileFromEnvironment(environment = process.env) {
    const flat = createBotPlatformConfig(environment);
    const fileConfig = { version: CURRENT_VERSION };

    for (const [flatKey, field] of Object.entries(FLAT_MANAGED_FIELDS)) {
        if (field.secret) {
            const envKey = FILE_SECRET_ENV_KEYS[flatKey];
            const rawValue = readEnvValue(environment, envKey);
            // Секрет — всегда $VAR-ссылка (даже если env-переменная не задана):
            // литералы в файл не пишем.
            fileConfig[field.section] = fileConfig[field.section] || {};
            fileConfig[field.section][findSchemaKey(field)] = `$${envKey}`;
            void rawValue;
            continue;
        }

        const envKey = MANAGED_ENV_KEYS[flatKey];
        const rawValue = environment && typeof environment[envKey] === 'string' ? environment[envKey].trim() : '';

        if (rawValue === '') {
            continue;
        }

        fileConfig[field.section] = fileConfig[field.section] || {};
        fileConfig[field.section][findSchemaKey(field)] = flat[flatKey];
    }

    return fileConfig;
}

// Поиск ключа поля в схеме секции по flat-имени.
function findSchemaKey(field) {
    for (const sectionName of SYSTEM_SECTION_KEYS) {
        for (const [key, candidate] of Object.entries(SYSTEM_SCHEMA[sectionName])) {
            if (candidate === field) {
                return key;
            }
        }
    }
    return null;
}

module.exports = {
    moduleName,
    DEFAULT_CONFIG_PATH,
    CONFIG_VALIDATION_ERROR_CODE,
    TRANSPORT_NOT_IMPLEMENTED_ERROR_CODE,
    WEBHOOK_NOT_IMPLEMENTED_MESSAGE,
    SECRET_VAR_UNRESOLVED_ERROR_CODE,
    ENV_LAYER_KEYS,
    createBotPlatformConfig,
    createQueueMonitorConfig,
    createLiveRuntimeConfig,
    loadConfig,
    resolveConfigPath,
    buildConfigFileFromEnvironment,
    readEnvValue,
    readBoolEnvValue,
    readIntegerEnvValue,
    readListEnvValue,
    readBoolEnvValueNullable,
    createConfigError,
    DEFAULT_MAX_TRANSPORT_MODE: 'long_polling',
    DEFAULT_MAX_POLL_LIMIT: 100,
    DEFAULT_MAX_POLL_TIMEOUT_SECONDS: 30,
    DEFAULT_MAX_POLL_TYPES: ['message_created', 'bot_started', 'bot_added'],
    DEFAULT_QUEUE_MAX_ATTEMPTS: 5,
    DEFAULT_QUEUE_INTERVAL_MS: 5000,
    DEFAULT_QUEUE_BATCH_SIZE: 10,
    DEFAULT_QUEUE_BACKOFF_BASE: 2,
    DEFAULT_QUEUE_BACKOFF_MAX: 300,
    DEFAULT_QUEUE_PROCESSING_TTL_SECONDS: 300,
    DEFAULT_RATE_LIMIT_GLOBAL: 25,
    DEFAULT_RATE_LIMIT_RECIPIENT: 5,
    DEFAULT_INGRESS_PORT: 8443,
    DEFAULT_MONITOR_PORT: 9000,
    MAX_TRANSPORT_MODES: new Set(['long_polling', 'webhook'])
};
