const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    loadConfig,
    resolveConfigPath,
    CONFIG_VALIDATION_ERROR_CODE,
    SECRET_VAR_UNRESOLVED_ERROR_CODE,
    DEFAULT_CONFIG_PATH
} = require('../../src/bot-platform/core/config');

function makeTempConfigDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'zyablik-config-'));
}

function writeConfig(dir, fileConfig, name = 'zyablik.config.json') {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, JSON.stringify(fileConfig, null, 2), 'utf8');
    return filePath;
}

test('resolveConfigPath: дефолт ./config/zyablik.config.json', () => {
    const resolved = resolveConfigPath({}, {});
    assert.equal(resolved, path.resolve(DEFAULT_CONFIG_PATH));
});

test('resolveConfigPath: ZYABLIK_CONFIG задаёт путь', () => {
    const resolved = resolveConfigPath({ ZYABLIK_CONFIG: '/tmp/custom/config.json' }, {});
    assert.equal(resolved, '/tmp/custom/config.json');
});

test('resolveConfigPath: options.configPath приоритетнее env', () => {
    const resolved = resolveConfigPath({ ZYABLIK_CONFIG: '/tmp/env.json' }, { configPath: '/tmp/opt.json' });
    assert.equal(resolved, '/tmp/opt.json');
});

test('loadConfig без файла: дефолты + .env-слой (обратная совместимость)', () => {
    const result = loadConfig({
        environment: {
            MAX_BOT_TOKEN: 'synthetic-bot-token',
            MAX_API_URL: 'https://synthetic.example/messages'
        },
        configPath: path.join(makeTempConfigDir(), 'nonexistent.json')
    });

    assert.equal(result.fileExists, false);
    assert.equal(result.config.maxTransportMode, 'long_polling');
    assert.equal(result.config.queueEnabled, false);
    assert.equal(result.config.maxBotToken, 'synthetic-bot-token');
    assert.equal(result.config.maxApiUrl, 'https://synthetic.example/messages');
    assert.equal(result.config.monitorEnabled, false);
});

test('loadConfig без файла: управляемые env читаются', () => {
    const result = loadConfig({
        environment: { QUEUE_ENABLED: 'true', QUEUE_MAX_ATTEMPTS: '10', MONITOR_ENABLED: 'true', MONITOR_PORT: '8080' },
        configPath: path.join(makeTempConfigDir(), 'nonexistent.json')
    });

    assert.equal(result.config.queueEnabled, true);
    assert.equal(result.config.queueMaxAttempts, 10);
    assert.equal(result.config.monitorEnabled, true);
    assert.equal(result.config.monitorPort, 8080);
});

test('loadConfig с файлом: файл главный, управляемые env игнорируются', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, {
        version: 1,
        bot: { logLevel: 'debug', maxPollLimit: 200 },
        queue: { enabled: true }
    });

    const result = loadConfig({
        environment: {
            // Управляемые env при наличии файла не читаются.
            MAX_LOG_LEVEL: 'error',
            QUEUE_ENABLED: 'false',
            QUEUE_MAX_ATTEMPTS: '50'
        },
        configPath: filePath
    });

    assert.equal(result.fileExists, true);
    assert.equal(result.config.logLevel, 'debug');
    assert.equal(result.config.maxPollLimit, 200);
    assert.equal(result.config.queueEnabled, true);
    assert.equal(result.config.queueMaxAttempts, 5, 'управляемый env игнорируется, берётся дефолт');
});

test('loadConfig с файлом: .env-слой неизменяемой базы применяется', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, {
        version: 1,
        bot: { logLevel: 'debug' }
    });

    const result = loadConfig({
        environment: {
            MAX_API_URL: 'https://synthetic.example/messages',
            IDP_ISSUER: 'https://synthetic.idp.com'
        },
        configPath: filePath
    });

    assert.equal(result.config.maxApiUrl, 'https://synthetic.example/messages');
    assert.equal(result.config.idpIssuer, 'https://synthetic.idp.com');
});

test('loadConfig с файлом: $VAR секрета резолвится из env', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, {
        version: 1,
        bot: { maxBotToken: '$MAX_BOT_TOKEN' },
        monitor: { metricsApiKey: '$METRICS_API_KEY' }
    });

    const result = loadConfig({
        environment: {
            MAX_BOT_TOKEN: 'synthetic-bot-token',
            METRICS_API_KEY: 'synthetic-api-key'
        },
        configPath: filePath
    });

    assert.equal(result.config.maxBotToken, 'synthetic-bot-token');
    assert.equal(result.config.metricsApiKey, 'synthetic-api-key');
});

