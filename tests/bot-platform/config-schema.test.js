const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SYSTEM_SCHEMA,
    SYSTEM_SECTION_KEYS,
    getMergedConfigSchema,
    validatePluginSection,
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

test('required поле — ошибка для undefined/пустой строки (M2)', () => {
    const field = { type: 'string', required: true };
    assert.equal(validateFieldValue(field, 'x'), null);
    assert.equal(validateFieldValue(field, undefined), 'обязательное поле');
    assert.equal(validateFieldValue(field, ''), 'обязательное поле');
});

test('required + nullable: null для required-поля — ошибка (M2)', () => {
    assert.equal(validateFieldValue({ type: 'string', required: true, nullable: true }, null), 'обязательное поле');
    assert.equal(validateFieldValue({ type: 'string', required: true, nullable: true }, 'x'), null);
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

// --- Merged-схема (ADR-0046) ---

test('getMergedConfigSchema: без плагинов — только системные секции + пустые plugins', () => {
    const merged = getMergedConfigSchema([]);
    assert.deepEqual(SYSTEM_SECTION_KEYS, Object.keys(merged).filter((k) => k !== 'plugins'));
    assert.deepEqual(merged.plugins, {});
    assert.ok(merged.bot.logLevel);
});

test('getMergedConfigSchema: включает configSchema плагинов', () => {
    const plugins = [
        { name: 'identity', configSchema: {} },
        { name: 'alerts', configSchema: { timeout: { type: 'number', default: 5 } } },
        { name: 'no-schema' }
    ];
    const merged = getMergedConfigSchema(plugins);
    assert.deepEqual(merged.plugins.identity, {});
    assert.ok(merged.plugins.alerts.timeout);
    assert.equal(merged.plugins.noSchema, undefined);
    assert.equal(merged.plugins['no-schema'], undefined);
});

test('getMergedConfigSchema: identity без рантайм-полей — пустая ветка', () => {
    const merged = getMergedConfigSchema([{ name: 'identity', configSchema: {} }]);
    assert.deepEqual(merged.plugins.identity, {});
});

test('validatePluginSection: валидные значения плагина — без ошибок', () => {
    const schema = { timeout: { type: 'number', min: 1, max: 60 } };
    const result = validatePluginSection('alerts', schema, { timeout: 30 });
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
});

test('validatePluginSection: невалидный тип — ошибка', () => {
    const schema = { timeout: { type: 'number', min: 1, max: 60 } };
    const result = validatePluginSection('alerts', schema, { timeout: 'x' });
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].key, 'alerts.timeout');
});

test('validatePluginSection: литеральный секрет плагина — ошибка', () => {
    const schema = { token: { type: 'string', secret: true } };
    const result = validatePluginSection('alerts', schema, { token: 'literal-secret' });
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].reason.includes('$VAR'));
});

test('validatePluginSection: без схемы — warning (ключ не проверяется)', () => {
    const result = validatePluginSection('alerts', null, { whatever: 1 });
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 1);
});

test('validatePluginSection: неизвестный ключ при наличии схемы — warning (M1)', () => {
    const schema = { timeout: { type: 'number', min: 1, max: 60 } };
    const result = validatePluginSection('alerts', schema, { timeout: 30, unknownKey: 'x' });
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].key, 'alerts.unknownKey');
    assert.ok(result.warnings[0].reason.includes('warn + ignore'));
});

test('validatePluginSection: отсутствующий required-ключ — ошибка (M1 round 3)', () => {
    const schema = { apiKey: { type: 'string', required: true }, interval: { type: 'number' } };
    const result = validatePluginSection('myplugin', schema, { interval: 5 });
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].key, 'myplugin.apiKey');
    assert.equal(result.errors[0].reason, 'обязательное поле');
    assert.equal(result.warnings.length, 0);
});

test('validatePluginSection: не-required отсутствующий ключ — ок (M1 round 3)', () => {
    const schema = { interval: { type: 'number' }, timeout: { type: 'number' } };
    const result = validatePluginSection('myplugin', schema, { interval: 5 });
    assert.equal(result.errors.length, 0);
});

test('validateConfigFile: plugins ветка валидируется по merged-схеме', () => {
    const plugins = [{ name: 'alerts', configSchema: { timeout: { type: 'number', min: 1 } } }];
    const result = validateConfigFile(
        { plugins: { alerts: { timeout: 'x' } } },
        { plugins }
    );
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].key, 'alerts.timeout');
});

test('validateConfigFile: валидная plugins-ветка без ошибок', () => {
    const plugins = [{ name: 'alerts', configSchema: { timeout: { type: 'number', min: 1 } } }];
    const result = validateConfigFile(
        { plugins: { alerts: { timeout: 5 } } },
        { plugins }
    );
    assert.equal(result.errors.length, 0);
});

test('validateConfigFile: плагин без схемы — warning, не ошибка', () => {
    const result = validateConfigFile(
        { plugins: { legacy: { foo: 1 } } },
        { plugins: [{ name: 'legacy' }] }
    );
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 1);
});
