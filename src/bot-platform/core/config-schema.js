// SPDX-License-Identifier: Apache-2.0
'use strict';

// ADR-0045 / ADR-0046: единая системная схема секций конфигурации.
// Формат поля: { type, default, required, secret, enum, min, max, nullable,
// description, section }. Одна декларация используется и для валидации файла
// (ADR-0045), и для рендера форм в web UI (ADR-0046).
//
// Ключи секций — ключи файла `zyablik.config.json`. Свойство `flat` — имя
// поля в плоском effective-конфиге, который потребляют app.js и
// queue-monitor (обратная совместимость с прежним env-based конфигом).

const DEFAULT_MAX_POLL_TYPES = ['message_created', 'bot_started', 'bot_added'];

// env-переменные «неизменяемой базы» (ADR-0045): читаются только из
// .env/docker secrets, в файл не переносятся. flat-имя → env-переменная.
const BASE_ENV_KEYS = Object.freeze({
    maxApiUrl: 'MAX_API_URL',
    idpIssuer: 'IDP_ISSUER',
    idpAudience: 'IDP_AUDIENCE',
    idpClientId: 'IDP_CLIENT_ID',
    idpClientSecret: 'IDP_CLIENT_SECRET',
    idpRedirectUri: 'IDP_REDIRECT_URI'
});

// Управляемые env-переменные: используются только при отсутствии файла
// (обратная совместимость точки входа). При наличии файла игнорируются.
// flat-имя → env-переменная (дополняет маппинг ADR-0045).
const MANAGED_ENV_KEYS = Object.freeze({
    logLevel: 'MAX_LOG_LEVEL',
    maxTransportMode: 'MAX_TRANSPORT_MODE',
    httpProxy: 'MAX_HTTP_PROXY',
    maxPollLimit: 'MAX_POLL_LIMIT',
    maxPollTimeoutSeconds: 'MAX_POLL_TIMEOUT_SECONDS',
    maxPollTypes: 'MAX_POLL_TYPES',
    rateLimitEnabled: 'RATE_LIMIT_ENABLED',
    rateLimitGlobal: 'RATE_LIMIT_GLOBAL',
    rateLimitRecipient: 'RATE_LIMIT_RECIPIENT',
    logAudit: 'LOG_AUDIT',
    logTrace: 'LOG_TRACE',
    queueEnabled: 'QUEUE_ENABLED',
    queueMaxAttempts: 'QUEUE_MAX_ATTEMPTS',
    queueIntervalMs: 'QUEUE_INTERVAL_MS',
    queueBatchSize: 'QUEUE_BATCH_SIZE',
    queueBackoffBase: 'QUEUE_BACKOFF_BASE',
    queueBackoffMax: 'QUEUE_BACKOFF_MAX',
    queueProcessingTtlSeconds: 'QUEUE_PROCESSING_TTL_SECONDS',
    ingressEnabled: 'INGRESS_ENABLED',
    ingressPort: 'INGRESS_PORT',
    jwtClaimName: 'JWT_CLAIM_NAME',
    jwtClaimValue: 'JWT_CLAIM_VALUE',
    monitorEnabled: 'MONITOR_ENABLED',
    monitorPort: 'MONITOR_PORT',
    authRateLimit: 'AUTH_RATE_LIMIT',
    authRateLimitMax: 'AUTH_RATE_LIMIT_MAX',
    authRateLimitWindowMs: 'AUTH_RATE_LIMIT_WINDOW_MS',
    authRateConcurrency: 'AUTH_RATE_CONCURRENCY',
    idpRequireDiscovery: 'IDP_REQUIRE_DISCOVERY',
    idpRelaxSsrf: 'IDP_RELAX_SSRF'
});

// Секреты, получающие `$VAR`-ключи в файле (ADR-0045): flat-имя → env-переменная.
const FILE_SECRET_ENV_KEYS = Object.freeze({
    maxBotToken: 'MAX_BOT_TOKEN',
    metricsApiKey: 'METRICS_API_KEY',
    sessionSecret: 'SESSION_SECRET'
});

