const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCore } = require('../../src/bot-platform/core');
const { writeLkg, writePending } = require('../../src/bot-platform/core/config-store');

function makeTempConfigDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'zyablik-core-'));
}

function writeConfig(dir, fileConfig, name = 'zyablik.config.json') {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, JSON.stringify(fileConfig, null, 2), 'utf8');
    return filePath;
}

const envWithSecrets = {
    MAX_BOT_TOKEN: 'synthetic-bot-token',
    METRICS_API_KEY: 'synthetic-api-key'
};

test('createCore: без файла конфига — recoveryState отсутствует', () => {
    const dir = makeTempConfigDir();
    const core = createCore({ ...envWithSecrets, ZYABLIK_CONFIG: path.join(dir, 'nonexistent.json') });

    assert.equal(core.configFileExists, false);
    assert.equal(core.recoveryState, undefined);
});

test('createCore: валидный файл — recoveryState ok', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    const core = createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath });

    assert.equal(core.configFileExists, true);
    assert.equal(core.recoveryState, 'ok');
    assert.equal(core.config.logLevel, 'debug');
});

test('createCore: свежий pending (штатный restart после Apply) → продолжаем', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } });

    const core = createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath });

    assert.equal(core.recoveryState, 'ok');
    assert.equal(core.config.logLevel, 'debug');
});

test('createCore: старый pending без подтверждения → авто-откат на lkg', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, Date.now() - 31_000);

    const core = createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath });

    assert.equal(core.recoveryState, 'rolled_back');
    assert.equal(core.restoredFrom, 'lkg');
    assert.equal(core.config.logLevel, 'info');
});

test('createCore: невалидный файл с lkg → карантин + восстановление', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { maxPollLimit: 99999 } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });

    const core = createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath });

    assert.equal(core.recoveryState, 'quarantine');
    assert.ok(core.quarantinePath.endsWith('.bad.json'));
    assert.equal(core.config.logLevel, 'info');
});

test('createCore: невалидный файл без lkg → отказ старта (throw)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { maxPollLimit: 99999 } });

    assert.throws(
        () => createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath }),
        (error) => {
            assert.equal(error.code, 'CONFIG_STARTUP_REFUSED');
            return true;
        }
    );
});

test('createCore: plugins-секция валидируется merged-схемой на старте (литеральный секрет → карантин)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, {
        version: 1,
        plugins: { identity: { apiToken: 'literal-secret' } }
    });
    writeLkg(configPath, { version: 1, plugins: { identity: {} } });

    const core = createCore(
        { ...envWithSecrets, ZYABLIK_CONFIG: configPath },
        { plugins: [{ name: 'identity', configSchema: { apiToken: { type: 'string', secret: true } } }] }
    );

    assert.equal(core.recoveryState, 'quarantine');
    assert.ok(core.quarantinePath.endsWith('.bad.json'));
    assert.deepEqual(core.sections.plugins, { identity: {} });
});
