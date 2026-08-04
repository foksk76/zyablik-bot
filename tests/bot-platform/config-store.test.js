const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    serviceFilePaths,
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
    preValidateConfigFile,
    mergePreservedSecrets,
    applyConfig,
    runStartupConfigDetector,
    confirmConfigApplied,
    rollbackConfig,
    DEFAULT_STARTUP_WAIT_MS,
    DEFAULT_MAX_STARTUP_ATTEMPTS,
    computeConfigHash
} = require('../../src/bot-platform/core/config-store');

function makeTempConfigDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'zyablik-store-'));
}

function writeConfig(dir, fileConfig, name = 'zyablik.config.json') {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, JSON.stringify(fileConfig, null, 2), 'utf8');
    return filePath;
}

const validConfig = {
    version: 1,
    bot: { logLevel: 'debug', maxBotToken: '$MAX_BOT_TOKEN' },
    monitor: { metricsApiKey: '$METRICS_API_KEY' }
};

const envWithSecrets = {
    MAX_BOT_TOKEN: 'synthetic-bot-token',
    METRICS_API_KEY: 'synthetic-api-key'
};

// --- Task 1: Staged storage ---

test('staged пишется и читается атомарно', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, validConfig);
    writeStaged(configPath, validConfig);

    assert.ok(stagedExists(configPath));
    assert.deepEqual(readStaged(configPath), validConfig);
});

test('staged очищается', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, validConfig);
    writeStaged(configPath, validConfig);
    clearStaged(configPath);

    assert.equal(stagedExists(configPath), false);
    assert.equal(readStaged(configPath), null);
});

test('readStaged отсутствующего staged — null', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, validConfig);
    assert.equal(readStaged(configPath), null);
});

// --- Task 2: Apply ---

test('preValidateConfigFile: валидный конфиг проходит', () => {
    const result = preValidateConfigFile(validConfig, { environment: envWithSecrets });
    assert.ok(result.hash);
    assert.equal(result.fileConfig.bot.logLevel, 'debug');
});

test('preValidateConfigFile: литеральный секрет — ошибка', () => {
    assert.throws(
        () => preValidateConfigFile(
            { version: 1, bot: { maxBotToken: 'literal' } },
            { environment: envWithSecrets }
        ),
        (error) => {
            assert.equal(error.code, 'CONFIG_VALIDATION_ERROR');
            assert.equal(error.details.reason, 'schema');
            return true;
        }
    );
});

test('preValidateConfigFile: неразрешённый $VAR секрета — ошибка', () => {
    assert.throws(
        () => preValidateConfigFile(
            { version: 1, bot: { maxBotToken: '$MAX_BOT_TOKEN' } },
            { environment: {} }
        ),
        (error) => {
            assert.equal(error.code, 'CONFIG_SECRET_VAR_UNRESOLVED');
            return true;
        }
    );
});

test('preValidateConfigFile: version выше текущей — ошибка', () => {
    assert.throws(
        () => preValidateConfigFile({ version: 999, bot: {} }, { environment: {} }),
        (error) => {
            assert.equal(error.code, 'CONFIG_VALIDATION_ERROR');
            assert.equal(error.details.reason, 'version');
            return true;
        }
    );
});

test('applyConfig: pre-validate перед записью, отказ не трогает активный конфиг', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'info' } });
    const before = fs.readFileSync(configPath, 'utf8');

    assert.throws(() => applyConfig(configPath, { version: 1, bot: { maxBotToken: 'literal' } }, { environment: {} }));

    assert.equal(fs.readFileSync(configPath, 'utf8'), before, 'активный конфиг не изменён');
    assert.equal(lkgExists(configPath), false, 'lkg не пишется при отказе');
});

test('applyConfig: lkg сохраняет предыдущий активный конфиг', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'info' } });

    applyConfig(configPath, { version: 1, bot: { logLevel: 'debug', maxBotToken: '$MAX_BOT_TOKEN' } }, {
        environment: envWithSecrets,
        restart: () => {}
    });

    assert.deepEqual(readLkg(configPath), { version: 1, bot: { logLevel: 'info' } });
});

test('applyConfig: атомарный write + очистка staged + рестарт', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'info' } });
    writeStaged(configPath, { version: 1, bot: { logLevel: 'debug' } });

    let restarted = false;
    const result = applyConfig(configPath, { version: 1, bot: { logLevel: 'debug', maxBotToken: '$MAX_BOT_TOKEN' } }, {
        environment: envWithSecrets,
        restart: () => { restarted = true; }
    });

    assert.ok(restarted);
    assert.ok(result.lkgWritten);
    assert.equal(stagedExists(configPath), false);
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'debug');
});