const SYSTEM_SCHEMA = Object.freeze({
    bot: Object.freeze({
        logLevel: {
            type: 'string',
            default: 'info',
            flat: 'logLevel',
            section: 'bot',
            description: 'Уровень логирования: trace, debug, info, warn, error'
        },
        maxTransportMode: {
            type: 'string',
            default: 'long_polling',
            enum: ['long_polling', 'webhook'],
            flat: 'maxTransportMode',
            section: 'bot',
            description: 'Режим получения событий MAX: long_polling или webhook'
        },
        httpProxy: {
            type: 'string',
            default: '',
            flat: 'httpProxy',
            section: 'bot',
            description: 'HTTP(S)-прокси для исходящих запросов к MAX API'
        },
        maxPollLimit: {
            type: 'number',
            default: 100,
            min: 1,
            max: 1000,
            flat: 'maxPollLimit',
            section: 'bot',
            description: 'Лимит событий за один long-polling цикл'
        },
        maxPollTimeoutSeconds: {
            type: 'number',
            default: 30,
            min: 0,
            max: 90,
            flat: 'maxPollTimeoutSeconds',
            section: 'bot',
            description: 'Таймаут long-polling (секунды)'
        },
        maxPollTypes: {
            type: 'list',
            default: DEFAULT_MAX_POLL_TYPES,
            flat: 'maxPollTypes',
            section: 'bot',
            description: 'Типы событий, которые бот получает из MAX'
        },
        rateLimitEnabled: {
            type: 'boolean',
            default: true,
            flat: 'rateLimitEnabled',
            section: 'bot',
            description: 'Включить outbound rate limiter'
        },
        rateLimitGlobal: {
            type: 'number',
            default: 25,
            min: 1,
            max: 1000,
            flat: 'rateLimitGlobal',
            section: 'bot',
            description: 'Глобальный лимит исходящих запросов, req/s'
        },
        rateLimitRecipient: {
            type: 'number',
            default: 5,
            min: 1,
            max: 100,
            flat: 'rateLimitRecipient',
            section: 'bot',
            description: 'Лимит исходящих на одного получателя, req/s'
        },
        logAudit: {
            type: 'boolean',
            default: false,
            flat: 'logAudit',
            section: 'bot',
            description: 'Писать audit-журнал (ADR-0029)'
        },
        logTrace: {
            type: 'boolean',
            default: true,
            flat: 'logTrace',
            section: 'bot',
            description: 'Писать trace-журнал (ADR-0029)'
        },
        maxBotToken: {
            type: 'string',
            default: '',
            secret: true,
            flat: 'maxBotToken',
            section: 'bot',
            description: 'Токен MAX-бота. В файле — только $VAR-ссылка'
        }
    }),
    queue: Object.freeze({
        enabled: {
            type: 'boolean',
            default: false,
            flat: 'queueEnabled',
            section: 'queue',
            description: 'Включить очередь доставки (ADR-0028)'
        },
        maxAttempts: {
            type: 'number',
            default: 5,
            min: 1,
            max: 100,
            flat: 'queueMaxAttempts',
            section: 'queue',
            description: 'Максимум попыток доставки сообщения'
        },
        intervalMs: {
            type: 'number',
            default: 5000,
            min: 100,
            max: 60000,
            flat: 'queueIntervalMs',
            section: 'queue',
            description: 'Интервал polling очереди, мс'
        },
        batchSize: {
            type: 'number',
            default: 10,
            min: 1,
            max: 1000,
            flat: 'queueBatchSize',
            section: 'queue',
            description: 'Размер батча выборки из очереди'
        },
        backoffBase: {
            type: 'number',
            default: 2,
            min: 2,
            max: 10,
            flat: 'queueBackoffBase',
            section: 'queue',
            description: 'База экспоненциального backoff'
        },
        backoffMax: {
            type: 'number',
            default: 300,
            min: 10,
            max: 3600,
            flat: 'queueBackoffMax',
            section: 'queue',
            description: 'Максимальный backoff, секунды'
        },
        processingTtlSeconds: {
            type: 'number',
            default: 300,
            min: 30,
            max: 3600,
            flat: 'queueProcessingTtlSeconds',
            section: 'queue',
            description: 'TTL для reclaim зависших processing-строк (ADR-0033)'
        }
    }),
    ingress: Object.freeze({
        enabled: {
            type: 'boolean',
            default: false,
            flat: 'ingressEnabled',
            section: 'ingress',
            description: 'Включить HTTP-ingress (ADR-0022/ADR-0023)'
        },
        port: {
            type: 'number',
            default: 8443,
            min: 1,
            max: 65535,
            flat: 'ingressPort',
            section: 'ingress',
            description: 'Порт HTTP-ingress сервера'
        },
        jwtClaimName: {
            type: 'string',
            default: '',
            flat: 'jwtClaimName',
            section: 'ingress',
            description: 'Имя JWT-claim для авторизации ingress'
        },
        jwtClaimValue: {
            type: 'string',
            default: '',
            flat: 'jwtClaimValue',
            section: 'ingress',
            description: 'Ожидаемое значение JWT-claim для авторизации ingress'
        }
    }),
    monitor: Object.freeze({
        enabled: {
            type: 'boolean',
            default: false,
            flat: 'monitorEnabled',
            section: 'monitor',
            description: 'Включить Queue Monitor Dashboard (ADR-0034)'
        },
        port: {
            type: 'number',
            default: 9000,
            min: 1,
            max: 65535,
            flat: 'monitorPort',
            section: 'monitor',
            description: 'Порт dashboard-сервера'
        },
        metricsApiKey: {
            type: 'string',
            default: '',
            secret: true,
            flat: 'metricsApiKey',
            section: 'monitor',
            description: 'Bearer-ключ metrics API. В файле — только $VAR-ссылка'
        },
        sessionSecret: {
            type: 'string',
            default: '',
            secret: true,
            flat: 'sessionSecret',
            section: 'monitor',
            description: 'Секрет сессий dashboard (ADR-0035). В файле — только $VAR'
        },
        authRateLimit: {
            type: 'boolean',
            default: true,
            flat: 'authRateLimit',
            section: 'monitor',
            description: 'Rate limit для /api/auth/*'
        },
        authRateLimitMax: {
            type: 'number',
            default: 20,
            min: 1,
            max: 10000,
            flat: 'authRateLimitMax',
            section: 'monitor',
            description: 'Максимум auth-запросов в окне'
        },
        authRateLimitWindowMs: {
            type: 'number',
            default: 60000,
            min: 1,
            max: 3600000,
            flat: 'authRateLimitWindowMs',
            section: 'monitor',
            description: 'Окно rate limit, мс'
        },
        authRateConcurrency: {
            type: 'number',
            default: 5,
            min: 1,
            max: 1000,
            flat: 'authRateConcurrency',
            section: 'monitor',
            description: 'Максимум одновременных auth-колбэков'
        },
        idpRequireDiscovery: {
            type: 'boolean',
            default: false,
            flat: 'idpRequireDiscovery',
            section: 'monitor',
            description: 'Требовать валидный OIDC discovery вместо fallback'
        },
        idpRelaxSsrf: {
            type: 'boolean',
            default: null,
            nullable: true,
            flat: 'idpRelaxSsrf',
            section: 'monitor',
            description: 'Ослабить SSRF-проверку IdP: null = авто-детект по схеме issuer'
        }
    })
});

