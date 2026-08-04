const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CURRENT_VERSION,
    getCurrentVersion,
    readVersion,
    checkVersionSupported,
    migrateConfig,
    prepareConfigForLoad
} = require('../../src/bot-platform/core/config-migrations');

test('текущая версия формата — 1', () => {
    assert.equal(CURRENT_VERSION, 1);
    assert.equal(getCurrentVersion(), 1);
});

test('readVersion: отсутствие version = 1', () => {
    const result = readVersion({ bot: {} });
    assert.equal(result.version, 1);
    assert.equal(result.error, null);
});

test('readVersion: явная version читается', () => {
    const result = readVersion({ version: 1 });
    assert.equal(result.version, 1);
    assert.equal(result.error, null);
});

test('readVersion: невалидная version — ошибка', () => {
    assert.ok(readVersion({ version: 'abc' }).error);
    assert.ok(readVersion({ version: 0 }).error);
    assert.ok(readVersion([]).error);
});

test('checkVersionSupported: версия выше текущей — отказ (fail loudly)', () => {
    const result = checkVersionSupported(CURRENT_VERSION + 1);
    assert.equal(result.ok, false);
    assert.match(result.error, /новее поддерживаемой/);
});

test('checkVersionSupported: текущая и ниже — ок', () => {
    assert.equal(checkVersionSupported(CURRENT_VERSION).ok, true);
    assert.equal(checkVersionSupported(1).ok, true);
});

test('prepareConfigForLoad: версия выше — ошибка', () => {
    const result = prepareConfigForLoad({ version: CURRENT_VERSION + 1 });
    assert.ok(result.error);
    assert.match(result.error, /новее поддерживаемой/);
});

test('prepareConfigForLoad: текущая версия проходит без миграций', () => {
    const result = prepareConfigForLoad({ version: CURRENT_VERSION, bot: { logLevel: 'debug' } });
    assert.equal(result.error, null);
    assert.equal(result.version, CURRENT_VERSION);
    assert.deepEqual(result.config, { version: CURRENT_VERSION, bot: { logLevel: 'debug' } });
});

test('prepareConfigForLoad: отсутствие version нормализуется до 1', () => {
    const result = prepareConfigForLoad({ bot: {} });
    assert.equal(result.error, null);
    assert.equal(result.version, CURRENT_VERSION);
});

test('prepareConfigForLoad: отсутствие version добавляет ключ в конфиг (M3)', () => {
    // Регрессия: Apply через UI/import писал активный файл без верхнеуровневого
    // version, расходясь с --generate-config и примерами в доках.
    const result = prepareConfigForLoad({ bot: { logLevel: 'debug' } });
    assert.equal(result.error, null);
    assert.equal(result.version, CURRENT_VERSION);
    assert.deepEqual(result.config, { version: CURRENT_VERSION, bot: { logLevel: 'debug' } });
});

test('prepareConfigForLoad: отсутствие version не мутирует исходный объект', () => {
    const raw = { bot: {} };
    prepareConfigForLoad(raw);
    assert.deepEqual(raw, { bot: {} });
});

test('migrateConfig: миграция детерминирована и идемпотентна', () => {
    const original = { version: 1, bot: { logLevel: 'debug' } };
    const first = migrateConfig(original, 1);
    const second = migrateConfig(first.config, first.version);

    assert.equal(first.version, CURRENT_VERSION);
    assert.deepEqual(second.config, first.config);
});

test('migrateConfig: исходный объект не мутируется', () => {
    const original = { version: 1, bot: { logLevel: 'debug' } };
    migrateConfig(original, 1);
    assert.deepEqual(original, { version: 1, bot: { logLevel: 'debug' } });
});