test('applyConfig: хеш применяемого конфига', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: {} });
    const fileConfig = { version: 1, bot: { logLevel: 'debug' } };
    const result = applyConfig(configPath, fileConfig, { environment: {}, restart: () => {} });
    assert.equal(result.hash, computeConfigHash(fileConfig));
});

// --- Task 5 (Sprint 41): секреты не затираются при частичном Apply (UI/import) ---

test('mergePreservedSecrets: переносит $VAR-ссылки секретов из активного конфига', () => {
    const active = {
        version: 1,
        bot: { logLevel: 'info', maxBotToken: '$MAX_BOT_TOKEN' },
        monitor: { metricsApiKey: '$METRICS_API_KEY' }
    };
    const staged = {
        version: 1,
        bot: { logLevel: 'debug' },
        monitor: { monitorPort: 9000 }
    };

    const merged = mergePreservedSecrets(active, staged);

    assert.equal(merged.bot.maxBotToken, '$MAX_BOT_TOKEN');
    assert.equal(merged.monitor.metricsApiKey, '$METRICS_API_KEY');
    assert.equal(merged.bot.logLevel, 'debug');
    assert.equal(merged.monitor.monitorPort, 9000);
});

test('mergePreservedSecrets: не трогает литерально заданные секреты', () => {
    const active = {
        version: 1,
        bot: { maxBotToken: '$MAX_BOT_TOKEN' }
    };
    const staged = {
        version: 1,
        bot: { maxBotToken: '$OTHER_VAR' }
    };

    const merged = mergePreservedSecrets(active, staged);
    assert.equal(merged.bot.maxBotToken, '$OTHER_VAR');
});

test('mergePreservedSecrets: пустой/отсутствующий активный конфиг — без изменений', () => {
    const staged = { version: 1, bot: { logLevel: 'debug' } };
    assert.deepEqual(mergePreservedSecrets(null, staged), staged);
    assert.deepEqual(mergePreservedSecrets({}, staged), staged);
});

test('applyConfig: Apply без секретов сохраняет $VAR-ссылки активного конфига', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, {
        version: 1,
        bot: { logLevel: 'info', maxBotToken: '$MAX_BOT_TOKEN' },
        monitor: { metricsApiKey: '$METRICS_API_KEY' }
    });

    const result = applyConfig(configPath, {
        version: 1,
        bot: { logLevel: 'debug' },
        monitor: { monitorPort: 9000 }
    }, {
        environment: envWithSecrets,
        restart: () => {}
    });

    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'debug');
    assert.equal(active.monitor.monitorPort, 9000);
    assert.equal(active.bot.maxBotToken, '$MAX_BOT_TOKEN');
    assert.equal(active.monitor.metricsApiKey, '$METRICS_API_KEY');
    assert.ok(result.lkgWritten);
});

// --- Task 3: Стартовый детектор ---

test('детектор: валидный активный файл — ok', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'ok');
});

test('детектор: невалидный активный файл → карантин bad.json + восстановление lkg', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { maxPollLimit: 99999 } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'debug' } });

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'quarantine');
    assert.ok(fs.existsSync(result.quarantinePath), 'карантинный файл создан');
    assert.ok(result.quarantinePath.endsWith('.bad.json'));
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'debug');
    assert.equal(stagedExists(configPath), false);
});

test('детектор: карантин снимает pending-маркер (нет ложного config.confirmed)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { maxPollLimit: 99999 } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'debug' } });
    // «Применённый» конфиг лежит в pending — как будто Apply был в полёте.
    writePending(configPath, { version: 1, bot: { maxPollLimit: 99999 } });

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'quarantine');
    assert.equal(pendingExists(configPath), false, 'маркер снят вместе с карантином');
    // Последующий confirm() по ready не должен «подтверждать» откаченный конфиг.
    assert.equal(readPending(configPath), null);
});

test('детектор: невалидный активный файл без lkg — отказ (fail loudly)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { maxPollLimit: 99999 } });
    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'refused');
    assert.match(result.reason, /нет lkg/);
});

test('детектор: старый pending-маркер без подтверждения → авто-откат на lkg', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug', maxPollLimit: 50 } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, Date.now() - DEFAULT_STARTUP_WAIT_MS - 1000);

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'rolled_back');
    assert.equal(result.restoredFrom, 'lkg');
    assert.equal(pendingExists(configPath), false);
    assert.equal(stagedExists(configPath), false);
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'info');
});

test('детектор: свежий pending-маркер (штатный restart после Apply) → продолжаем', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug', maxPollLimit: 50 } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } });

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'ok');
    assert.match(result.reason, /окно StartupWait/);
    assert.equal(pendingExists(configPath), true, 'маркер не снимается — подтверждение по ready');
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'debug', 'активный конфиг не откатывается');
});

