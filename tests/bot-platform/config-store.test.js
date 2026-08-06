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
    computeConfigHash,
    atomicWriteJson
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

test('atomicWriteJson: при сбое rename не оставляет .tmp-мусор (m3)', () => {
    const dir = makeTempConfigDir();
    // Цель — существующая директория: writeFileSync во временный файл
    // проходит, renameSync на директорию падает (EISDIR) → атомарная запись
    // должна убрать временный файл и перебросить ошибку.
    const targetDir = path.join(dir, 'target');
    fs.mkdirSync(targetDir);

    assert.throws(() => atomicWriteJson(targetDir, { a: 1 }));

    const leftovers = fs.readdirSync(dir).filter((name) => name.includes('.tmp-'));
    assert.deepEqual(leftovers, [], 'временный файл должен быть удалён');
    fs.rmSync(dir, { recursive: true, force: true });
});

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

test('applyConfig: versionless конфиг нормализуется — файл и pending.hash согласованы (M1, review R12)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: {} });
    // Прямой вызов applyConfig (будущий CLI): вход без version.
    const fileConfig = { bot: { logLevel: 'debug' } };
    const result = applyConfig(configPath, fileConfig, { environment: {}, restart: () => {} });

    // Активный файл на диске — с явным version (как generate-config/доки).
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.version, 1);
    assert.equal(active.bot.logLevel, 'debug');

    // Возвращённый hash === pending.hash === hash записанного файла.
    const pending = readPending(configPath);
    assert.notEqual(pending, null);
    assert.equal(result.hash, pending.hash);
    assert.equal(result.hash, computeConfigHash(active));
    assert.equal(result.hash, computeConfigHash(result.fileConfig));
    fs.rmSync(dir, { recursive: true, force: true });
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

// --- Task 5 (H2 review): плагины не затираются при частичном Apply ---

const pluginFixture = {
    name: 'identity',
    configSchema: {
        apiToken: { type: 'string', secret: true },
        syncMode: { type: 'string', secret: false }
    }
};

test('mergePreservedSecrets: сохраняет объявленные секреты и необъявленные ключи плагина', () => {
    const active = {
        version: 1,
        plugins: {
            identity: {
                apiToken: '$MAX_API_TOKEN',
                syncMode: 'manual',
                undeclaredExtra: 'custom-value'
            }
        }
    };
    const staged = {
        version: 1,
        plugins: {
            identity: {
                syncMode: 'auto'
            }
        }
    };

    const merged = mergePreservedSecrets(active, staged, [pluginFixture]);

    assert.equal(merged.plugins.identity.syncMode, 'auto', 'объявленное несекретное поле — из staged');
    assert.equal(merged.plugins.identity.apiToken, '$MAX_API_TOKEN',
        'объявленный секрет плагина перенесён из активного конфига');
    assert.equal(merged.plugins.identity.undeclaredExtra, 'custom-value',
        'необъявленный configSchema ключ перенесён из активного конфига');
});

test('mergePreservedSecrets: ветка плагина без configSchema сохраняется целиком', () => {
    const active = {
        version: 1,
        plugins: {
            thirdparty: { apiKey: '$THIRD_PARTY_KEY', host: 'https://synthetic.example' }
        }
    };
    const staged = {
        version: 1,
        plugins: {
            thirdparty: { host: 'https://synthetic.example' }
        }
    };

    const merged = mergePreservedSecrets(active, staged, []);

    assert.equal(merged.plugins.thirdparty.host, 'https://synthetic.example');
    assert.equal(merged.plugins.thirdparty.apiKey, '$THIRD_PARTY_KEY',
        'без схемы все ключи плагина сохраняются');
});

test('mergePreservedSecrets: не создаёт ветку плагина, отсутствующую в staged', () => {
    const active = {
        version: 1,
        plugins: {
            identity: { apiToken: '$MAX_API_TOKEN' }
        }
    };
    const staged = {
        version: 1,
        plugins: {
            other: { host: 'https://synthetic.example' }
        }
    };

    const merged = mergePreservedSecrets(active, staged, [pluginFixture]);
    assert.equal(merged.plugins.identity, undefined, 'удаление плагина не блокируется');
    assert.equal(merged.plugins.other.host, 'https://synthetic.example');
});

