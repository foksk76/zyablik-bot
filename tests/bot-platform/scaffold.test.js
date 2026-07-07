const test = require('node:test');
const assert = require('node:assert/strict');

const { createBotPlatformApp } = require('../../src/bot-platform/app');
const { createCore } = require('../../src/bot-platform/core');
const { createMaxTransport } = require('../../src/bot-platform/transports/max');
const { createIdentityPlugin } = require('../../src/bot-platform/plugins/identity');

test('bot platform scaffold modules can be imported', () => {
  assert.equal(typeof createBotPlatformApp, 'function');
  assert.equal(typeof createCore, 'function');
  assert.equal(typeof createMaxTransport, 'function');
  assert.equal(typeof createIdentityPlugin, 'function');
});

test('bot platform app scaffold wires placeholder modules', () => {
  const app = createBotPlatformApp();

  assert.equal(app.name, 'max-identity-bot-platform');
  assert.equal(app.status, 'scaffold');
  assert.equal(app.core.moduleName, 'core');
  assert.equal(app.transports.max.moduleName, 'max-transport');
  assert.equal(app.plugins.identity.moduleName, 'identity-plugin');
});

test('MAX transport scaffold does not enable network behavior', () => {
  const transport = createMaxTransport();

  assert.equal(transport.status, 'scaffold');
  assert.equal(transport.networkEnabled, false);
  assert.equal(transport.capabilities.inboundWebhook, 'pending');
  assert.equal(transport.capabilities.outboundClient, 'pending');
  assert.equal(transport.capabilities.eventNormalizer, 'pending');
});
