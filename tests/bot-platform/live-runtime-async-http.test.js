const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runFetchRequest,
  createLiveBotPlatformService
} = require('../../src/bot-platform/runtime');

// runFetchRequest isolates HTTP in a child process so the parent event loop
// stays free while waiting. These tests guard the Sprint 5 Task 5.2 fix that
// replaced the blocking spawnSync implementation.

test('runFetchRequest rejects with a timeout when the child hangs and does not block the event loop', async () => {
  const fetchBinary = process.execPath;
  // A child script that reads stdin then never writes stdout (simulates a hung
  // network request / TLS stall as seen in live diagnosis). runFetchRequest
  // runs this child via async spawn and must kill it after the timeout.
  const hungChildScript = "require('node:fs').readFileSync(0, 'utf8'); setTimeout(() => {}, 60000);";
  const hungChildRequest = {
    __childScriptOverride: hungChildScript
  };
  const timeoutMs = 800;
  const startedAt = Date.now();
  let concurrentTickFired = false;

  // If runFetchRequest blocked the event loop (like the old spawnSync), this
  // timer would only fire after the request settled. With async spawn it fires
  // while the child is still running.
  const tick = setTimeout(() => {
    concurrentTickFired = true;
  }, Math.floor(timeoutMs / 2));

  await assert.rejects(
    runFetchRequest(fetchBinary, hungChildRequest, timeoutMs, hungChildScript),
    (error) => {
      assert.equal(error.message, 'Live HTTP request timed out');
      assert.equal(error.cause.code, 'HTTP_TIMEOUT');
      return true;
    }
  );

  clearTimeout(tick);
  const elapsed = Date.now() - startedAt;

  assert.ok(concurrentTickFired, 'event loop must remain free during the HTTP wait');
  assert.ok(elapsed >= timeoutMs, `timeout should elapse before rejection (elapsed=${elapsed}ms)`);
});

test('live service can be stopped promptly while a poll cycle is in flight', async () => {
  // A live service whose inbound poll never resolves (simulates a hung
  // long-poll). stop() must return without waiting for the poll to settle.
  let resolvePoll;
  const liveService = createLiveBotPlatformService({
    MAX_TRANSPORT_MODE: 'long_polling',
    MAX_API_URL: 'https://synthetic.example',
    MAX_BOT_TOKEN: 'synthetic-bot-token'
  }, {
    inboundClient: {
      state: { marker: null },
      ack() {},
      async poll() {
        return new Promise((resolve) => {
          resolvePoll = resolve;
        });
      }
    },
    outboundClient: {
      async send() {
        throw new Error('outbound should not be called');
      }
    },
    logger: {
      info() {},
      warn() {},
      error() {}
    },
    sleep: async () => {},
    maxCycles: 1,
    installSignalHandlers: false
  });

  liveService.start();

  // Give the loop a tick to enter the pending poll.
  await new Promise((resolve) => setImmediate(resolve));

  const stopStartedAt = Date.now();
  liveService.stop();
  const stopElapsed = Date.now() - stopStartedAt;

  // stop() must return near-instantly, not block on the never-resolving poll.
  assert.ok(stopElapsed < 1000, `stop() should return promptly (elapsed=${stopElapsed}ms)`);

  // Allow the pending promise to settle so the process can exit cleanly.
  if (resolvePoll) {
    resolvePoll({ updates: [], marker: null });
  }
});