test('applyConfig: Apply с plugins сохраняет секреты и необъявленные ключи плагина', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, {
        version: 1,
        plugins: {
            identity: {
                apiToken: '$MAX_API_TOKEN',
                syncMode: 'manual',
                undeclaredExtra: 'custom-value'
            }
        }
    });

    applyConfig(configPath, {
        version: 1,
        plugins: {
            identity: {
                syncMode: 'auto'
            }
        }
    }, {
        environment: { MAX_API_TOKEN: 'synthetic-token' },
        restart: () => {},
        plugins: [pluginFixture]
    });

    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.plugins.identity.syncMode, 'auto');
    assert.equal(active.plugins.identity.apiToken, '$MAX_API_TOKEN');
    assert.equal(active.plugins.identity.undeclaredExtra, 'custom-value');
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

test('детектор: карантин работает при имени конфига без .json (нет no-op rename)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { maxPollLimit: 99999 } }, 'zyablik.config');
    writeLkg(configPath, { version: 1, bot: { logLevel: 'debug' } });

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'quarantine');
    assert.ok(result.quarantinePath, 'карантинный путь есть');
    assert.notEqual(result.quarantinePath, configPath, 'карантин — отдельный файл, а не no-op rename');
    assert.ok(fs.existsSync(result.quarantinePath), 'карантинный файл создан');
    assert.ok(result.quarantinePath.endsWith('.bad.json'));
    // В карантине — невалидная улика, активный файл восстановлен из lkg.
    const quarantine = JSON.parse(fs.readFileSync(result.quarantinePath, 'utf8'));
    assert.equal(quarantine.bot.maxPollLimit, 99999);
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'debug');
});

test('детектор: невалидный активный файл без lkg — отказ (fail loudly)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { maxPollLimit: 99999 } });
    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'refused');
    assert.match(result.reason, /нет lkg/);
});

test('детектор: авто-рестарт — предыдущий boot не подтверждён и окно StartupWait истекло → авто-откат на lkg (с карантином)', () => {
    const dir = makeTempConfigDir();
    // Активный файл = применённый конфиг (applyConfig пишет и pending.hash,
    // и активный файл из одного объекта — hash должен совпадать).
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    // Apply инициировал рестарт, первый boot стартовал (lastBoot записан),
    // но не вышел на ready; окно StartupWait с тех пор истекло.
    fs.writeFileSync(serviceFilePaths(configPath).pendingPath, JSON.stringify({
        hash: computeConfigHash({ version: 1, bot: { logLevel: 'debug' } }),
        appliedAt: new Date(Date.now() - 120_000).toISOString(),
        lastBoot: new Date(Date.now() - DEFAULT_STARTUP_WAIT_MS - 1000).toISOString(),
        restartInitiated: true,
        boots: 0
    }, null, 2));

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'rolled_back');
    assert.equal(result.restoredFrom, 'lkg');
    assert.equal(pendingExists(configPath), false);
    assert.equal(stagedExists(configPath), false);
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'info');
    // Применённый конфиг сохраняется в карантин как улика.
    assert.ok(result.quarantinePath && fs.existsSync(result.quarantinePath), 'активный файл карантинирован');
    const quarantine = JSON.parse(fs.readFileSync(result.quarantinePath, 'utf8'));
    assert.equal(quarantine.bot.logLevel, 'debug', 'в карантине — применённый (не подтверждённый) конфиг');
});

test('детектор: restartInitiated, первый boot, старый appliedAt (медленный рестарт) — окно с момента boot, отката нет (L3 review)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    // appliedAt давний: рестарт-цикл занял больше окна (graceful stop + старт).
    // Окно стартует с первого boot — ложного отката нет.
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, Date.now() - 120_000, { restartInitiated: true });

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'ok', 'медленный рестарт не откатывается');
    assert.match(result.reason, /окно StartupWait/);
    assert.equal(pendingExists(configPath), true, 'маркер сохраняется — подтверждение по ready');
    const marker = readPending(configPath);
    assert.ok(typeof marker.lastBoot === 'string', 'первый boot зафиксирован в маркере');
    assert.equal(marker.boots, 1, 'счётчик стартов инкрементирован');
});

test('детектор: ручной рестарт — первый boot со старым appliedAt НЕ откатывается', () => {
    const dir = makeTempConfigDir();
    // Активный файл = применённый конфиг (hash должен совпадать с pending.hash).
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    // Оператор применил Apply (без авто-рестарта) и рестартует вручную спустя
    // заметное время: задержка между Apply и рестартом — не признак краша.
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, Date.now() - 10 * 60_000);

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'ok', 'первый boot после ручного Apply продолжается');
    assert.match(result.reason, /без окна StartupWait/);
    assert.equal(pendingExists(configPath), true, 'маркер не снимается — подтверждение по ready');
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'debug', 'применённый конфиг не откатывается');
});

