const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createLiveBotPlatformService } = require('../../src/bot-platform/runtime');
const { MAX_API_ERROR_CODE } = require('../../src/bot-platform/transports/max');
const { handleIdentityEvent } = require('../../src/bot-platform/plugins/identity');

const routeHandlers = { identity: handleIdentityEvent };

const fixturesDir = path.join(__dirname, '../../examples/bot-platform');

function readFixture(fileName) {
  const filePath = path.join(fixturesDir, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createCaptureLogger(entries) {
  return {
    info(message, context) {
      entries.push({ level: 'info', message, context });
    },
    warn(message, context) {
      entries.push({ level: 'warn', message, context });
    },
    error(message, context) {
      entries.push({ level: 'error', message, context });
    }
  };
}

test('live service wires inbound updates into outbound MAX response delivery', async () => {
  const entries = [];
  const requests = [];
  const httpClient = {
    get(request) {
      requests.push({
        kind: 'get',
        request
      });

      return {
        statusCode: 200,
        body: {
          updates: [readFixture('max-inbound-user.fixture.json')],
          marker: 2
        }
      };
    },
    post(request) {
      requests.push({
        kind: 'post',
        request
      });

      return {
        statusCode: 200,
        body: {
          message: {
            id: '<synthetic-message-id>'
          }
        }
      };
    }
  };
  const liveService = createLiveBotPlatformService({
    MAX_TRANSPORT_MODE: 'long_polling',
    MAX_API_URL: 'https://synthetic.example',
    MAX_BOT_TOKEN: 'synthetic-bot-token'
  }, {
    httpClient,
    routeHandlers,
    logger: createCaptureLogger(entries),
    sleep: async () => {},
    maxCycles: 1,
    installSignalHandlers: false
  });

  assert.equal(liveService.mode, 'long_polling');
  assert.equal(liveService.runtimeMode, 'live');
  assert.equal(liveService.networkEnabled, true);

  liveService.start();
  await liveService.loopPromise;

  assert.equal(liveService.state.polls, 1);
  assert.equal(liveService.state.updates, 1);
  assert.equal(liveService.state.results.length, 1);
  assert.equal(liveService.state.results[0].mode, 'live');
  assert.equal(liveService.state.results[0].response.kind, 'identity');
  assert.equal(liveService.state.results[0].response.recipient.kind, 'user');
  assert.equal(liveService.state.results[0].outbound.mode, 'live');
  assert.equal(liveService.state.results[0].outbound.response.statusCode, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].kind, 'get');
  assert.equal(requests[1].kind, 'post');
  assert.equal(requests[0].request.url, 'https://synthetic.example/updates?limit=100&timeout=30&types=message_created%2Cbot_started%2Cbot_added');
  assert.equal(requests[1].request.url, 'https://synthetic.example/messages?user_id=%3Csynthetic-user-id%3E');
  assert.ok(entries.some((entry) => entry.level === 'info' && entry.message === 'live MAX Identity Bot service started'));
  assert.ok(entries.some((entry) => entry.level === 'info' && entry.message === 'received MAX inbound updates'));
  assert.ok(entries.some((entry) => entry.level === 'info' && entry.message === 'sent MAX outbound response'));

  const serialized = JSON.stringify(entries);

  assert.doesNotMatch(serialized, /synthetic-bot-token/);
  assert.doesNotMatch(serialized, /<synthetic-user-id>/);
  assert.doesNotMatch(serialized, /<synthetic-message-id>/);

  liveService.stop();
});

test('live service passes poll config and acknowledges marker after successful processing', async () => {
  const requests = [];
  const ackedMarkers = [];
  const inboundClient = {
    state: {
      marker: null
    },
    ack(marker) {
      ackedMarkers.push(marker);
      this.state.marker = marker;
      return marker;
    },
    async poll() {
      requests.push({ marker: this.state.marker });
      return {
        updates: [readFixture('max-inbound-user.fixture.json')],
        marker: 77
      };
    }
  };
  const outboundClient = {
    send() {
      return {
        mode: 'live',
        networkEnabled: true,
        response: {
          statusCode: 200
        }
      };
    }
  };
  const liveService = createLiveBotPlatformService({
    MAX_TRANSPORT_MODE: 'long_polling',
    MAX_API_URL: 'https://synthetic.example',
    MAX_BOT_TOKEN: 'synthetic-bot-token',
    MAX_POLL_LIMIT: '7',
    MAX_POLL_TIMEOUT_SECONDS: '3',
    MAX_POLL_TYPES: 'message_created'
  }, {
    inboundClient,
    outboundClient,
    routeHandlers,
    logger: createCaptureLogger([]),
    sleep: async () => {},
    maxCycles: 1,
    installSignalHandlers: false
  });

  liveService.start();
  await liveService.loopPromise;

  assert.deepEqual(requests, [{ marker: null }]);
  assert.deepEqual(ackedMarkers, [77]);
  assert.equal(inboundClient.state.marker, 77);
  assert.equal(liveService.runtimeConfig.maxPollLimit, 7);
  assert.equal(liveService.runtimeConfig.maxPollTimeoutSeconds, 3);
  assert.deepEqual(liveService.runtimeConfig.maxPollTypes, ['message_created']);

  liveService.stop();
});

test('live service does not acknowledge marker when processing fails', async () => {
  const ackedMarkers = [];
  const liveService = createLiveBotPlatformService({
    MAX_TRANSPORT_MODE: 'long_polling',
    MAX_API_URL: 'https://synthetic.example',
    MAX_BOT_TOKEN: 'synthetic-bot-token'
  }, {
    inboundClient: {
      state: {
        marker: null
      },
      ack(marker) {
        ackedMarkers.push(marker);
        return marker;
      },
      async poll() {
        return {
          updates: [readFixture('max-inbound-user.fixture.json')],
          marker: 77
        };
      }
    },
    outboundClient: {
      send() {
        throw new Error('synthetic outbound failure');
      }
    },
    logger: createCaptureLogger([]),
    sleep: async () => {},
    maxCycles: 1,
    installSignalHandlers: false
  });

  liveService.start();
  await liveService.loopPromise;

  assert.deepEqual(ackedMarkers, []);
  assert.equal(liveService.state.updates, 0);
  assert.equal(liveService.state.results.length, 0);

  liveService.stop();
});

test('live service rejects webhook mode with the documented stub message', () => {
  assert.throws(
    () => createLiveBotPlatformService({
      MAX_TRANSPORT_MODE: 'webhook'
    }),
    /Не реализовано: transport mode webhook/
  );
});

test('live service recovers from malformed inbound updates without leaking secrets', async () => {
  const entries = [];
  const liveService = createLiveBotPlatformService({
    MAX_TRANSPORT_MODE: 'long_polling',
    MAX_API_URL: 'https://synthetic.example',
    MAX_BOT_TOKEN: 'synthetic-secret-token'
  }, {
    httpClient: {
      get() {
        return {
          statusCode: 200,
          body: {
            updates: [null],
            marker: 1
          }
        };
      },
      post() {
        throw new Error('outbound should not be called');
      }
    },
    logger: createCaptureLogger(entries),
    maxCycles: 1,
    sleep: async () => {},
    installSignalHandlers: false
  });

  liveService.start();
  await liveService.loopPromise;

  const serialized = JSON.stringify(entries);

  assert.equal(liveService.state.polls, 0);
  assert.equal(liveService.state.updates, 0);
  assert.equal(liveService.state.results.length, 0);
  assert.ok(entries.some((entry) => entry.level === 'error' && entry.message === 'long polling cycle failed'));
  assert.ok(entries.some((entry) => entry.level === 'error' && entry.message === 'long polling loop recovered from error'));
  assert.doesNotMatch(serialized, /synthetic-secret-token/);
  assert.doesNotMatch(serialized, /<synthetic-user-id>/);
  assert.doesNotMatch(serialized, /<synthetic-message-id>/);

  liveService.stop();
});

test('live service logs safe transport failure diagnostics without leaking secrets', async () => {
  const entries = [];
  const transportError = new Error('fetch failed');
  transportError.cause = {
    code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    message: 'unable to get local issuer certificate',
    hostname: 'platform-api2.max.ru'
  };
  const liveService = createLiveBotPlatformService({
    MAX_TRANSPORT_MODE: 'long_polling',
    MAX_API_URL: 'https://synthetic.example',
    MAX_BOT_TOKEN: 'synthetic-secret-token'
  }, {
    httpClient: {
      get() {
        throw transportError;
      },
      post() {
        throw new Error('outbound should not be called');
      }
    },
    logger: createCaptureLogger(entries),
    maxCycles: 1,
    sleep: async () => {},
    installSignalHandlers: false
  });

  liveService.start();
  await liveService.loopPromise;

  const cycleFailure = entries.find((entry) => (
    entry.level === 'error' && entry.message === 'long polling cycle failed'
  ));
  const serialized = JSON.stringify(entries);

  assert.ok(cycleFailure);
  assert.equal(cycleFailure.context.error, 'MAX API request failed');
  assert.equal(cycleFailure.context.code, MAX_API_ERROR_CODE);
  assert.deepEqual(cycleFailure.context.details, {
    causeCode: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    causeMessage: 'unable to get local issuer certificate',
    causeHost: 'platform-api2.max.ru',
    reason: 'transport failure'
  });
  assert.doesNotMatch(serialized, /synthetic-secret-token/);
  assert.doesNotMatch(serialized, /Authorization/);
  assert.doesNotMatch(serialized, /<synthetic-user-id>/);

  liveService.stop();
});

test('live service classifies outbound API failures and keeps the loop alive', async () => {
  const entries = [];
  const liveService = createLiveBotPlatformService({
    MAX_TRANSPORT_MODE: 'long_polling',
    MAX_API_URL: 'https://synthetic.example',
    MAX_BOT_TOKEN: 'synthetic-secret-token'
  }, {
    httpClient: {
      get() {
        return {
          statusCode: 200,
          body: {
            updates: [readFixture('max-inbound-user.fixture.json')],
            marker: 2
          }
        };
      },
      post() {
        return {
          statusCode: 503,
          body: {
            error: 'synthetic failure'
          }
        };
      }
    },
    logger: createCaptureLogger(entries),
    maxCycles: 1,
    sleep: async () => {},
    installSignalHandlers: false
  });

  liveService.start();
  await liveService.loopPromise;

  const serialized = JSON.stringify(entries);

  assert.equal(liveService.state.polls, 1);
  assert.equal(liveService.state.updates, 0);
  assert.equal(liveService.state.results.length, 0);
  assert.ok(entries.some((entry) => entry.level === 'error' && entry.message === 'long polling cycle failed'));
  assert.ok(entries.some((entry) => entry.level === 'error' && entry.message === 'long polling loop recovered from error'));
  assert.doesNotMatch(serialized, /synthetic-secret-token/);
  assert.doesNotMatch(serialized, /<synthetic-user-id>/);

  liveService.stop();
});
