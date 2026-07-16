const test = require('node:test');
const assert = require('node:assert/strict');

const { createSafeLogger } = require('../../src/bot-platform/core/logger');

test('createSafeLogger masks explicit secret values in text and nested objects', () => {
  const entries = [];
  const logger = createSafeLogger({
    secrets: ['super-secret-token'],
    write: (entry) => entries.push(entry)
  });

  logger.info('using super-secret-token', {
    token: 'super-secret-token',
    nested: {
      password: 'super-secret-token'
    },
    list: ['public', 'super-secret-token'],
    public: 'visible'
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].moduleName, 'logger');
  assert.equal(entries[0].status, 'available');
  assert.equal(entries[0].level, 'info');
  assert.equal(entries[0].message, 'using [redacted]');
  assert.equal(entries[0].context.token, '[redacted]');
  assert.equal(entries[0].context.nested.password, '[redacted]');
  assert.equal(entries[0].context.list[1], '[redacted]');
  assert.equal(entries[0].context.public, 'visible');
});

test('createSafeLogger masks sensitive keys even without explicit secret values', () => {
  const entries = [];
  const logger = createSafeLogger({
    write: (entry) => entries.push(entry)
  });

  logger.error('request failed', {
    authorization: 'Bearer synthetic-token',
    apiKey: 'synthetic-api-key',
    public: 'visible'
  });

  assert.equal(entries[0].level, 'error');
  assert.equal(entries[0].context.authorization, '[redacted]');
  assert.equal(entries[0].context.apiKey, '[redacted]');
  assert.equal(entries[0].context.public, 'visible');
});

test('createSafeLogger handles circular references without infinite loop', () => {
  const entries = [];
  const logger = createSafeLogger({
    secrets: ['circular-secret'],
    write: (entry) => entries.push(entry)
  });

  const circular = { name: 'test' };
  circular.self = circular;
  circular.nested = { ref: circular };

  logger.info('circular test circular-secret', circular);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].message, 'circular test [redacted]');
  assert.equal(entries[0].context.name, 'test');
  assert.equal(entries[0].context.self, '[redacted]');
  assert.equal(entries[0].context.nested.ref, '[redacted]');
});

test('createSafeLogger masks secrets in deeply nested objects (3+ levels)', () => {
  const entries = [];
  const logger = createSafeLogger({
    secrets: ['deep-secret'],
    write: (entry) => entries.push(entry)
  });

  logger.info('deep test', {
    level1: {
      level2: {
        level3: {
          level4: {
            token: 'deep-secret',
            safe: 'visible'
          }
        }
      }
    }
  });

  assert.equal(entries[0].context.level1.level2.level3.level4.token, '[redacted]');
  assert.equal(entries[0].context.level1.level2.level3.level4.safe, 'visible');
});

test('createSafeLogger extracts all CONFIG_SECRET_KEYS from config', () => {
  const secretKeys = [
    'maxBotToken', 'token', 'secret', 'password',
    'authorization', 'apiKey', 'apiToken'
  ];

  for (const key of secretKeys) {
    const entries = [];
    const logger = createSafeLogger({
      config: { [key]: `value-for-${key}` },
      write: (entry) => entries.push(entry)
    });

    logger.info(`leaking value-for-${key} here`, {
      public: 'visible'
    });

    assert.equal(
      entries[0].message,
      'leaking [redacted] here',
      `config key "${key}" should be extracted and redacted`
    );
  }
});

test('createSafeLogger passes non-string primitives through context unchanged', () => {
  const entries = [];
  const logger = createSafeLogger({
    write: (entry) => entries.push(entry)
  });

  logger.info('context test', {
    num: 42,
    bool: true,
    nil: null,
    undef: undefined,
    str: 'hello'
  });

  assert.equal(entries[0].context.num, 42);
  assert.equal(entries[0].context.bool, true);
  assert.equal(entries[0].context.nil, null);
  assert.equal(entries[0].context.undef, undefined);
  assert.equal(entries[0].context.str, 'hello');
});

test('createSafeLogger masks multiple secrets in a single message', () => {
  const entries = [];
  const logger = createSafeLogger({
    secrets: ['alpha-secret', 'beta-secret'],
    write: (entry) => entries.push(entry)
  });

  logger.info('alpha-secret and beta-secret together', {});

  assert.equal(entries[0].message, '[redacted] and [redacted] together');
});

test('createSafeLogger supports debug and log methods', () => {
  const entries = [];
  const logger = createSafeLogger({
    write: (entry) => entries.push(entry)
  });

  logger.debug('debug message');
  logger.log('log message');

  assert.equal(entries[0].level, 'debug');
  assert.equal(entries[0].message, 'debug message');
  assert.equal(entries[1].level, 'info');
  assert.equal(entries[1].message, 'log message');
});

test('createSafeLogger handles missing context gracefully', () => {
  const entries = [];
  const logger = createSafeLogger({
    write: (entry) => entries.push(entry)
  });

  logger.info('no context');

  assert.equal(entries[0].message, 'no context');
  assert.equal(entries[0].context, undefined);
});

test('createSafeLogger extracts secrets from config values', () => {
  const entries = [];
  const logger = createSafeLogger({
    config: {
      maxBotToken: 'config-token'
    },
    write: (entry) => entries.push(entry)
  });

  logger.warn('sending config-token to transport', {
    token: 'config-token',
    public: 'visible'
  });

  assert.equal(entries[0].level, 'warn');
  assert.equal(entries[0].message, 'sending [redacted] to transport');
  assert.equal(entries[0].context.token, '[redacted]');
  assert.equal(entries[0].context.public, 'visible');
});
