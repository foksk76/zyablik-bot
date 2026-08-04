// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    SECTION_ORDER,
    sectionLabel,
    sectionFields,
    pluginNames,
    pluginFields,
    fieldDefault,
    toFormValue,
    coerceValue,
    validateValue,
    validateSectionValues,
    buildStagedConfig,
    buildDiff
} from '../src/lib/configSchemaModel.js';

const schema = {
    bot: {
        logLevel: { type: 'string', default: 'info' },
        maxPollLimit: { type: 'number', default: 100, min: 1, max: 1000 },
        rateLimitEnabled: { type: 'boolean', default: true },
        maxTransportMode: { type: 'string', enum: ['long_polling', 'webhook'], default: 'long_polling' },
        maxPollTypes: { type: 'list', default: ['NEW_MESSAGE', 'UPDATE_MESSAGE'] },
        maxBotToken: { type: 'string', secret: true, default: '' },
        nullableFlag: { type: 'boolean', default: null, nullable: true }
    },
    queue: {
        queueEnabled: { type: 'boolean', default: false }
    },
    plugins: {
        identity: {
            syncMode: { type: 'enum', enum: ['auto', 'manual'], default: 'auto' },
            apiToken: { type: 'string', secret: true, default: '' }
        }
    }
};

test('SECTION_ORDER and labels', () => {
    assert.deepEqual(SECTION_ORDER, ['bot', 'queue', 'ingress', 'monitor', 'plugins']);
    assert.equal(sectionLabel('bot'), 'Бот');
    assert.equal(sectionLabel('unknown'), 'unknown');
});

test('sectionFields: system and plugins', () => {
    assert.ok(sectionFields(schema, 'bot').logLevel);
    assert.equal(sectionFields(schema, 'plugins').identity.syncMode.type, 'enum');
    assert.deepEqual(sectionFields(schema, 'unknown'), {});
});

test('pluginNames/pluginFields: вложенные группы ConfigForm', () => {
    assert.deepEqual(pluginNames(schema), ['identity']);
    assert.deepEqual(pluginNames({}), []);
    assert.deepEqual(pluginNames(null), []);
    assert.deepEqual(pluginFields(schema, 'identity').syncMode, { type: 'enum', enum: ['auto', 'manual'], default: 'auto' });
    assert.deepEqual(pluginFields(schema, 'unknown'), {});
    assert.deepEqual(pluginFields({}, 'identity'), {});
});

test('fieldDefault: primitives and list copy', () => {
    assert.equal(fieldDefault(schema.bot.logLevel), 'info');
    assert.equal(fieldDefault(schema.bot.maxPollLimit), 100);
    assert.deepEqual(fieldDefault(schema.bot.maxPollTypes), ['NEW_MESSAGE', 'UPDATE_MESSAGE']);
    assert.equal(fieldDefault(undefined), '');
});

test('toFormValue: masks secrets, falls back to defaults', () => {
    assert.deepEqual(toFormValue('$MAX_BOT_TOKEN', schema.bot.maxBotToken), { secret: true, set: true });
    assert.deepEqual(toFormValue('', schema.bot.maxBotToken), { secret: true, set: false });
    assert.equal(toFormValue(undefined, schema.bot.logLevel), 'info');
    assert.equal(toFormValue('debug', schema.bot.logLevel), 'debug');
});

test('coerceValue: number/boolean/enum/list', () => {
    assert.deepEqual(coerceValue('42', schema.bot.maxPollLimit), { ok: true, value: 42 });
    assert.deepEqual(coerceValue('abc', schema.bot.maxPollLimit), { ok: false, value: null });
    assert.deepEqual(coerceValue('2.5', schema.bot.maxPollLimit), { ok: false, value: null });
    assert.deepEqual(coerceValue('true', schema.bot.rateLimitEnabled), { ok: true, value: true });
    assert.deepEqual(coerceValue('long_polling', schema.bot.maxTransportMode), { ok: true, value: 'long_polling' });
    assert.deepEqual(coerceValue('nope', schema.bot.maxTransportMode), { ok: false, value: null });
    assert.deepEqual(coerceValue('a, b', schema.bot.maxPollTypes), { ok: true, value: ['a', 'b'] });
});

test('coerceValue: очищенное поле → дефолт схемы (число/булево/enum)', () => {
    assert.deepEqual(coerceValue('', schema.bot.maxPollLimit), { ok: true, value: 100 });
    assert.deepEqual(coerceValue('', schema.bot.rateLimitEnabled), { ok: true, value: true });
    assert.deepEqual(coerceValue('', schema.bot.maxTransportMode), { ok: true, value: 'long_polling' });
    // Явный null (nullable «—») сохраняется как есть.
    assert.deepEqual(coerceValue(null, schema.bot.maxPollLimit), { ok: true, value: null });
    assert.deepEqual(coerceValue(null, schema.bot.nullableFlag), { ok: true, value: null });
    assert.deepEqual(coerceValue('', schema.bot.nullableFlag), { ok: true, value: null });
});

