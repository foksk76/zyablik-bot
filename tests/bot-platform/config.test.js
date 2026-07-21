const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createBotPlatformConfig,
  createLiveRuntimeConfig,
  CONFIG_VALIDATION_ERROR_CODE,
  TRANSPORT_NOT_IMPLEMENTED_ERROR_CODE,
  WEBHOOK_NOT_IMPLEMENTED_MESSAGE
} = require('../../src/bot-platform/core/config');

const envExamplePath = path.join(__dirname, '../../examples/bot-platform/env.example');

test('createBotPlatformConfig uses safe defaults when env is empty', () => {
  const config = createBotPlatformConfig({});

  assert.equal(config.moduleName, 'config');
  assert.equal(config.status, 'available');
  assert.equal(config.maxApiUrl, '');
  assert.equal(config.maxBotToken, '');
  assert.equal(config.httpProxy, '');
  assert.equal(config.logLevel, 'info');
  assert.equal(config.maxTransportMode, 'long_polling');
  assert.equal(config.maxPollLimit, 100);
  assert.equal(config.maxPollTimeoutSeconds, 30);
  assert.deepEqual(config.maxPollTypes, ['message_created', 'bot_started', 'bot_added']);
});

test('createBotPlatformConfig reads environment overrides', () => {
  const config = createBotPlatformConfig({
    MAX_API_URL: 'https://synthetic.example/messages',
    MAX_BOT_TOKEN: 'synthetic-bot-token',
    MAX_HTTP_PROXY: 'http://synthetic-proxy:3128',
    MAX_LOG_LEVEL: 'debug',
    MAX_TRANSPORT_MODE: 'webhook',
    MAX_POLL_LIMIT: '7',
    MAX_POLL_TIMEOUT_SECONDS: '3',
    MAX_POLL_TYPES: 'message_created'
  });

  assert.equal(config.maxApiUrl, 'https://synthetic.example/messages');
  assert.equal(config.maxBotToken, 'synthetic-bot-token');
  assert.equal(config.httpProxy, 'http://synthetic-proxy:3128');
  assert.equal(config.logLevel, 'debug');
  assert.equal(config.maxTransportMode, 'webhook');
  assert.equal(config.maxPollLimit, 7);
  assert.equal(config.maxPollTimeoutSeconds, 3);
  assert.deepEqual(config.maxPollTypes, ['message_created']);
});

test('createBotPlatformConfig rejects invalid transport modes', () => {
  assert.throws(
    () => createBotPlatformConfig({ MAX_TRANSPORT_MODE: 'poll' }),
    /Invalid MAX_TRANSPORT_MODE value: poll/
  );
});

test('createBotPlatformConfig rejects invalid poll values', () => {
  assert.throws(
    () => createBotPlatformConfig({ MAX_POLL_LIMIT: '0' }),
    /Invalid MAX_POLL_LIMIT value: 0/
  );
  assert.throws(
    () => createBotPlatformConfig({ MAX_POLL_TIMEOUT_SECONDS: '91' }),
    /Invalid MAX_POLL_TIMEOUT_SECONDS value: 91/
  );
});

test('createLiveRuntimeConfig returns a webhook not-implemented result', () => {
  const config = createLiveRuntimeConfig({
    MAX_TRANSPORT_MODE: 'webhook'
  });

  assert.equal(config.mode, 'webhook');
  assert.equal(config.error.code, TRANSPORT_NOT_IMPLEMENTED_ERROR_CODE);
  assert.equal(config.error.message, WEBHOOK_NOT_IMPLEMENTED_MESSAGE);
  assert.equal(config.error.details, undefined);
});

test('createLiveRuntimeConfig validates required live env values for long polling', () => {
  assert.throws(
    () => createLiveRuntimeConfig({
      MAX_TRANSPORT_MODE: 'long_polling',
      MAX_BOT_TOKEN: 'synthetic-bot-token'
    }),
    (error) => {
      assert.equal(error.code, CONFIG_VALIDATION_ERROR_CODE);
      assert.equal(error.message, 'Invalid MAX live runtime configuration');
      assert.deepEqual(error.details, { missing: ['MAX_API_URL'] });
      return true;
    }
  );
});

