const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createBotPlatformConfig } = require('../../src/bot-platform/core/config');

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
});

test('createBotPlatformConfig reads environment overrides', () => {
  const config = createBotPlatformConfig({
    MAX_API_URL: 'https://synthetic.example/messages',
    MAX_BOT_TOKEN: 'synthetic-bot-token',
    MAX_HTTP_PROXY: 'http://synthetic-proxy:3128',
    MAX_LOG_LEVEL: 'debug',
    MAX_TRANSPORT_MODE: 'webhook'
  });

  assert.equal(config.maxApiUrl, 'https://synthetic.example/messages');
  assert.equal(config.maxBotToken, 'synthetic-bot-token');
  assert.equal(config.httpProxy, 'http://synthetic-proxy:3128');
  assert.equal(config.logLevel, 'debug');
  assert.equal(config.maxTransportMode, 'webhook');
});

test('createBotPlatformConfig rejects invalid transport modes', () => {
  assert.throws(
    () => createBotPlatformConfig({ MAX_TRANSPORT_MODE: 'poll' }),
    /Invalid MAX_TRANSPORT_MODE value: poll/
  );
});

test('env.example stays synthetic and secret-free', () => {
  const envExample = fs.readFileSync(envExamplePath, 'utf8');

  assert.match(envExample, /MAX_API_URL=<synthetic-max-api-url>/);
  assert.match(envExample, /MAX_BOT_TOKEN=<synthetic-bot-token>/);
  assert.match(envExample, /MAX_LOG_LEVEL=info/);
  assert.match(envExample, /MAX_TRANSPORT_MODE=long_polling/);
  assert.doesNotMatch(envExample, /https?:\/\//i);
  assert.doesNotMatch(envExample, /Bearer\s+/i);
});
