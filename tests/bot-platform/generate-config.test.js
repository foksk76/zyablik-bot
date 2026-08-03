const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { generateConfigFile, parseGenerateConfigArgs } = require('../../src/bot-platform/app');
const { loadConfig, buildConfigFileFromEnvironment } = require('../../src/bot-platform/core/config');

function makeTempConfigDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'zyablik-gen-'));
}

const envExample = {
    MAX_API_URL: 'https://synthetic.example/messages',
    MAX_BOT_TOKEN: 'synthetic-bot-token',
    MAX_HTTP_PROXY: 'http://synthetic-proxy:3128',
    MAX_LOG_LEVEL: 'debug',
    MAX_TRANSPORT_MODE: 'long_polling',
    MAX_POLL_LIMIT: '7',
    MAX_POLL_TIMEOUT_SECONDS: '3',
    MAX_POLL_TYPES: 'message_created',
    QUEUE_ENABLED: 'true',
    QUEUE_MAX_ATTEMPTS: '10',
    QUEUE_INTERVAL_MS: '2000',
    QUEUE_BATCH_SIZE: '50',
    QUEUE_BACKOFF_BASE: '3',
    QUEUE_BACKOFF_MAX: '600',
    INGRESS_ENABLED: 'true',
    INGRESS_PORT: '9443',
    IDP_ISSUER: 'https://synthetic.idp.com',
    IDP_AUDIENCE: 'synthetic-audience',
    MONITOR_ENABLED: 'true',
    MONITOR_PORT: '8080',
    METRICS_API_KEY: 'synthetic-api-key',
    SESSION_SECRET: 'synthetic-session-secret'
};

test('buildConfigFileFromEnvironment: управляемые — в файл, секреты — $VAR', () => {
    const fileConfig = buildConfigFileFromEnvironment(envExample);

    assert.equal(fileConfig.version, 1);
    assert.equal(fileConfig.bot.logLevel, 'debug');
    assert.equal(fileConfig.bot.maxTransportMode, 'long_polling');
    assert.equal(fileConfig.bot.maxPollLimit, 7);
    assert.equal(fileConfig.queue.enabled, true);
    assert.equal(fileConfig.queue.maxAttempts, 10);
    assert.equal(fileConfig.ingress.enabled, true);
    assert.equal(fileConfig.ingress.port, 9443);
    assert.equal(fileConfig.monitor.enabled, true);
    assert.equal(fileConfig.monitor.port, 8080);
});

test('buildConfigFileFromEnvironment: секреты — только $VAR-ссылки', () => {
    const fileConfig = buildConfigFileFromEnvironment(envExample);

    assert.equal(fileConfig.bot.maxBotToken, '$MAX_BOT_TOKEN');
    assert.equal(fileConfig.monitor.metricsApiKey, '$METRICS_API_KEY');
    assert.equal(fileConfig.monitor.sessionSecret, '$SESSION_SECRET');
});

test('buildConfigFileFromEnvironment: base env (неизменяемая база) в файл не попадает', () => {
    const fileConfig = buildConfigFileFromEnvironment(envExample);

    assert.equal(fileConfig.bot.maxApiUrl, undefined);
    assert.equal(fileConfig.ingress.idpIssuer, undefined);
});

