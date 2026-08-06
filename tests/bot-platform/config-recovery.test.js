const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCore } = require('../../src/bot-platform/core');
const { startBotPlatformService, createBotPlatformApp } = require('../../src/bot-platform/app');
const { writeLkg, writePending, serviceFilePaths } = require('../../src/bot-platform/core/config-store');

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

test('createCore: предыдущий boot не подтверждён и окно StartupWait истекло → авто-откат на lkg', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    // Apply инициировал рестарт, первый boot стартовал (lastBoot записан),
    // но не вышел на ready; окно StartupWait с тех пор истекло (L3 review:
    // окно считается от lastBoot/первого boot, а не от appliedAt).
    const { serviceFilePaths, computeConfigHash } = require('../../src/bot-platform/core/config-store');
    fs.writeFileSync(serviceFilePaths(configPath).pendingPath, JSON.stringify({
        hash: computeConfigHash({ version: 1, bot: { logLevel: 'debug' } }),
        appliedAt: new Date(Date.now() - 120_000).toISOString(),
        lastBoot: new Date(Date.now() - 31_000).toISOString(),
        restartInitiated: true,
        boots: 0
    }, null, 2));

    const core = createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath });

    assert.equal(core.recoveryState, 'rolled_back');
    assert.equal(core.restoredFrom, 'lkg');
    assert.equal(core.config.logLevel, 'info');
});

test('createCore: restartInitiated, первый boot, старый appliedAt (медленный рестарт) — отката нет (L3 review)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    // appliedAt давний: рестарт-цикл занял больше окна. Окно стартует с
    // первого boot — медленный, но штатный рестарт не откатывается.
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, Date.now() - 120_000, { restartInitiated: true });

    const core = createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath });

    assert.equal(core.recoveryState, 'ok');
    assert.equal(core.config.logLevel, 'debug', 'медленный рестарт не откатывается');
});

test('createCore: ручной рестарт — первый boot со старым appliedAt продолжается', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    // Оператор применил Apply вручную и рестартует спустя заметное время.
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, Date.now() - 10 * 60_000);

    const core = createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath });

    assert.equal(core.recoveryState, 'ok');
    assert.equal(core.config.logLevel, 'debug', 'применённый конфиг не откатывается');
});

// M2 (review PR #23): детектор выполняется ровно один раз за boot.
// Регрессия: main() создаёт app один раз (createBotPlatformApp) и передаёт
// его в startBotPlatformService через options.app. Раньше сервис создавал
// ВТОРОЙ app — runStartupConfigDetector отрабатывал дважды за boot (двойной
// инкремент boots: crash-loop откат после 3 boot вместо 5). Live-режим не
// затронут (startLiveBotPlatformService создаёт свой сервис, не app.js).
test('M2: startBotPlatformService с переданным app не запускает детектор повторно (boots = 1 за boot)', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });
    // Свежий pending (штатный restart после Apply): hash совпадает с активным
    // файлом → детектор инкрементит boots на 1 и записывает lastBoot.
    writePending(configPath, { version: 1, bot: { logLevel: 'debug' } }, undefined, { restartInitiated: true });

    const environment = { ...envWithSecrets, ZYABLIK_CONFIG: configPath };
    // Штатный поток main(): app создаётся ОДИН раз...
    const app = createBotPlatformApp(environment);
    // ...и передаётся в сервис. Старый код создал бы здесь второй app.
    // autoStart:false — цикл long-polling не запускаем, нужен только сам
    // факт создания сервиса (и отсутствие повторного createBotPlatformApp).
    const service = startBotPlatformService(environment, { app, autoStart: false });

    assert.ok(service, 'сервис создаётся');
    const pending = JSON.parse(fs.readFileSync(serviceFilePaths(configPath).pendingPath, 'utf8'));
    assert.equal(pending.boots, 1, 'один boot — ровно один инкремент boots');
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

// C1 (review): коррупция (невалидный JSON) активного файла должна попадать
// в карантин + восстановление lkg, а не ронять createCore raw-исключением.
test('createCore: битый JSON активного файла с lkg → карантин + восстановление', () => {
    const dir = makeTempConfigDir();
    const configPath = path.join(dir, 'zyablik.config.json');
    fs.writeFileSync(configPath, '{ version: 1, bot: { logLevel: "info"', 'utf8');
    writeLkg(configPath, { version: 1, bot: { logLevel: 'info' } });

    const core = createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath });

    assert.equal(core.recoveryState, 'quarantine');
    assert.ok(core.quarantinePath.endsWith('.bad.json'));
    assert.equal(core.config.logLevel, 'info');
    const quarantineContent = fs.readFileSync(core.quarantinePath, 'utf8');
    assert.match(quarantineContent, /logLevel/, 'карантин содержит сырой битый файл-улику');
});

// C1 (review): битый JSON активного файла без lkg → отказ старта (fail loudly).
test('createCore: битый JSON активного файла без lkg → отказ старта (throw)', () => {
    const dir = makeTempConfigDir();
    const configPath = path.join(dir, 'zyablik.config.json');
    fs.writeFileSync(configPath, '{ broken json', 'utf8');

    assert.throws(
        () => createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath }),
        (error) => {
            assert.equal(error.code, 'CONFIG_STARTUP_REFUSED');
            return true;
        }
    );
});

// C1 (review): битый JSON lkg при штатном старте (активный валиден, без pending)
// не блокирует старт — lkg нужен только для восстановления.
test('createCore: битый JSON lkg при валидном активном → старт продолжается', () => {
    const dir = makeTempConfigDir();
    const configPath = writeConfig(dir, { version: 1, bot: { logLevel: 'debug' } });
    fs.writeFileSync(`${configPath}.lkg`, '{ broken json', 'utf8');

    const core = createCore({ ...envWithSecrets, ZYABLIK_CONFIG: configPath });

    assert.equal(core.recoveryState, 'ok');
    assert.equal(core.config.logLevel, 'debug');
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
