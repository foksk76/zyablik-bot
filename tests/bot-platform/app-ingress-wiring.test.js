const test = require('node:test');
const assert = require('node:assert/strict');

const { createBotPlatformApp } = require('../../src/bot-platform/app');

test('createBotPlatformApp returns app object with config', () => {
  const app = createBotPlatformApp({});
  assert.equal(app.name, 'max-identity-bot-platform');
  assert.equal(app.status, 'scaffold');
  assert.ok(app.core);
  assert.ok(app.core.config);
});

test('config has ingress defaults when env is empty', () => {
  const app = createBotPlatformApp({});
  assert.equal(app.core.config.ingressEnabled, false);
  assert.equal(app.core.config.ingressPort, 8443);
  assert.equal(app.core.config.oktaIssuer, '');
  assert.equal(app.core.config.oktaAudience, '');
});

test('config reads ingress env overrides', () => {
  const app = createBotPlatformApp({
    INGRESS_ENABLED: 'true',
    INGRESS_PORT: '9443',
    OKTA_ISSUER: 'https://synthetic.okta.com',
    OKTA_AUDIENCE: 'synthetic-audience'
  });
  assert.equal(app.core.config.ingressEnabled, true);
  assert.equal(app.core.config.ingressPort, 9443);
  assert.equal(app.core.config.oktaIssuer, 'https://synthetic.okta.com');
  assert.equal(app.core.config.oktaAudience, 'synthetic-audience');
});

test('config has queue defaults when env is empty', () => {
  const app = createBotPlatformApp({});
  assert.equal(app.core.config.queueEnabled, false);
  assert.equal(app.core.config.queueMaxAttempts, 5);
  assert.equal(app.core.config.queueIntervalMs, 5000);
});

test('config reads queue env overrides', () => {
  const app = createBotPlatformApp({
    QUEUE_ENABLED: 'true',
    QUEUE_MAX_ATTEMPTS: '10',
    QUEUE_INTERVAL_MS: '2000'
  });
  assert.equal(app.core.config.queueEnabled, true);
  assert.equal(app.core.config.queueMaxAttempts, 10);
  assert.equal(app.core.config.queueIntervalMs, 2000);
});

test('app preserves backward compatibility with empty env', () => {
  const app = createBotPlatformApp({});
  assert.equal(app.core.config.maxTransportMode, 'long_polling');
  assert.equal(app.pipeline.transportMode, 'long_polling');
  assert.equal(app.pipeline.dryRun, 'available');
});