test('детектор: свежий pending-маркер (штатный restart после Apply) → продолжаем', () => {
    const dir = makeTempConfigDir();
    // Активный файл = применённый конфиг (hash должен совпадать с pending.hash).
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, undefined, { restartInitiated: true });

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
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, undefined, { restartInitiated: true });

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

// R13-M2 (review PR #23): trade-off — ЛЮБОЙ следующий boot после истечения
// окна StartupWait (> startupWaitMs от lastBoot) откатывает конфиг к lkg,
// даже при одиночном краше до подтверждения (boots здесь 2 ≤ 5 — это НЕ
// crash-loop). Окно — защита от crash-loop, подтверждение — забота
// confirmConfig; поведение фиксируется тестом, чтобы будущие изменения не
// «исправили» его случайно без ADR.
test('детектор: 2-й boot через >30s от lastBoot → авто-откат даже без crash-loop (R13-M2)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    // Первый boot (boots=1) записал lastBoot, но не вышел на ready; с тех пор
    // прошло больше окна StartupWait. Второй boot (boots=2 ≤ maxStartupAttempts)
    // — одиночный краш — тем не менее откатывается (окно истекло).
    fs.writeFileSync(serviceFilePaths(configPath).pendingPath, JSON.stringify({
        hash: computeConfigHash({ version: 1, bot: { logLevel: 'debug' } }),
        appliedAt: new Date(Date.now() - 120_000).toISOString(),
        lastBoot: new Date(Date.now() - DEFAULT_STARTUP_WAIT_MS - 1000).toISOString(),
        restartInitiated: true,
        boots: 1
    }, null, 2));

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'rolled_back');
    assert.doesNotMatch(result.reason, /crash-loop/, 'одиночный краш — это не crash-loop');
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'info');
});

test('детектор: активный файл изменён после Apply (hash ≠ pending.hash) — маркер снят, окно StartupWait отменено (L2 review)', () => {
    const dir = makeTempConfigDir();
    // Apply записал pending.hash для {logLevel: 'debug'}, затем оператор вручную
    // поменял активный файл — pending больше не соответствует тому, что на диске.
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug', maxPollLimit: 30 } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, Date.now() - 1000, { restartInitiated: true });

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'ok', 'правка оператора не откатывается');
    assert.match(result.reason, /pending-маркер устарел/);
    assert.equal(pendingExists(configPath), false, 'устаревший маркер снят');
    assert.equal(stagedExists(configPath), false);
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.maxPollLimit, 30, 'изменённый активный файл сохранён как есть');
});

test('детектор: hash активного файла совпадает с pending.hash — штатный restart продолжается (L2 review)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, undefined, { restartInitiated: true });

    const result = runStartupConfigDetector(configPath, { environment: {} });

    assert.equal(result.state, 'ok');
    assert.match(result.reason, /окно StartupWait/);
    assert.equal(pendingExists(configPath), true, 'маркер сохраняется — подтверждение по ready');
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

test('детектор: авто-рестарт, окно StartupWait истекло, но lkg отсутствует — продолжаем (откат невозможен)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    // Предыдущий boot (lastBoot) стартовал, но не подтвердился; окно истекло.
    fs.writeFileSync(serviceFilePaths(configPath).pendingPath, JSON.stringify({
        hash: computeConfigHash({ version: 1, bot: { logLevel: 'debug' } }),
        appliedAt: new Date(Date.now() - 120_000).toISOString(),
        lastBoot: new Date(Date.now() - DEFAULT_STARTUP_WAIT_MS - 1000).toISOString(),
        restartInitiated: true,
        boots: 0
    }, null, 2));

    const result = runStartupConfigDetector(configPath, { environment: {} });
    assert.equal(result.state, 'ok');
    assert.match(result.reason, /lkg отсутствует/);
});

test('детектор: окно истекло + невалидный lkg — отказ', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { maxPollLimit: 99999 } });
    // Предыдущий boot (lastBoot) стартовал, но не подтвердился; окно истекло.
    fs.writeFileSync(serviceFilePaths(configPath).pendingPath, JSON.stringify({
        hash: computeConfigHash({ version: 1, bot: { logLevel: 'debug' } }),
        appliedAt: new Date(Date.now() - 120_000).toISOString(),
        lastBoot: new Date(Date.now() - DEFAULT_STARTUP_WAIT_MS - 1000).toISOString(),
        restartInitiated: true,
        boots: 0
    }, null, 2));

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