const SYSTEM_SECTION_KEYS = Object.freeze(Object.keys(SYSTEM_SCHEMA));

// Валидация значения отдельного поля.
// Возвращает null при валидном значении, иначе строку-причину.
function validateFieldValue(field, value) {
    // M2 (review): серверная проверка required (как клиентская validateValue):
    // undefined/'' (и null для nullable) для required-поля — ошибка.
    // Порядок с null согласован с клиентом: null для не-nullable поля — своя
    // ошибка, required проверяется после неё.
    if (value === null) {
        if (!field.nullable) {
            return 'null не допускается для этого поля';
        }
        if (field.required) {
            return 'обязательное поле';
        }
        return null;
    }

    if (value === undefined) {
        if (field.required) {
            return 'обязательное поле';
        }
        return null;
    }

    if (field.required && value === '') {
        return 'обязательное поле';
    }

    switch (field.type) {
    case 'string':
    case 'enum':
        if (typeof value !== 'string') {
            return 'ожидается строка';
        }
        break;
    case 'number':
        if (!Number.isInteger(value)) {
            return 'ожидается целое число';
        }
        break;
    case 'boolean':
        if (typeof value !== 'boolean') {
            return 'ожидается boolean';
        }
        break;
    case 'list':
        if (!Array.isArray(value)) {
            return 'ожидается массив';
        }
        if (value.some((item) => typeof item !== 'string')) {
            return 'массив должен содержать строки';
        }
        break;
    default:
        return `неизвестный тип поля: ${field.type}`;
    }

    if (field.type === 'number') {
        if (typeof field.min === 'number' && value < field.min) {
            return `меньше минимального значения ${field.min}`;
        }
        if (typeof field.max === 'number' && value > field.max) {
            return `больше максимального значения ${field.max}`;
        }
    }

    if (Array.isArray(field.enum) && !field.enum.includes(value)) {
        return `ожидается одно из: ${field.enum.join(', ')}`;
    }

    return null;
}

