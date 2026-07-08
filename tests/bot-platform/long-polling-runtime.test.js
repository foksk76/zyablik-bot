const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createLongPollingService,
  runLongPollingCycle
} = require('../../src/bot-platform/runtime');

const fixturesDir = path.join(__dirname, '../../examples/bot-platform');

function readFixture(fileName) {
  const filePath = path.join(fixturesDir, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('long polling cycle processes synthetic user updates safely', async () => {
  const result = await runLongPollingCycle({
    pollUpdates: async () => [readFixture('max-inbound-user.fixture.json')],
    sleep: async () => {}
  });

  assert.equal(result.mode, 'long_polling');
  assert.equal(result.networkEnabled, false);
  assert.equal(result.polls, 1);
  assert.equal(result.updates, 1);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].mode, 'dry-run');
  assert.equal(result.results[0].response.kind, 'identity');
  assert.equal(result.results[0].response.recipient.kind, 'user');
  assert.equal(result.results[0].outbound.request.body.recipientType, 'user_id');
});

test('long polling service exposes long polling mode and no network', async () => {
  const service = createLongPollingService({
    autoStart: false,
    pollUpdates: async () => [readFixture('max-inbound-chat.fixture.json')],
    sleep: async () => {}
  });

  assert.equal(service.mode, 'long_polling');
  assert.equal(service.networkEnabled, false);
  assert.equal(service.state.mode, 'long_polling');
  assert.equal(service.state.networkEnabled, false);

  const state = await service.tick();

  assert.equal(state.polls, 1);
  assert.equal(state.updates, 1);
  assert.equal(state.results[0].response.recipient.kind, 'chat');
  assert.equal(state.results[0].outbound.request.body.recipientType, 'chat_id');

  service.stop();
});

test('long polling service recovers from polling errors without crashing the loop', async () => {
  const logEntries = [];
  let resolveLogged;
  const logged = new Promise((resolve) => {
    resolveLogged = resolve;
  });
  const service = createLongPollingService({
    autoStart: false,
    pollUpdates: async () => {
      throw new Error('synthetic polling failure');
    },
    sleep: async () => new Promise((resolve) => setTimeout(resolve, 5)),
    maxCycles: 1,
    logger: {
      error(message, context) {
        logEntries.push({ message, context });
        if (resolveLogged) {
          resolveLogged();
        }
      }
    }
  });

  service.start();

  await Promise.race([
    service.loopPromise,
    logged
  ]);

  service.stop();

  assert.ok(logEntries.length >= 1);
  assert.equal(logEntries[0].message, 'long polling cycle failed');
  assert.equal(logEntries[0].context.error, 'synthetic polling failure');
  assert.ok(logEntries.some((entry) => entry.message === 'long polling loop recovered from error'));
});
