const test = require('node:test');
const assert = require('node:assert/strict');

const { createBotPlatformApp, runMaxIdentityDryRun } = require('../../src/bot-platform/app');
const { createCore, createEventRouter } = require('../../src/bot-platform/core');
const { createMaxTransport, normalizeMaxEvent } = require('../../src/bot-platform/transports/max');
const {
  createIdentityPlugin,
  formatIdentityResponse,
  handleIdentityEvent
} = require('../../src/bot-platform/plugins/identity');

test('bot platform scaffold modules can be imported', () => {
  assert.equal(typeof createBotPlatformApp, 'function');
  assert.equal(typeof runMaxIdentityDryRun, 'function');
  assert.equal(typeof createCore, 'function');
  assert.equal(typeof createEventRouter, 'function');
  assert.equal(typeof createMaxTransport, 'function');
  assert.equal(typeof normalizeMaxEvent, 'function');
  assert.equal(typeof createIdentityPlugin, 'function');
  assert.equal(typeof formatIdentityResponse, 'function');
  assert.equal(typeof handleIdentityEvent, 'function');
});

test('bot platform app scaffold wires placeholder modules', () => {
  const app = createBotPlatformApp();

  assert.equal(app.name, 'max-identity-bot-platform');
  assert.equal(app.status, 'scaffold');
  assert.equal(app.core.moduleName, 'core');
  assert.equal(app.core.components.eventRouter, 'available');
  assert.equal(app.core.components.dryRunPipeline, 'available');
  assert.equal(app.transports.max.moduleName, 'max-transport');
  assert.equal(app.plugins.identity.moduleName, 'identity-plugin');
  assert.equal(app.pipeline.dryRun, 'available');
});

test('MAX transport scaffold does not enable network behavior', () => {
  const transport = createMaxTransport();

  assert.equal(transport.status, 'scaffold');
  assert.equal(transport.networkEnabled, false);
  assert.equal(transport.capabilities.inboundWebhook, 'pending');
  assert.equal(transport.capabilities.outboundClient, 'pending');
  assert.equal(transport.capabilities.eventNormalizer, 'available');
});

test('identity plugin exposes formatter and handler capabilities', () => {
  const plugin = createIdentityPlugin();

  assert.equal(plugin.status, 'scaffold');
  assert.equal(plugin.capabilities.userRecipient, 'available');
  assert.equal(plugin.capabilities.chatRecipient, 'available');
  assert.equal(plugin.capabilities.responseFormatter, 'available');
});
