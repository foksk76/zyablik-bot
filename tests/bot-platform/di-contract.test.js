const test = require('node:test');
const assert = require('node:assert/strict');

const { createLiveBotPlatformService } = require('../../src/bot-platform/runtime');
const { createLongPollingService } = require('../../src/bot-platform/runtime/long-polling');
const { createMaxOutboundClient } = require('../../src/bot-platform/transports/max/outbound-client');
const { createMaxInboundUpdatesClient } = require('../../src/bot-platform/transports/max/inbound-updates');
const { runMaxIdentityDryRun } = require('../../src/bot-platform/core/dry-run-pipeline');
const { createBotPlatformApp } = require('../../src/bot-platform/app');

test('every module create function accepts options parameter (ADR-0016)', () => {
  const fns = [
    createLiveBotPlatformService,
    createLongPollingService,
    createMaxOutboundClient,
    createMaxInboundUpdatesClient,
    runMaxIdentityDryRun,
    createBotPlatformApp
  ];

  for (const fn of fns) {
    assert.equal(typeof fn, 'function', `${fn.name} must be a function`);
    assert.equal(fn.length <= 2, true, `${fn.name} should accept at most 2 positional args`);
  }
});

test('every module can be constructed with injected dependencies (ADR-0016)', () => {
  const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, log() {} };

  const outbound = createMaxOutboundClient({ logger: noopLogger });
  assert.equal(typeof outbound.send, 'function', 'outbound.send is a function');

  const inbound = createMaxInboundUpdatesClient({
    apiUrl: 'https://synthetic.example',
    token: 'synthetic-token',
    logger: noopLogger
  });
  assert.equal(typeof inbound.poll, 'function', 'inbound.poll is a function');

  const longPolling = createLongPollingService({
    autoStart: false,
    pollUpdates: async () => ({ updates: [], marker: null }),
    processUpdate: async () => {},
    logger: noopLogger
  });
  assert.equal(typeof longPolling.start, 'function', 'longPolling.start is a function');
  assert.equal(typeof longPolling.stop, 'function', 'longPolling.stop is a function');

  const liveService = createLiveBotPlatformService({
    MAX_TRANSPORT_MODE: 'long_polling',
    MAX_API_URL: 'https://synthetic.example',
    MAX_BOT_TOKEN: 'synthetic-bot-token'
  }, {
    logger: noopLogger,
    sleep: async () => {},
    inboundClient: { poll: async () => ({ updates: [], marker: null }), ack() {} },
    outboundClient: { async send() {} }
  });
  assert.equal(typeof liveService.start, 'function', 'liveService.start is a function');

  const app = createBotPlatformApp();
  assert.ok(Array.isArray(app.plugins), 'app.plugins is an array');
  assert.ok(typeof app.routes === 'object', 'app.routes is an object');
});