test('createLiveRuntimeConfig returns a validated long polling config', () => {
  const config = createLiveRuntimeConfig({
    MAX_TRANSPORT_MODE: 'long_polling',
    MAX_API_URL: 'https://synthetic.example/messages',
    MAX_BOT_TOKEN: 'synthetic-bot-token',
    MAX_HTTP_PROXY: 'http://synthetic-proxy:3128',
    MAX_LOG_LEVEL: 'debug',
    MAX_POLL_LIMIT: '7',
    MAX_POLL_TIMEOUT_SECONDS: '3',
    MAX_POLL_TYPES: 'message_created'
  });

  assert.equal(config.mode, 'long_polling');
  assert.equal(config.maxApiUrl, 'https://synthetic.example/messages');
  assert.equal(config.maxBotToken, 'synthetic-bot-token');
  assert.equal(config.httpProxy, 'http://synthetic-proxy:3128');
  assert.equal(config.logLevel, 'debug');
  assert.equal(config.maxTransportMode, 'long_polling');
  assert.equal(config.maxPollLimit, 7);
  assert.equal(config.maxPollTimeoutSeconds, 3);
  assert.deepEqual(config.maxPollTypes, ['message_created']);
});

test('env.example stays synthetic and secret-free', () => {
  const envExample = fs.readFileSync(envExamplePath, 'utf8');

  assert.match(envExample, /MAX_API_URL=<synthetic-max-api-url>/);
  assert.match(envExample, /MAX_BOT_TOKEN=<synthetic-bot-token>/);
  assert.match(envExample, /MAX_LOG_LEVEL=info/);
  assert.match(envExample, /MAX_TRANSPORT_MODE=long_polling/);
  assert.match(envExample, /RATE_LIMIT_ENABLED=true/);
  assert.doesNotMatch(envExample, /https?:\/\//i);
  assert.doesNotMatch(envExample, /Bearer\s+/i);
});

test('createBotPlatformConfig returns queue defaults when env is empty', () => {
  const config = createBotPlatformConfig({});

  assert.equal(config.queueEnabled, false);
  assert.equal(config.queueMaxAttempts, 5);
  assert.equal(config.queueIntervalMs, 5000);
  assert.equal(config.queueBatchSize, 10);
  assert.equal(config.queueBackoffBase, 2);
  assert.equal(config.queueBackoffMax, 300);
});

test('createBotPlatformConfig reads queue environment overrides', () => {
  const config = createBotPlatformConfig({
    QUEUE_ENABLED: 'true',
    QUEUE_MAX_ATTEMPTS: '10',
    QUEUE_INTERVAL_MS: '2000',
    QUEUE_BATCH_SIZE: '50',
    QUEUE_BACKOFF_BASE: '3',
    QUEUE_BACKOFF_MAX: '600'
  });

  assert.equal(config.queueEnabled, true);
  assert.equal(config.queueMaxAttempts, 10);
  assert.equal(config.queueIntervalMs, 2000);
  assert.equal(config.queueBatchSize, 50);
  assert.equal(config.queueBackoffBase, 3);
  assert.equal(config.queueBackoffMax, 600);
});

test('createBotPlatformConfig rejects invalid queue values', () => {
  assert.throws(
    () => createBotPlatformConfig({ QUEUE_MAX_ATTEMPTS: '0' }),
    /Invalid QUEUE_MAX_ATTEMPTS value: 0/
  );
  assert.throws(
    () => createBotPlatformConfig({ QUEUE_INTERVAL_MS: '99' }),
    /Invalid QUEUE_INTERVAL_MS value: 99/
  );
  assert.throws(
    () => createBotPlatformConfig({ QUEUE_BATCH_SIZE: '0' }),
    /Invalid QUEUE_BATCH_SIZE value: 0/
  );
});

test('createBotPlatformConfig returns ingress defaults when env is empty', () => {
  const config = createBotPlatformConfig({});

  assert.equal(config.ingressEnabled, false);
  assert.equal(config.ingressPort, 8443);
  assert.equal(config.idpIssuer, '');
  assert.equal(config.idpAudience, '');
});

test('createBotPlatformConfig reads ingress environment overrides', () => {
  const config = createBotPlatformConfig({
    INGRESS_ENABLED: 'true',
    INGRESS_PORT: '9443',
    IDP_ISSUER: 'https://synthetic.idp.com',
    IDP_AUDIENCE: 'synthetic-audience'
  });

  assert.equal(config.ingressEnabled, true);
  assert.equal(config.ingressPort, 9443);
  assert.equal(config.idpIssuer, 'https://synthetic.idp.com');
  assert.equal(config.idpAudience, 'synthetic-audience');
});

test('createBotPlatformConfig rejects invalid ingress values', () => {
  assert.throws(
    () => createBotPlatformConfig({ INGRESS_PORT: '0' }),
    /Invalid INGRESS_PORT value: 0/
  );
  assert.throws(
    () => createBotPlatformConfig({ INGRESS_PORT: '99999' }),
    /Invalid INGRESS_PORT value: 99999/
  );
});

test('createBotPlatformConfig returns audit/trace defaults when env is empty', () => {
  const config = createBotPlatformConfig({});

  assert.equal(config.logAudit, false);
  assert.equal(config.logTrace, true);
});

test('createBotPlatformConfig reads audit/trace environment overrides', () => {
  const config = createBotPlatformConfig({
    LOG_AUDIT: 'false',
    LOG_TRACE: 'false'
  });

  assert.equal(config.logAudit, false);
  assert.equal(config.logTrace, false);
});

test('createBotPlatformConfig returns rate limit defaults when env is empty', () => {
  const config = createBotPlatformConfig({});

  assert.equal(config.rateLimitEnabled, true);
  assert.equal(config.rateLimitGlobal, 25);
  assert.equal(config.rateLimitRecipient, 5);
});

test('createBotPlatformConfig reads rate limit environment overrides', () => {
  const config = createBotPlatformConfig({
    RATE_LIMIT_ENABLED: 'false',
    RATE_LIMIT_GLOBAL: '50',
    RATE_LIMIT_RECIPIENT: '10'
  });

  assert.equal(config.rateLimitEnabled, false);
  assert.equal(config.rateLimitGlobal, 50);
  assert.equal(config.rateLimitRecipient, 10);
});

test('createBotPlatformConfig rejects invalid rate limit values', () => {
  assert.throws(
    () => createBotPlatformConfig({ RATE_LIMIT_GLOBAL: '0' }),
    /Invalid RATE_LIMIT_GLOBAL value: 0/
  );
  assert.throws(
    () => createBotPlatformConfig({ RATE_LIMIT_RECIPIENT: '0' }),
    /Invalid RATE_LIMIT_RECIPIENT value: 0/
  );
});

test('createBotPlatformConfig returns monitor defaults when env is empty', () => {
  const config = createBotPlatformConfig({});

  assert.equal(config.monitorEnabled, false);
  assert.equal(config.monitorPort, 9000);
});

test('createBotPlatformConfig reads monitor environment overrides', () => {
  const config = createBotPlatformConfig({
    MONITOR_ENABLED: 'true',
    MONITOR_PORT: '8080'
  });

  assert.equal(config.monitorEnabled, true);
  assert.equal(config.monitorPort, 8080);
});

test('createBotPlatformConfig rejects invalid monitor values', () => {
  assert.throws(
    () => createBotPlatformConfig({ MONITOR_PORT: '0' }),
    /Invalid MONITOR_PORT value: 0/
  );
  assert.throws(
    () => createBotPlatformConfig({ MONITOR_PORT: '70000' }),
    /Invalid MONITOR_PORT value: 70000/
  );
});
