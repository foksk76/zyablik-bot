const test = require('node:test');
const assert = require('node:assert/strict');

const { createBotPlatformApp } = require('../../src/bot-platform/app');

const { envWithoutConfig } = require('../helpers/env-no-config');
const createApp = (env = {}) => createBotPlatformApp(envWithoutConfig(env));

test('createBotPlatformApp returns app object with config', () => {
  const app = createApp({});
  assert.equal(app.name, 'zyablik-bot-platform');
  assert.equal(app.status, 'scaffold');
  assert.ok(app.core);
  assert.ok(app.core.config);
});

test('config has ingress defaults when env is empty', () => {
  const app = createApp({});
  assert.equal(app.core.config.ingressEnabled, false);
  assert.equal(app.core.config.ingressPort, 8443);
  assert.equal(app.core.config.idpIssuer, '');
  assert.equal(app.core.config.idpAudience, '');
});

test('config reads ingress env overrides', () => {
  const app = createApp({
    INGRESS_ENABLED: 'true',
    INGRESS_PORT: '9443',
    IDP_ISSUER: 'https://synthetic.idp.com',
    IDP_AUDIENCE: 'synthetic-audience'
  });
  assert.equal(app.core.config.ingressEnabled, true);
  assert.equal(app.core.config.ingressPort, 9443);
  assert.equal(app.core.config.idpIssuer, 'https://synthetic.idp.com');
  assert.equal(app.core.config.idpAudience, 'synthetic-audience');
});

test('config has queue defaults when env is empty', () => {
  const app = createApp({});
  assert.equal(app.core.config.queueEnabled, false);
  assert.equal(app.core.config.queueMaxAttempts, 5);
  assert.equal(app.core.config.queueIntervalMs, 5000);
});

test('config reads queue env overrides', () => {
  const app = createApp({
    QUEUE_ENABLED: 'true',
    QUEUE_MAX_ATTEMPTS: '10',
    QUEUE_INTERVAL_MS: '2000'
  });
  assert.equal(app.core.config.queueEnabled, true);
  assert.equal(app.core.config.queueMaxAttempts, 10);
  assert.equal(app.core.config.queueIntervalMs, 2000);
});

test('app preserves backward compatibility with empty env', () => {
  const app = createApp({});
  assert.equal(app.core.config.maxTransportMode, 'long_polling');
  assert.equal(app.pipeline.transportMode, 'long_polling');
  assert.equal(app.pipeline.dryRun, 'available');
});