// Проверка $VAR-ссылки: ^\$[A-Z0-9_]+$
const VAR_REFERENCE_PATTERN = /^\$[A-Z0-9_]+$/;

function isVarReference(value) {
    return typeof value === 'string' && VAR_REFERENCE_PATTERN.test(value);
}

// Инвариант «секреты не в файле» (ADR-0045): литеральное значение в
// secret-поле невалидно. Допустимо: $VAR-ссылка, пустая строка, null (nullable).
function validateSecretField(field, value) {
    if (value === undefined || value === null) {
        return null;
    }
    if (value === '') {
        return null;
    }
    if (isVarReference(value)) {
        return null;
    }
    return 'секрет задаётся только $VAR-ссылкой или пустым значением';
}

// --- Merged-схема (ADR-0046) ---

// Merged-схема = системная схема + configSchema плагинов.
// Формат: { bot, queue, ingress, monitor, plugins: { <name>: configSchema } }.
// Плагин без configSchema в merged-схему не попадает (невидим в Settings UI).
function getMergedConfigSchema(plugins = []) {
    const pluginSchemas = {};

    for (const plugin of plugins) {
        if (plugin && plugin.name && plugin.configSchema && typeof plugin.configSchema === 'object') {
            pluginSchemas[plugin.name] = plugin.configSchema;
        }
    }

    return {
        ...SYSTEM_SCHEMA,
        plugins: pluginSchemas
    };
}

// Валидация ветки plugins.<name>.* по configSchema плагина.
// Возвращает { errors, warnings } (пустые, если схема не объявлена).
function validatePluginSection(pluginName, configSchema, sectionValue) {
    const errors = [];
    const warnings = [];

    if (sectionValue === undefined || sectionValue === null) {
        return { errors, warnings };
    }

    if (typeof sectionValue !== 'object' || Array.isArray(sectionValue)) {
        errors.push({ section: 'plugins', key: pluginName, reason: 'ветка плагина должна быть объектом' });
        return { errors, warnings };
    }

    if (!configSchema || typeof configSchema !== 'object') {
        // Схема не объявлена — структурная проверка уже сделана; ключи warn+ignore.
        for (const key of Object.keys(sectionValue)) {
            warnings.push({
                section: 'plugins',
                key: `${pluginName}.${key}`,
                reason: 'у плагина нет configSchema — ключ не проверяется (warn + ignore)'
            });
        }
        return { errors, warnings };
    }

    // M1 (review): неизвестные ключи при наличии configSchema — warn + ignore,
    // как в системных секциях (validateSection). Ключи схемы дальше
    // валидируются по типам/секретности.
    for (const key of Object.keys(sectionValue)) {
        if (!configSchema[key]) {
            warnings.push({
                section: 'plugins',
                key: `${pluginName}.${key}`,
                reason: 'неизвестный ключ (warn + ignore)'
            });
        }
    }

    for (const [key, field] of Object.entries(configSchema)) {
        // M1 (review, round 3): отсутствующие ключи валидируем только для
        // required-полей — как клиентский validateSectionValues. Иначе Import
        // (минуя клиент) принимает ветку без обязательного поля.
        if (sectionValue[key] === undefined && !field.required) {
            continue;
        }
        const value = sectionValue[key];

        if (field.secret) {
            const secretReason = validateSecretField(field, value);
            if (secretReason) {
                errors.push({ section: 'plugins', key: `${pluginName}.${key}`, reason: secretReason });
                continue;
            }
        }

        const typeReason = validateFieldValue(field, value);
        if (typeReason) {
            errors.push({ section: 'plugins', key: `${pluginName}.${key}`, reason: typeReason });
        }
    }

    return { errors, warnings };
}

// Валидация секции файла по системной схеме.
// Возвращает { errors: [{ section, key, reason }], warnings: [{ section, key, reason }] }.
function validateSection(sectionName, sectionValue) {
    const schema = SYSTEM_SCHEMA[sectionName];
    const errors = [];
    const warnings = [];

    // undefined — секция отсутствует в файле (нормально); null — явно заданный
    // мусор, который при Apply затирает ветку (M1, review R13): ошибка.
    if (sectionValue === undefined) {
        return { errors, warnings };
    }

    if (sectionValue === null || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) {
        errors.push({ section: sectionName, key: null, reason: 'секция должна быть объектом' });
        return { errors, warnings };
    }

    for (const key of Object.keys(sectionValue)) {
        if (!schema[key]) {
            warnings.push({
                section: sectionName,
                key,
                reason: 'неизвестный ключ (warn + ignore)'
            });
            continue;
        }

        const field = schema[key];
        const value = sectionValue[key];

        if (field.secret) {
            const secretReason = validateSecretField(field, value);
            if (secretReason) {
                errors.push({ section: sectionName, key, reason: secretReason });
                continue;
            }
        }

        const typeReason = validateFieldValue(field, value);
        if (typeReason) {
            errors.push({ section: sectionName, key, reason: typeReason });
        }
    }

    return { errors, warnings };
}