test('coerceValue: очистка number без дефолта → undefined, а не null (M3 review)', () => {
    const field = { type: 'number' };
    assert.deepEqual(coerceValue('', field), { ok: true, value: undefined });
    assert.equal(validateValue(undefined, field), null);
});

test('coerceValue: очистка string с непустым дефолтом → дефолт', () => {
    assert.deepEqual(coerceValue('', schema.bot.logLevel), { ok: true, value: 'info' });
    assert.deepEqual(coerceValue('', { type: 'string' }), { ok: true, value: '' });
});

test('validateValue: types, min/max, enum', () => {
    assert.equal(validateValue('info', schema.bot.logLevel), null);
    assert.equal(validateValue(50, schema.bot.maxPollLimit), null);
    assert.equal(validateValue(2.5, schema.bot.maxPollLimit), 'ожидается целое число');
    assert.equal(validateValue(0, schema.bot.maxPollLimit), 'меньше минимального значения 1');
    assert.equal(validateValue(5000, schema.bot.maxPollLimit), 'больше максимального значения 1000');
    assert.equal(validateValue('nope', schema.bot.maxTransportMode), 'ожидается одно из: long_polling, webhook');
    assert.equal(validateValue('', schema.bot.logLevel), null); // не required
    assert.equal(validateValue('', schema.bot.logLevel, { required: true }), 'обязательное поле');
    assert.equal(validateValue('anything', schema.bot.maxBotToken), null); // секрет не валидируется
});

test('validateValue: null для не-nullable — ошибка (как на сервере)', () => {
    assert.equal(validateValue(null, schema.bot.maxPollLimit), 'null не допускается для этого поля');
    assert.equal(validateValue(null, schema.bot.rateLimitEnabled), 'null не допускается для этого поля');
    assert.equal(validateValue(null, schema.bot.maxTransportMode), 'null не допускается для этого поля');
    // Nullable — null допустим.
    assert.equal(validateValue(null, schema.bot.nullableFlag), null);
});

test('validateSectionValues: collects errors (namespaced keys)', () => {
    const errors = validateSectionValues({
        logLevel: 'info',
        maxPollLimit: 0,
        maxTransportMode: 'nope'
    }, schema, 'bot');
    assert.ok(errors['bot.maxPollLimit']);
    assert.ok(errors['bot.maxTransportMode']);
    assert.ok(!errors['bot.logLevel']);
    assert.ok(!errors['bot.maxBotToken']); // секрет не в ошибках
});

test('validateSectionValues: plugins — валидирует под-поля с неймспейс-ключами', () => {
    const errors = validateSectionValues({
        identity: { syncMode: 'nope' }
    }, schema, 'plugins');
    assert.ok(errors['identity.syncMode']);
    assert.equal(errors['identity.syncMode'], 'ожидается одно из: auto, manual');
});

test('buildStagedConfig: skips secrets, keeps plugin values', () => {
    const staged = buildStagedConfig({
        bot: { logLevel: 'debug', maxBotToken: { secret: true, set: true } },
        plugins: { identity: { syncMode: 'manual', apiToken: { secret: true, set: true } } }
    }, schema);
    assert.equal(staged.bot.logLevel, 'debug');
    assert.ok(!('maxBotToken' in staged.bot));
    assert.deepEqual(staged.plugins.identity, { syncMode: 'manual' });
});

test('buildStagedConfig: необъявленные ключи плагина не отправляются (m4)', () => {
    // Ветки без configSchema и необъявленные ключи маскируются в API-ответах;
    // в staged их не переносим — маска не должна уехать как литеральное значение.
    const staged = buildStagedConfig({
        plugins: {
            identity: { syncMode: 'manual' },
            legacy: { token: { secret: true, set: true }, syncMode: { secret: true, set: true } }
        }
    }, schema);
    assert.deepEqual(staged.plugins.identity, { syncMode: 'manual' });
    assert.deepEqual(staged.plugins.legacy, {});
});

test('buildDiff: only changed fields', () => {
    const diff = buildDiff(
        { bot: { logLevel: 'info', maxPollLimit: 100 }, plugins: { identity: { syncMode: 'auto' } } },
        { bot: { logLevel: 'debug', maxPollLimit: 100 }, plugins: { identity: { syncMode: 'manual' } } }
    );
    assert.equal(diff.length, 2);
    assert.ok(diff.some((d) => d.section === 'bot' && d.key === 'logLevel' && d.old === 'info' && d.new === 'debug'));
    assert.ok(diff.some((d) => d.section === 'identity' && d.key === 'syncMode'));
});

test('buildDiff: new plugin branch in staged appears in diff (M5 review)', () => {
    const diff = buildDiff(
        { plugins: { identity: { syncMode: 'auto' } } },
        { plugins: { identity: { syncMode: 'auto' }, legacy: { syncMode: 'manual' } } }
    );
    assert.ok(diff.some((d) => d.section === 'legacy' && d.key === 'syncMode' && d.old === null && d.new === 'manual'));
});