test('confirmConfigApplied: активный файл изменён после Apply — маркер снят, конфиг НЕ подтверждается (L2 review)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, validConfig);
    writePending(configPath, validConfig);
    // Ручная правка активного файла после Apply: pending.hash больше не совпадает.
    const edited = JSON.parse(JSON.stringify(validConfig));
    edited.bot.logLevel = 'warning';
    atomicWriteJson(configPath, edited);

    assert.equal(pendingExists(configPath), true);
    assert.equal(confirmConfigApplied(configPath), false, 'ложного config.confirmed нет');
    assert.equal(pendingExists(configPath), false, 'устаревший маркер снят');
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

// L2 (review R7): ручной rollback карантинит текущий активный файл перед
// записью lkg (асимметрия с авто-откатом, который сохраняет «плохой» конфиг
// как улику). Худший случай — битый JSON активного файла: rollback не должен
// молча затирать его без улики.
test('rollbackConfig: текущий активный файл карантинится перед восстановлением lkg (L2 R7)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });

    const result = rollbackConfig(configPath, {});

    assert.ok(result.quarantinePath, 'карантинный путь в результате');
    assert.ok(result.quarantinePath.endsWith('.bad.json'));
    assert.ok(fs.existsSync(result.quarantinePath), 'активный файл карантинизирован');
    const quarantine = JSON.parse(fs.readFileSync(result.quarantinePath, 'utf8'));
    assert.equal(quarantine.bot.logLevel, 'debug', 'в карантине — откатываемый (текущий активный) конфиг');
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'info', 'активный файл восстановлен из lkg');
});

// M1 (review R6): битый lkg (коррупция JSON) — CONFIG_VALIDATION_ERROR, а не
// raw SyntaxError: rollback — самая аварийная операция, битый lkg в ней
// наиболее вероятен, и API не должен отвечать 500 (остальное окружение
// уже толерантно через readJsonFileSafe).
test('rollbackConfig: битый lkg — ошибка валидации (не raw SyntaxError)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: {} });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    fs.writeFileSync(`${configPath}.lkg`, '{ broken json', 'utf8');
    assert.throws(
        () => rollbackConfig(configPath, {}),
        (error) => {
            assert.equal(error.code, 'CONFIG_VALIDATION_ERROR');
            assert.equal(error.details && error.details.reason, 'corrupt-lkg');
            return true;
        }
    );
    // Активный файл и lkg не тронуты (откат не выполнен).
    assert.equal(lkgExists(configPath), true);
    assert.equal(stagedExists(configPath), false);
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

// M3 (review R5): rollbackConfig валидирует lkg по configSchema плагинов,
// как apply/detector/import. Без plugins ветка, нарушающая схему, прошла бы
// ручной rollback (warn+ignore), но упала бы в детекторе на следующем boot.
test('rollbackConfig: невалидная по configSchema ветка плагина в lkg — ошибка (M3)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: {} });
    writeLkg(configPath, {
        version: 1,
        bot: {},
        plugins: { identity: { syncMode: 'nope' } }
    });
    const identityPlugin = {
        name: 'identity',
        configSchema: {
            syncMode: { type: 'enum', enum: ['auto', 'manual'], default: 'auto' }
        }
    };
    // Без plugins — проходит (warn+ignore), старый API-rollback не видел ошибку.
    rollbackConfig(configPath, {});
    writeLkg(configPath, {
        version: 1,
        bot: {},
        plugins: { identity: { syncMode: 'nope' } }
    });
    // С plugins — CONFIG_VALIDATION_ERROR (как apply/detector/import).
    assert.throws(
        () => rollbackConfig(configPath, { plugins: [identityPlugin] }),
        (error) => {
            assert.equal(error.code, 'CONFIG_VALIDATION_ERROR');
            assert.ok(error.details && Array.isArray(error.details.errors));
            const detail = String(error.details.errors.map((e) => `${e.key} ${e.reason}`).join(' '));
            assert.match(detail, /identity\.syncMode/);
            assert.match(detail, /auto/);
            return true;
        }
    );
    // Валидная ветка плагина с plugins — проходит.
    writeLkg(configPath, {
        version: 1,
        bot: {},
        plugins: { identity: { syncMode: 'manual' } }
    });
    const result = rollbackConfig(configPath, { plugins: [identityPlugin], restart: () => {} });
    assert.equal(result.restoredFrom, 'lkg');
});

test('DEFAULT_STARTUP_WAIT_MS = 30 секунд', () => {
    assert.equal(DEFAULT_STARTUP_WAIT_MS, 30_000);
});
