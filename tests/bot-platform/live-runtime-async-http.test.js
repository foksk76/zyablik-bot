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

test('runFetchRequest rejects when child exits non-zero with JSON stderr', async () => {
  const fetchBinary = process.execPath;
  const errorScript = [
    "const payload = JSON.stringify({",
    "  message: 'synthetic fetch error',",
    "  cause: { code: 'ECONNREFUSED', message: 'connect refused', hostname: 'synthetic.host' }",
    "});",
    "process.stderr.write(payload);",
    "process.exit(1);"
  ].join('\n');

  await assert.rejects(
    runFetchRequest(fetchBinary, {}, 5000, errorScript),
    (error) => {
      assert.equal(error.message, 'synthetic fetch error');
      assert.equal(error.cause.code, 'ECONNREFUSED');
      assert.equal(error.cause.message, 'connect refused');
      assert.equal(error.cause.hostname, 'synthetic.host');
      return true;
    }
  );
});

test('runFetchRequest rejects when child exits non-zero with empty stderr', async () => {
  const fetchBinary = process.execPath;
  const errorScript = "process.exit(1);";

  await assert.rejects(
    runFetchRequest(fetchBinary, {}, 5000, errorScript),
    (error) => {
      assert.equal(error.message, 'Live HTTP request failed');
      return true;
    }
  );
});

test('runFetchRequest rejects when child exits non-zero with malformed stderr', async () => {
  const fetchBinary = process.execPath;
  const errorScript = "process.stderr.write('not-json-at-all'); process.exit(1);";

  await assert.rejects(
    runFetchRequest(fetchBinary, {}, 5000, errorScript),
    (error) => {
      assert.equal(error.message, 'not-json-at-all');
      return true;
    }
  );
});

test('runFetchRequest rejects when child exits 0 with empty stdout', async () => {
  const fetchBinary = process.execPath;
  const emptyScript = "process.exit(0);";

  await assert.rejects(
    runFetchRequest(fetchBinary, {}, 5000, emptyScript),
    (error) => {
      assert.equal(error.message, 'Live HTTP request returned an empty response');
      return true;
    }
  );
});

test('runFetchRequest rejects when child exits 0 with invalid JSON stdout', async () => {
  const fetchBinary = process.execPath;
  const badJsonScript = "process.stdout.write('not-json>'); process.exit(0);";

  await assert.rejects(
    runFetchRequest(fetchBinary, {}, 5000, badJsonScript),
    (error) => {
      assert.equal(error.message, 'Live HTTP request returned invalid JSON');
      return true;
    }
  );
});

test('runFetchRequest resolves with parsed JSON on successful child exit', async () => {
  const fetchBinary = process.execPath;
  const successScript = [
    "process.stdout.write(JSON.stringify({",
    "  statusCode: 200,",
    "  body: { ok: true }",
    "}));"
  ].join('\n');

  const result = await runFetchRequest(fetchBinary, {}, 5000, successScript);

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { ok: true });
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
