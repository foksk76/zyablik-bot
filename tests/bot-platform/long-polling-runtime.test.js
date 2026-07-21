const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createLongPollingService,
  runLongPollingCycle
} = require('../../src/bot-platform/runtime');
const { createIdentityUpdateProcessor } = require('../../src/bot-platform/core');

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
  assert.equal(result.results[0].response.kind, 'text');
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

test('long polling service can route live inbound updates through identity pipeline', async () => {
  const logEntries = [];
  const outboundCalls = [];
  const outboundClient = {
    send(response) {
      outboundCalls.push(response);

      return {
        mode: 'live',
        networkEnabled: true,
        request: {
          method: 'POST',
          url: 'https://platform-api2.max.ru/messages?user_id=%3Csynthetic-user-id%3E',
          headers: {
            Authorization: 'synthetic-secret-token'
          },
          body: {
            text: response.text,
            notify: true,
            format: 'markdown'
          }
        },
        response: {
          statusCode: 200,
          body: {
            message: {
              id: '<synthetic-message-id>'
            }
          }
        },
        payload: response.recipient || response.zabbix
      };
    }
  };
  const processUpdate = createIdentityUpdateProcessor({ outboundClient });
  const service = createLongPollingService({
    autoStart: false,
    pollUpdates: async () => [readFixture('max-inbound-user.fixture.json')],
    processUpdate,
    sleep: async () => {},
    logger: {
      info(message, context) {
        logEntries.push({ level: 'info', message, context });
      },
      error(message, context) {
        logEntries.push({ level: 'error', message, context });
      }
    }
  });

  const state = await service.tick();

  assert.equal(state.results.length, 1);
  assert.equal(state.results[0].mode, 'live');
  assert.equal(state.results[0].response.kind, 'text');
  assert.equal(state.results[0].response.recipient.kind, 'user');
  assert.equal(state.results[0].outbound.mode, 'live');
  assert.equal(state.results[0].outbound.request.body.notify, true);
  assert.equal(outboundCalls.length, 1);
  assert.equal(outboundCalls[0].recipient.kind, 'user');
  assert.equal(outboundCalls[0].recipient.value, '<synthetic-user-id>');
  assert.ok(logEntries.some((entry) => entry.message === 'long polling update processed'));

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

// ADR-0033: одно сбойное update не должно блокировать ack marker для всего batch.
// Раньше throw в processUpdate прерывал цикл, onCycleSuccess (ack marker)
// пропускался, и тот же batch опрашивался бесконечно (poison-message loop).
test('long polling cycle acks marker and processes other updates when one update fails', async () => {
  const processed = [];
  const errored = [];
  let cycleSuccessCalled = false;

  const service = createLongPollingService({
    autoStart: false,
    pollUpdates: async () => [
      { id: 'ok-1', synthetic: true },
      { id: 'poison', synthetic: true },
      { id: 'ok-2', synthetic: true }
    ],
    processUpdate: async (update) => {
      if (update.id === 'poison') {
        throw new Error('poison update failure');
      }
      processed.push(update.id);
      return { mode: 'dry-run', update };
    },
    onCycleSuccess: () => {
      cycleSuccessCalled = true;
    },
    logger: {
      info() {},
      warn() {},
      error(message, context) {
        errored.push({ message, context });
      }
    },
    sleep: async () => {}
  });

  // tick должен пробросить первую ошибку наверх (для loop recovery-лога),
  // НО только после того, как обработал остальные update и вызвал onCycleSuccess.
  await assert.rejects(() => service.tick(), /poison update failure/);

  // Два «хороших» update обработаны, ядовитое — пропущено.
  assert.deepEqual(processed, ['ok-1', 'ok-2']);

  // marker ack-нулся по всему batch — poison-loop предотвращён.
  assert.equal(cycleSuccessCalled, true, 'onCycleSuccess must be called even when one update fails');

  // Сбойное update залогировано на error.
  assert.ok(errored.some((e) => e.message === 'long polling update failed'));
  assert.ok(errored.some((e) => e.context && e.context.error === 'poison update failure'));

  service.stop();
});