test('loadConfig с файлом: неразрешённый $VAR секрета — fail-fast', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, {
        version: 1,
        bot: { maxBotToken: '$MAX_BOT_TOKEN' }
    });

    assert.throws(
        () => loadConfig({ environment: {}, configPath: filePath }),
        (error) => {
            assert.equal(error.code, SECRET_VAR_UNRESOLVED_ERROR_CODE);
            assert.equal(error.details.errors[0].key, 'maxBotToken');
            return true;
        }
    );
});

test('loadConfig с файлом: литеральный секрет — валидационная ошибка', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, {
        version: 1,
        bot: { maxBotToken: 'literal-secret-value' }
    });

    assert.throws(
        () => loadConfig({ environment: {}, configPath: filePath }),
        (error) => {
            assert.equal(error.code, CONFIG_VALIDATION_ERROR_CODE);
            assert.equal(error.details.reason, 'schema');
            assert.equal(error.details.errors[0].key, 'maxBotToken');
            return true;
        }
    );
});

test('loadConfig с файлом: неразрешённый $VAR не-секрета — warn + default', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, {
        version: 1,
        bot: { httpProxy: '$MAX_HTTP_PROXY' }
    });

    const result = loadConfig({ environment: {}, configPath: filePath });

    assert.equal(result.config.httpProxy, '');
    assert.ok(result.warnings.some((warning) => warning.key === 'httpProxy'));
});

test('loadConfig с файлом: невалидный JSON — ошибка с причиной', () => {
    const dir = makeTempConfigDir();
    const filePath = path.join(dir, 'zyablik.config.json');
    fs.writeFileSync(filePath, '{ not-json', 'utf8');

    assert.throws(
        () => loadConfig({ environment: {}, configPath: filePath }),
        (error) => {
            assert.equal(error.code, CONFIG_VALIDATION_ERROR_CODE);
            assert.equal(error.details.reason, 'parse');
            return true;
        }
    );
});

test('loadConfig с файлом: version выше текущей — отказ (fail loudly)', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, { version: 999, bot: {} });

    assert.throws(
        () => loadConfig({ environment: {}, configPath: filePath }),
        (error) => {
            assert.equal(error.code, CONFIG_VALIDATION_ERROR_CODE);
            assert.equal(error.details.reason, 'version');
            return true;
        }
    );
});

test('loadConfig с файлом: неизвестные ключи — warn + ignore', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, {
        version: 1,
        bot: { logLevel: 'debug', unknownField: 'x' },
        unknownTopLevel: 1
    });

    const result = loadConfig({ environment: {}, configPath: filePath });

    assert.equal(result.config.logLevel, 'debug');
    assert.equal(result.warnings.length, 2);
});

test('loadConfig: версия файла возвращается в результате', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, { version: 1, bot: {} });
    const result = loadConfig({ environment: {}, configPath: filePath });
    assert.equal(result.version, 1);
});

test('loadConfig: секции bot/queue/ingress/monitor/plugins в результате', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, {
        version: 1,
        bot: { logLevel: 'debug' },
        plugins: { identity: {} }
    });

    const result = loadConfig({ environment: {}, configPath: filePath });

    assert.deepEqual(Object.keys(result.sections).sort(), ['bot', 'ingress', 'monitor', 'plugins', 'queue']);
    assert.equal(result.sections.bot.logLevel, 'debug');
    assert.deepEqual(result.sections.plugins, { identity: {} });
});

test('loadConfig: monitor-секция (queue-monitor) читается из общего результата', () => {
    const dir = makeTempConfigDir();
    const filePath = writeConfig(dir, {
        version: 1,
        monitor: {
            enabled: true,
            port: 8080,
            metricsApiKey: '$METRICS_API_KEY'
        }
    });

    const result = loadConfig({
        environment: { METRICS_API_KEY: 'synthetic-api-key' },
        configPath: filePath
    });

    assert.equal(result.monitor.monitorEnabled, true);
    assert.equal(result.monitor.monitorPort, 8080);
    assert.equal(result.monitor.metricsApiKey, 'synthetic-api-key');
});
