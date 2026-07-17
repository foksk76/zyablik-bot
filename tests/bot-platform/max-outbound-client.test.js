const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMaxOutboundClient,
  buildMaxOutboundPayload,
  buildMaxOutboundRequest,
  MAX_API_ERROR_CODE
} = require('../../src/bot-platform/transports/max');

function createIdentityResponse() {
  return {
    kind: 'identity',
    recipient: {
      kind: 'user'
    },
    zabbix: {
      recipientType: 'user_id',
      to: '<synthetic-user-id>'
    },
    text: 'Recipient parameters:\nRecipientType: user_id\nTo: <synthetic-user-id>'
  };
}

function createTextResponse() {
  return {
    kind: 'text',
    recipient: {
      kind: 'user',
      value: '<synthetic-user-id>'
    },
    text: 'Ready to help.'
  };
}

test('buildMaxOutboundPayload creates a minimal payload from identity response', () => {
  const payload = buildMaxOutboundPayload(createIdentityResponse());

  assert.deepEqual(payload, {
    recipientType: 'user_id',
    to: '<synthetic-user-id>',
    text: 'Recipient parameters:\nRecipientType: user_id\nTo: <synthetic-user-id>'
  });
});

test('buildMaxOutboundPayload rejects invalid response', () => {
  assert.throws(
    () => buildMaxOutboundPayload({}),
    /Invalid response/
  );
});

test('createMaxOutboundClient returns dry-run request without raw fields', async () => {
  const client = createMaxOutboundClient({
    apiUrl: 'https://synthetic.example/messages'
  });
  const result = await client.send(createIdentityResponse());

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.networkEnabled, false);
  assert.equal(result.request.method, 'POST');
  assert.equal(result.request.url, 'https://synthetic.example/messages');
  assert.equal(result.request.headers['Content-Type'], 'application/json');
  assert.deepEqual(result.request.body, {
    recipientType: 'user_id',
    to: '<synthetic-user-id>',
    text: 'Recipient parameters:\nRecipientType: user_id\nTo: <synthetic-user-id>'
  });
  assert.equal(result.request.body.raw, undefined);
  assert.equal(result.payload.raw, undefined);
});

test('createMaxOutboundClient does not log raw token values', async () => {
  const entries = [];
  const client = createMaxOutboundClient({
    apiUrl: 'https://synthetic.example/messages',
    token: 'synthetic-secret-token',
    logger: {
      info(entry, context) {
        entries.push({ entry, context });
      }
    }
  });

  await client.send(createIdentityResponse());

  const serialized = JSON.stringify(entries);
  assert.doesNotMatch(serialized, /synthetic-secret-token/);
  assert.doesNotMatch(serialized, /<synthetic-user-id>/);
});

test('buildMaxOutboundRequest creates a live MAX request with injected auth header', () => {
  const response = createIdentityResponse();
  const payload = buildMaxOutboundPayload(response);
  const request = buildMaxOutboundRequest(response, payload, {
    apiUrl: 'https://synthetic.example/messages',
    token: 'synthetic-secret-token'
  });

  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://synthetic.example/messages?user_id=%3Csynthetic-user-id%3E');
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.equal(request.headers.Authorization, 'synthetic-secret-token');
  assert.deepEqual(request.body, {
    text: 'Recipient parameters:\nRecipientType: user_id\nTo: <synthetic-user-id>',
    notify: true,
    format: 'markdown'
  });
});

test('createMaxOutboundClient uses injectable HTTP transport in live mode', async () => {
  const requests = [];
  const client = createMaxOutboundClient({
    apiUrl: 'https://synthetic.example/messages',
    token: 'synthetic-secret-token',
    httpClient: {
      post(request) {
        requests.push(request);
        return {
          statusCode: 200,
          body: {
            message: {
              id: 'synthetic-message-id'
            }
          }
        };
      }
    },
    networkEnabled: true
  });

  const result = await client.send(createIdentityResponse());

  assert.equal(result.mode, 'live');
  assert.equal(result.networkEnabled, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.Authorization, 'synthetic-secret-token');
  assert.equal(requests[0].url, 'https://synthetic.example/messages?user_id=%3Csynthetic-user-id%3E');
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.body.message.id, 'synthetic-message-id');
});

test('createMaxOutboundClient normalizes live HTTP failures safely', async () => {
  const client = createMaxOutboundClient({
    apiUrl: 'https://synthetic.example/messages',
    token: 'synthetic-secret-token',
    httpClient: {
      post() {
        return {
          statusCode: 503,
          body: {
            error: 'synthetic failure'
          }
        };
      }
    },
    networkEnabled: true
  });

  await assert.rejects(
    client.send(createIdentityResponse()),
    (error) => {
      assert.equal(error.code, MAX_API_ERROR_CODE);
      assert.equal(error.message, 'MAX API request failed');
      assert.deepEqual(error.details, { statusCode: 503 });
      return true;
    }
  );
});

test('buildMaxOutboundPayload creates payload from text response', () => {
  const payload = buildMaxOutboundPayload(createTextResponse());

  assert.deepEqual(payload, {
    recipientType: 'user_id',
    to: '<synthetic-user-id>',
    text: 'Ready to help.'
  });
});

test('createMaxOutboundClient sends text response through live HTTP transport', async () => {
  const requests = [];
  const client = createMaxOutboundClient({
    apiUrl: 'https://synthetic.example/messages',
    token: 'synthetic-secret-token',
    httpClient: {
      post(request) {
        requests.push(request);
        return {
          statusCode: 200,
          body: {
            message: {
              id: 'synthetic-message-id'
            }
          }
        };
      }
    },
    networkEnabled: true
  });

  const result = await client.send(createTextResponse());

  assert.equal(result.mode, 'live');
  assert.equal(result.networkEnabled, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.Authorization, 'synthetic-secret-token');
  assert.equal(requests[0].url, 'https://synthetic.example/messages?user_id=%3Csynthetic-user-id%3E');
  assert.deepEqual(requests[0].body, {
    text: 'Ready to help.',
    notify: true,
    format: 'markdown'
  });
  assert.equal(result.response.statusCode, 200);
});

test('createMaxOutboundClient keeps safe transport failure diagnostics', async () => {
  const transportError = new Error('fetch failed');
  transportError.cause = {
    code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    message: 'unable to get local issuer certificate',
    hostname: 'platform-api2.max.ru'
  };
  const client = createMaxOutboundClient({
    apiUrl: 'https://synthetic.example/messages',
    token: 'synthetic-secret-token',
    httpClient: {
      post() {
        throw transportError;
      }
    },
    networkEnabled: true
  });

  await assert.rejects(
    client.send(createIdentityResponse()),
    (error) => {
      assert.equal(error.code, MAX_API_ERROR_CODE);
      assert.equal(error.message, 'MAX API request failed');
      assert.deepEqual(error.details, {
        reason: 'transport failure',
        causeCode: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
        causeMessage: 'unable to get local issuer certificate',
        causeHost: 'platform-api2.max.ru'
      });
      return true;
    }
  );
});