test('детектор: штатный restart фиксирует lastBoot и счётчик boots в маркере', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } });

    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'ok');

    const marker = readPending(configPath);
    assert.ok(typeof marker.lastBoot === 'string', 'lastBoot записан');
    assert.equal(marker.boots, 1, 'счётчик стартов инкрементирован');
});

test('детектор: медленный, но штатный boot (старый appliedAt, свежий lastBoot) не откатывается', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, Date.now() - DEFAULT_STARTUP_WAIT_MS - 60_000);
    // Симулируем предыдущий старт, который перезаписал lastBoot недавно.
    fs.writeFileSync(serviceFilePaths(configPath).pendingPath, JSON.stringify({
        hash: computeConfigHash({ version: 1, bot: { logLevel: 'debug' } }),
        appliedAt: new Date(Date.now() - 60_000).toISOString(),
        lastBoot: new Date().toISOString(),
        boots: 1
    }, null, 2));

    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'ok', 'штатный (медленный) restart не откатывается');
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'debug');
});

test('детектор: crash-loop — превышение maxStartupAttempts откатывает даже свежий pending', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } });
    // Маркер уже видел maxStartupAttempts стартов без подтверждения.
    fs.writeFileSync(serviceFilePaths(configPath).pendingPath, JSON.stringify({
        hash: computeConfigHash({ version: 1, bot: { logLevel: 'debug' } }),
        appliedAt: new Date().toISOString(),
        lastBoot: new Date().toISOString(),
        boots: DEFAULT_MAX_STARTUP_ATTEMPTS
    }, null, 2));

    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'rolled_back', 'crash-loop откатывается на lkg');
    assert.match(result.reason, /crash-loop/);
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'info');
});

test('детектор: plugins-секция валидируется merged-схемой плагинов', () => {
    const dir = makeTempConfigDir();
    const pluginSchema = { apiToken: { type: 'string', secret: true } };
    const configPath = writeConfig(dir, {
        version: 1,
        plugins: { identity: { apiToken: 'literal-secret' } }
    });
    writeLkg(configPath, { version: 1, plugins: { identity: {} } });

    const result = runStartupConfigDetector(configPath, {
        environment: {},
        plugins: [{ name: 'identity', configSchema: pluginSchema }]
    });

    assert.equal(result.state, 'quarantine', 'литеральный секрет плагина → карантин');
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepEqual(active.plugins, { identity: {} });
});

test('детектор: без plugins plugins-секция не блокирует старт (warn + ignore)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, {
        version: 1,
        plugins: { identity: { apiToken: 'whatever' } }
    });

    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'ok');
});

test('детектор: pending без lkg — продолжаем, откат невозможен', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, Date.now() - DEFAULT_STARTUP_WAIT_MS - 1000);

    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'ok');
    assert.match(result.reason, /lkg отсутствует/);
});

test('детектор: pending + невалидный lkg — отказ', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { maxPollLimit: 99999 } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, Date.now() - DEFAULT_STARTUP_WAIT_MS - 1000);

    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'refused');
    assert.match(result.reason, /невалидный lkg/);
});

test('детектор: рантайм-краш без маркера — отката нет', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });

    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'ok', 'без маркера авто-отката нет');
});

// --- Ready / confirmed ---

test('confirmConfigApplied: снимает pending-маркер по ready', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, validConfig);
    writePending(configPath, validConfig);

    assert.equal(pendingExists(configPath), true);
    assert.equal(confirmConfigApplied(configPath), true);
    assert.equal(pendingExists(configPath), false);
});

test('confirmConfigApplied: без маркера — false', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, validConfig);
    assert.equal(confirmConfigApplied(configPath), false);
});

// --- Task 4: Ручной rollback ---

test('rollbackConfig: восстанавливает lkg + снимает pending + очищает staged', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } });
    writeStaged(configPath, { version: 1, bot: { logLevel: 'debug' } });

    let restarted = false;
    const result = rollbackConfig(configPath, { restart: () => { restarted = true; } });

    assert.ok(restarted);
    assert.equal(result.restoredFrom, 'lkg');
    assert.equal(pendingExists(configPath), false);
    assert.equal(stagedExists(configPath), false);
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'info');
});

test('rollbackConfig: без lkg — ошибка', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: {} });
    assert.throws(() => rollbackConfig(configPath, {}), /Нет lkg/);
});

test('rollbackConfig: невалидный lkg — ошибка', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: {} });
    writeLkg(configPath, { version: 1, bot: { maxPollLimit: 99999 } });
    assert.throws(
        () => rollbackConfig(configPath, {}),
        (error) => {
            assert.equal(error.code, 'CONFIG_VALIDATION_ERROR');
            return true;
        }
    );
});

test('DEFAULT_STARTUP_WAIT_MS = 30 секунд', () => {
    assert.equal(DEFAULT_STARTUP_WAIT_MS, 30_000);
});