test('сгенерированный файл воспроизводит поведение env-конфига', () => {
    const dir = makeTempConfigDir();
    const configPath = path.join(dir, 'zyablik.json');
    const { config: fileConfig } = generateConfigFile({ environment: envExample, configPath }, {
        stdout: { write: () => {} },
        stderr: { write: () => {} }
    });

    const envConfig = loadConfig({
        environment: envExample,
        configPath: path.join(dir, 'env-nonexistent.json')
    });

    const fileLoad = loadConfig({
        environment: envExample,
        configPath
    });

    // Управляемые значения совпадают.
    assert.equal(fileLoad.config.logLevel, envConfig.config.logLevel);
    assert.equal(fileLoad.config.maxPollLimit, envConfig.config.maxPollLimit);
    assert.equal(fileLoad.config.queueEnabled, envConfig.config.queueEnabled);
    assert.equal(fileLoad.config.queueMaxAttempts, envConfig.config.queueMaxAttempts);
    assert.equal(fileLoad.config.ingressPort, envConfig.config.ingressPort);
    assert.equal(fileLoad.config.monitorPort, envConfig.config.monitorPort);
    assert.equal(fileLoad.config.monitorEnabled, envConfig.config.monitorEnabled);

    // Секреты резолвятся из env через $VAR.
    assert.equal(fileLoad.config.maxBotToken, envExample.MAX_BOT_TOKEN);
    assert.equal(fileLoad.config.metricsApiKey, envExample.METRICS_API_KEY);
    assert.equal(fileLoad.config.sessionSecret, envExample.SESSION_SECRET);

    // Неизменяемая база применяется.
    assert.equal(fileLoad.config.maxApiUrl, envExample.MAX_API_URL);
    assert.equal(fileLoad.config.idpIssuer, envExample.IDP_ISSUER);

    // Файл не содержит литеральных секретов.
    const raw = fs.readFileSync(configPath, 'utf8');
    assert.ok(raw.includes('$MAX_BOT_TOKEN'));
    assert.ok(!raw.includes(envExample.MAX_BOT_TOKEN));
    assert.ok(!raw.includes(envExample.METRICS_API_KEY));
});

test('generateConfigFile: существующий файл не перезаписывается', () => {
    const dir = makeTempConfigDir();
    const configPath = path.join(dir, 'zyablik.json');
    fs.writeFileSync(configPath, '{"version":1,"bot":{}}', 'utf8');

    assert.throws(
        () => generateConfigFile({ environment: envExample, configPath }, {
            stdout: { write: () => {} },
            stderr: { write: () => {} }
        }),
        (error) => {
            assert.equal(error.code, 'CONFIG_FILE_EXISTS');
            return true;
        }
    );

    // Содержимое не изменилось.
    assert.equal(fs.readFileSync(configPath, 'utf8'), '{"version":1,"bot":{}}');
});

test('generateConfigFile: --dry-run не пишет файл', () => {
    const dir = makeTempConfigDir();
    const configPath = path.join(dir, 'zyablik.json');
    const stdout = [];
    const result = generateConfigFile({ environment: envExample, configPath, dryRun: true }, {
        stdout: { write: (chunk) => stdout.push(chunk) },
        stderr: { write: () => {} }
    });

    assert.equal(result.dryRun, true);
    assert.equal(fs.existsSync(configPath), false);
    assert.ok(stdout.join('').includes('$MAX_BOT_TOKEN'));
});

test('parseGenerateConfigArgs: --dry-run и путь', () => {
    assert.deepEqual(parseGenerateConfigArgs(['--generate-config']), { dryRun: false, configPath: null });
    assert.deepEqual(parseGenerateConfigArgs(['--generate-config', '--dry-run']), { dryRun: true, configPath: null });
    assert.deepEqual(
        parseGenerateConfigArgs(['--generate-config', '/tmp/x.json', '--dry-run']),
        { dryRun: true, configPath: '/tmp/x.json' }
    );
});

test('main --generate-config: пишет файл, возвращает 0', async () => {
    const dir = makeTempConfigDir();
    const configPath = path.join(dir, 'zyablik.json');
    const { main } = require('../../src/bot-platform/app');

    const exitCode = await main(['--generate-config', configPath], {
        stdout: { write: () => {} },
        stderr: { write: () => {} }
    }, { environment: envExample });

    assert.equal(exitCode, 0);
    assert.ok(fs.existsSync(configPath));
});

test('main --generate-config --dry-run: не пишет, возвращает 0', async () => {
    const dir = makeTempConfigDir();
    const configPath = path.join(dir, 'zyablik.json');
    const { main } = require('../../src/bot-platform/app');

    const exitCode = await main(['--generate-config', '--dry-run', configPath], {
        stdout: { write: () => {} },
        stderr: { write: () => {} }
    }, { environment: envExample });

    assert.equal(exitCode, 0);
    assert.equal(fs.existsSync(configPath), false);
});
