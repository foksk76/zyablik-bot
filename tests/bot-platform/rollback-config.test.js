const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { rollbackConfigFile, isRollbackConfigCommand, main } = require('../../src/bot-platform/app');
const { writeLkg, writePending, writeStaged } = require('../../src/bot-platform/core/config-store');

function makeTempConfigDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'zyablik-rollback-'));
}

function writeConfig(dir, fileConfig) {
    const filePath = path.join(dir, 'zyablik.json');
    fs.writeFileSync(filePath, JSON.stringify(fileConfig, null, 2), 'utf8');
    return filePath;
}

const envWithSecrets = {
    MAX_BOT_TOKEN: 'synthetic-bot-token',
    METRICS_API_KEY: 'synthetic-api-key'
};

test('rollbackConfigFile: восстанавливает lkg, снимает pending, очищает staged', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } });
    writeStaged(configPath, { version: 1, bot: { logLevel: 'debug' } });

    const stdout = [];
    const result = rollbackConfigFile({ environment: envWithSecrets, configPath }, {
        stdout: { write: (chunk) => stdout.push(chunk) },
        stderr: { write: () => {} }
    });

    assert.equal(result.restoredFrom, 'lkg');
    assert.equal(result.restarted, false, 'без options.restart рестарт не вызывается');
    assert.ok(stdout.join('').includes('systemctl restart'));
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'info');
    assert.equal(fs.existsSync(serviceFilePath(configPath, '.json.pending')), false);
    assert.equal(fs.existsSync(serviceFilePath(configPath, '.staged.json')), false);
});

function serviceFilePath(configPath, suffix) {
    return `${configPath}${suffix}`;
}

test('rollbackConfigFile: с options.restart — рестарт вызывается', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });

    let restarted = false;
    const result = rollbackConfigFile({
        environment: envWithSecrets,
        configPath,
        restart: () => { restarted = true; }
    }, {
        stdout: { write: () => {} },
        stderr: { write: () => {} }
    });

    assert.equal(restarted, true);
    assert.equal(result.restarted, true);
});

test('rollbackConfigFile: без lkg — ошибка', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: {} });

    assert.throws(
        () => rollbackConfigFile({ environment: envWithSecrets, configPath }, {
            stdout: { write: () => {} },
            stderr: { write: () => {} }
        }),
        /Нет lkg/
    );
});

test('isRollbackConfigCommand', () => {
    assert.equal(isRollbackConfigCommand(['--rollback-config']), true);
    assert.equal(isRollbackConfigCommand(['--rollback-config', '/tmp/x.json']), true);
    assert.equal(isRollbackConfigCommand(['--generate-config']), false);
    assert.equal(isRollbackConfigCommand(['fixture.json']), false);
});

test('main --rollback-config: возвращает 0 и восстанавливает lkg', async () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } });

    const exitCode = await main(['--rollback-config', configPath], {
        stdout: { write: () => {} },
        stderr: { write: () => {} }
    }, { environment: envWithSecrets });

    assert.equal(exitCode, 0);
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'info');
});

test('main --rollback-config без lkg: возвращает 1', async () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: {} });

    const stderr = [];
    const exitCode = await main(['--rollback-config', configPath], {
        stdout: { write: () => {} },
        stderr: { write: (chunk) => stderr.push(chunk) }
    }, { environment: envWithSecrets });

    assert.equal(exitCode, 1);
    assert.ok(stderr.join('').includes('Нет lkg'));
});