// Валидация файла целиком по системной схеме (ADR-0045) + merged-схеме
// плагинов (ADR-0046). options.plugins — массив загруженных плагинов;
// при передаче ветки plugins.<name>.* валидируются по configSchema плагина.
// Возвращает { errors, warnings }.
function validateConfigFile(rawConfig, options = {}) {
    const errors = [];
    const warnings = [];

    if (rawConfig === null || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
        return { errors: [{ section: null, key: null, reason: 'файл должен быть объектом JSON' }], warnings: [] };
    }

    for (const sectionName of SYSTEM_SECTION_KEYS) {
        const sectionResult = validateSection(sectionName, rawConfig[sectionName]);
        errors.push(...sectionResult.errors);
        warnings.push(...sectionResult.warnings);
    }

    // undefined — секции нет в файле (нормально); null — мусор, затирающий
    // ветки плагинов при Apply (M1, review R13): ошибка.
    if (rawConfig.plugins !== undefined) {
        if (rawConfig.plugins === null || typeof rawConfig.plugins !== 'object' || Array.isArray(rawConfig.plugins)) {
            errors.push({ section: 'plugins', key: null, reason: 'секция plugins должна быть объектом' });
        } else {
            const pluginSchemas = {};
            for (const plugin of options.plugins || []) {
                if (plugin && plugin.name) {
                    pluginSchemas[plugin.name] = plugin.configSchema;
                }
            }
            for (const pluginName of Object.keys(rawConfig.plugins)) {
                // L3 (review R4): reject prototype-polluting property names.
                // JSON.parse создаёт __proto__ как обычное свойство, но
                // последующее присваивание obj['__proto__'] = value на {}
                // меняет прототип — данные теряются (JSON.stringify их не
                // сериализует).
                if (pluginName === '__proto__' || pluginName === 'constructor' || pluginName === 'prototype') {
                    errors.push({
                        section: 'plugins',
                        key: pluginName,
                        reason: `недопустимое имя плагина: «${pluginName}»`
                    });
                    continue;
                }
                const pluginValue = rawConfig.plugins[pluginName];
                // typeof null === 'object' обходил проверку ниже — ветка null
                // проходила валидацию и затирала ветку плагина при Apply
                // (M1, review R13): явная проверка null.
                if (pluginValue === null || typeof pluginValue !== 'object' || Array.isArray(pluginValue)) {
                    errors.push({
                        section: 'plugins',
                        key: pluginName,
                        reason: 'ветка плагина должна быть объектом'
                    });
                    continue;
                }
                const pluginResult = validatePluginSection(pluginName, pluginSchemas[pluginName], pluginValue);
                errors.push(...pluginResult.errors);
                warnings.push(...pluginResult.warnings);
            }
        }
    }

    const knownSections = new Set([...SYSTEM_SECTION_KEYS, 'plugins', 'version']);
    for (const topKey of Object.keys(rawConfig)) {
        if (!knownSections.has(topKey)) {
            warnings.push({ section: null, key: topKey, reason: 'неизвестный ключ верхнего уровня (warn + ignore)' });
        }
    }

    return { errors, warnings };
}

function defaultsFromSchema() {
    const defaults = {};
    for (const sectionName of SYSTEM_SECTION_KEYS) {
        for (const [key, field] of Object.entries(SYSTEM_SCHEMA[sectionName])) {
            defaults[field.flat] = Array.isArray(field.default) ? [...field.default] : field.default;
        }
    }
    return defaults;
}

module.exports = {
    SYSTEM_SCHEMA,
    SYSTEM_SECTION_KEYS,
    BASE_ENV_KEYS,
    MANAGED_ENV_KEYS,
    FILE_SECRET_ENV_KEYS,
    DEFAULT_MAX_POLL_TYPES,
    getMergedConfigSchema,
    validatePluginSection,
    validateFieldValue,
    validateSecretField,
    validateSection,
    validateConfigFile,
    defaultsFromSchema,
    isVarReference
};
