const test = require('node:test');
const assert = require('node:assert/strict');

const { createBotPlatformApp, runMaxIdentityDryRun } = require('../../src/bot-platform/app');
const {
  createCore,
  createBotPlatformConfig,
  createSafeLogger,
  createEventRouter,
  createPluginLoader
} = require('../../src/bot-platform/core');
const {
  createMaxTransport,
  normalizeMaxEvent,
  createMaxInboundWebhookHandler,
  createMaxOutboundClient,
  createMaxInboundUpdatesClient
} = require('../../src/bot-platform/transports/max');
const {
  createIdentityUpdateProcessor
} = require('../../src/bot-platform/core');
const {
  formatIdentityResponse,
  handleIdentityEvent
} = require('../../src/bot-platform/plugins/identity');

test('bot platform scaffold modules can be imported', () => {
  assert.equal(typeof createBotPlatformApp, 'function');
  assert.equal(typeof runMaxIdentityDryRun, 'function');
  assert.equal(typeof createCore, 'function');
  assert.equal(typeof createBotPlatformConfig, 'function');
  assert.equal(typeof createSafeLogger, 'function');
  assert.equal(typeof createEventRouter, 'function');
  assert.equal(typeof createPluginLoader, 'function');
  assert.equal(typeof createMaxTransport, 'function');
  assert.equal(typeof normalizeMaxEvent, 'function');
  assert.equal(typeof createMaxInboundWebhookHandler, 'function');
  assert.equal(typeof createMaxOutboundClient, 'function');
  assert.equal(typeof createMaxInboundUpdatesClient, 'function');
  assert.equal(typeof formatIdentityResponse, 'function');
  assert.equal(typeof handleIdentityEvent, 'function');
  assert.equal(typeof createIdentityUpdateProcessor, 'function');
});

test('bot platform app scaffold wires placeholder modules', () => {
  const app = createBotPlatformApp();

  assert.equal(app.name, 'max-identity-bot-platform');
  assert.equal(app.status, 'scaffold');
  assert.equal(app.core.config.maxTransportMode, 'long_polling');
  assert.equal(app.core.moduleName, 'core');
  assert.equal(app.core.components.config, 'available');
  assert.equal(app.core.components.logger, 'available');
  assert.equal(app.core.components.eventRouter, 'available');
  assert.equal(app.core.components.pluginLoader, 'available');
  assert.equal(app.core.components.dryRunPipeline, 'available');
  assert.equal(app.transports.max.moduleName, 'max-transport');
  assert.equal(app.transports.max.transportMode, 'long_polling');
  assert.ok(Array.isArray(app.plugins));
  assert.equal(app.plugins.length, 1);
  assert.equal(app.plugins[0].name, 'identity');
  assert.equal(typeof app.routes.identity, 'function');
  assert.equal(app.pipeline.dryRun, 'available');
  assert.equal(app.pipeline.transportMode, 'long_polling');
});

test('bot platform app scaffold reflects webhook mode from environment', () => {
  const app = createBotPlatformApp({ MAX_TRANSPORT_MODE: 'webhook' });

  assert.equal(app.core.config.maxTransportMode, 'webhook');
  assert.equal(app.transports.max.transportMode, 'webhook');
  assert.equal(app.pipeline.transportMode, 'webhook');
});

test('MAX transport scaffold does not enable network behavior', () => {
  const transport = createMaxTransport();

  assert.equal(transport.status, 'scaffold');
  assert.equal(transport.networkEnabled, false);
  assert.equal(transport.transportMode, 'long_polling');
  assert.equal(transport.capabilities.inboundWebhook, 'available');
  assert.equal(transport.capabilities.outboundClient, 'available');
  assert.equal(transport.capabilities.eventNormalizer, 'available');
  assert.equal(transport.capabilities.longPolling, 'preferred');
  assert.equal(transport.capabilities.webhook, 'available');
});

test('MAX transport scaffold reflects webhook mode when configured', () => {
  const transport = createMaxTransport({ transportMode: 'webhook' });

  assert.equal(transport.transportMode, 'webhook');
  assert.equal(transport.capabilities.longPolling, 'available');
  assert.equal(transport.capabilities.webhook, 'preferred');
});

test('identity plugin exports name and routes', () => {
  const identity = require('../../src/bot-platform/plugins/identity');

  assert.equal(identity.name, 'identity');
  assert.equal(typeof identity.routes.identity, 'function');
  assert.equal(typeof identity.formatIdentityResponse, 'function');
  assert.equal(typeof identity.handleIdentityEvent, 'function');
});
