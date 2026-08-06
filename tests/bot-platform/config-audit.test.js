const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    applyConfig,
    runStartupConfigDetector,
    confirmConfigApplied,
    rollbackConfig,
    logConfigAudit,
    writeLkg,
    writePending
} = require('../../src/bot-platform/core/config-store');

function makeTempConfigDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'zyablik-audit-'));
}

function writeConfig(dir, fileConfig) {
    const filePath = path.join(dir, 'zyablik.config.json');
    fs.writeFileSync(filePath, JSON.stringify(fileConfig, null, 2), 'utf8');
    return filePath;
}

const envWithSecrets = {
    MAX_BOT_TOKEN: 'super-secret-bot-token',
    METRICS_API_KEY: 'super-secret-api-key'
};

function makeAuditSink() {
    const entries = [];
    return {
        entries,
        logger: {
            info: (entry) => entries.push(entry)
        }
    };
}

test('applyConfig: пишет config.applied, config.pending без секретов', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'info' } });
    const sink = makeAuditSink();

    applyConfig(configPath, {
        version: 1,
        bot: { logLevel: 'debug', maxBotToken: '$MAX_BOT_TOKEN' }
    }, { environment: envWithSecrets, logger: sink.logger, restart: () => {} });

    const actions = sink.entries.map((entry) => entry.action);
    assert.deepEqual(actions, ['config.pending', 'config.applied']);

    for (const entry of sink.entries) {
        const serialized = JSON.stringify(entry);
        assert.ok(!serialized.includes('super-secret'), `${entry.action} содержит секрет`);
        assert.ok(!serialized.includes('$MAX_BOT_TOKEN') || entry.action !== 'config.applied');
    }
});

test('rollbackConfig: пишет config.rollback (manual)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    const sink = makeAuditSink();

    rollbackConfig(configPath, { logger: sink.logger, restart: () => {} });

    assert.equal(sink.entries[0].action, 'config.rollback');
    assert.equal(sink.entries[0].context.auto, false);
    assert.equal(sink.entries[0].context.success, true);
});

test('детектор: авто-откат пишет config.rollback (auto)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    // Предыдущий boot (lastBoot) стартовал, но не подтвердился; окно StartupWait
    // истекло (L3 review: окно считается от lastBoot, а не от appliedAt).
    const { serviceFilePaths, computeConfigHash } = require('../../src/bot-platform/core/config-store');
    fs.writeFileSync(serviceFilePaths(configPath).pendingPath, JSON.stringify({
        hash: computeConfigHash({ version: 1, bot: { logLevel: 'debug' } }),
        appliedAt: new Date(Date.now() - 120_000).toISOString(),
        lastBoot: new Date(Date.now() - 31_000).toISOString(),
        restartInitiated: true,
        boots: 0
    }, null, 2));
    const sink = makeAuditSink();

    const result = runStartupConfigDetector(configPath, { environment: {}, logger: sink.logger });

    assert.equal(result.state, 'rolled_back');
    const rollbackEvent = sink.entries.find((entry) => entry.action === 'config.rollback');
    assert.ok(rollbackEvent, 'нет config.rollback');
    assert.equal(rollbackEvent.context.auto, true);
});

test('детектор: карантин пишет config.quarantine', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { maxPollLimit: 99999 } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'debug' } });
    const sink = makeAuditSink();

    const result = runStartupConfigDetector(configPath, { environment: {}, logger: sink.logger });

    assert.equal(result.state, 'quarantine');
    const event = sink.entries.find((entry) => entry.action === 'config.quarantine');
    assert.ok(event, 'нет config.quarantine');
    assert.ok(event.context.quarantinePath.endsWith('.bad.json'));
});

test('детектор: отказ без lkg пишет config.validate_failed', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { maxPollLimit: 99999 } });
    const sink = makeAuditSink();

    const result = runStartupConfigDetector(configPath, { environment: {}, logger: sink.logger });

    assert.equal(result.state, 'refused');
    const event = sink.entries.find((entry) => entry.action === 'config.validate_failed');
    assert.ok(event, 'нет config.validate_failed');
    assert.equal(event.context.recovered, false);
});

test('confirmConfigApplied: пишет config.confirmed с хешем', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } });
    const sink = makeAuditSink();

    const confirmed = confirmConfigApplied(configPath, { logger: sink.logger });

    assert.equal(confirmed, true);
    assert.equal(sink.entries[0].action, 'config.confirmed');
    assert.equal(typeof sink.entries[0].context.hash, 'string');
});

test('confirmConfigApplied: без маркера — события нет', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    const sink = makeAuditSink();

    const confirmed = confirmConfigApplied(configPath, { logger: sink.logger });

    assert.equal(confirmed, false);
    assert.equal(sink.entries.length, 0);
});

test('logConfigAudit: без logger — no-op', () => {
    assert.doesNotThrow(() => logConfigAudit(null, 'config.applied', {}));
    assert.doesNotThrow(() => logConfigAudit({}, 'config.applied', {}));
});

test('аудит не содержит литеральные секреты ни в одном событии', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } });
    const sink = makeAuditSink();

    runStartupConfigDetector(configPath, { environment: envWithSecrets, logger: sink.logger });

    const serialized = JSON.stringify(sink.entries);
    assert.ok(!serialized.includes('super-secret'));
});
