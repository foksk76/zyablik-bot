const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SYSTEM_SCHEMA,
    SYSTEM_SECTION_KEYS,
    validateFieldValue,
    validateSecretField,
    validateSection,
    validateConfigFile,
    defaultsFromSchema,
    isVarReference
} = require('../../src/bot-platform/core/config-schema');

test('системная схема покрывает все секции ADR-0045', () => {
    assert.deepEqual(SYSTEM_SECTION_KEYS, ['bot', 'queue', 'ingress', 'monitor']);
    assert.ok(SYSTEM_SCHEMA.bot.logLevel);
    assert.ok(SYSTEM_SCHEMA.bot.maxBotToken);
    assert.ok(SYSTEM_SCHEMA.queue.enabled);
    assert.ok(SYSTEM_SCHEMA.ingress.enabled);
    assert.ok(SYSTEM_SCHEMA.monitor.enabled);
});

test('validateFieldValue принимает корректные значения', () => {
    assert.equal(validateFieldValue({ type: 'string' }, 'x'), null);
    assert.equal(validateFieldValue({ type: 'number', min: 1, max: 10 }, 5), null);
    assert.equal(validateFieldValue({ type: 'boolean' }, true), null);
    assert.equal(validateFieldValue({ type: 'list' }, ['a']), null);
    assert.equal(validateFieldValue({ type: 'string', enum: ['a', 'b'] }, 'a'), null);
});

test('validateFieldValue отклоняет некорректные значения', () => {
    assert.ok(validateFieldValue({ type: 'string' }, 42));
    assert.ok(validateFieldValue({ type: 'number' }, 1.5));
    assert.ok(validateFieldValue({ type: 'number', min: 1 }, 0));
    assert.ok(validateFieldValue({ type: 'number', max: 10 }, 11));
    assert.ok(validateFieldValue({ type: 'boolean' }, 'true'));
    assert.ok(validateFieldValue({ type: 'list' }, 'a'));
    assert.ok(validateFieldValue({ type: 'string', enum: ['a'] }, 'b'));
});

test('nullable поле принимает null', () => {
    assert.equal(validateFieldValue({ type: 'boolean', nullable: true }, null), null);
    assert.ok(validateFieldValue({ type: 'boolean' }, null));
});

test('idpRelaxSsrf в схеме nullable (ADR-0045 маппинг)', () => {
    const field = SYSTEM_SCHEMA.monitor.idpRelaxSsrf;
    assert.equal(field.type, 'boolean');
    assert.equal(field.nullable, true);
    assert.equal(field.default, null);
    assert.equal(validateFieldValue(field, null), null);
    assert.equal(validateFieldValue(field, true), null);
    assert.equal(validateFieldValue(field, false), null);
});

test('isVarReference распознаёт $VAR-ссылки', () => {
    assert.equal(isVarReference('$MAX_BOT_TOKEN'), true);
    assert.equal(isVarReference('$MAX_BOT_TOKEN1'), true);
    assert.equal(isVarReference('max_bot_token'), false);
    assert.equal(isVarReference('$var'), false);
    assert.equal(isVarReference(''), false);
});

test('validateSecretField: $VAR и пустое валидны, литерал невалиден', () => {
    const secretField = { type: 'string', secret: true };
    assert.equal(validateSecretField(secretField, '$MAX_BOT_TOKEN'), null);
    assert.equal(validateSecretField(secretField, ''), null);
    assert.equal(validateSecretField(secretField, undefined), null);
    assert.ok(validateSecretField(secretField, 'my-literal-secret'));
});

test('validateSection: неизвестный ключ — warning', () => {
    const result = validateSection('bot', { unknownKey: 'x' });
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].key, 'unknownKey');
});

test('validateSection: невалидный тип — ошибка с полем и причиной', () => {
    const result = validateSection('bot', { logLevel: 42 });
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].section, 'bot');
    assert.equal(result.errors[0].key, 'logLevel');
    assert.ok(result.errors[0].reason);
});

test('validateSection: литеральный секрет — ошибка', () => {
    const result = validateSection('bot', { maxBotToken: 'literal-secret' });
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].key, 'maxBotToken');
});

test('validateConfigFile: валидный файл без ошибок', () => {
    const result = validateConfigFile({
        version: 1,
        bot: { logLevel: 'debug' },
        queue: { enabled: true },
        plugins: {}
    });
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
});

test('validateConfigFile: невалидная секция — ошибка', () => {
    const result = validateConfigFile({ bot: { maxPollLimit: 99999 } });
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].key, 'maxPollLimit');
});

test('validateConfigFile: неизвестный ключ верхнего уровня — warning', () => {
    const result = validateConfigFile({ unknownTop: 1 });
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 1);
});

test('validateConfigFile: plugins должен быть объектом', () => {
    const result = validateConfigFile({ plugins: [] });
    assert.equal(result.errors.length, 1);
});

test('validateConfigFile: не объект — ошибка', () => {
    const result = validateConfigFile([]);
    assert.equal(result.errors.length, 1);
});

test('defaultsFromSchema возвращает дефолты по flat-ключу', () => {
    const defaults = defaultsFromSchema();
    assert.equal(defaults.logLevel, 'info');
    assert.equal(defaults.maxTransportMode, 'long_polling');
    assert.equal(defaults.queueEnabled, false);
    assert.equal(defaults.queueMaxAttempts, 5);
    assert.equal(defaults.ingressPort, 8443);
    assert.equal(defaults.monitorPort, 9000);
    assert.equal(defaults.idpRelaxSsrf, null);
    assert.deepEqual(defaults.maxPollTypes, ['message_created', 'bot_started', 'bot_added']);
});
