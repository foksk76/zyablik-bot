const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createIngressPipeline } = require('../../src/bot-platform/ingress');

function makeRequest(port, options) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: options.path || '/ingest',
      method: options.method || 'POST',
      headers: options.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (options.data) {
      req.write(JSON.stringify(options.data));
    }
    req.end();
  });
}

let portCounter = 20000;

function createMockOutboundClient() {
  let lastPayload = null;
  return {
    send: async (payload) => {
      lastPayload = payload;
      return { mode: 'live' };
    },
    getLastPayload: () => lastPayload
  };
}

function createMockJwtVerifier() {
  return {
    verifyAccessToken: async (token, audience) => {
      if (token === 'invalid-token') {
        throw new Error('token expired');
      }
      return { claims: { bot_source: 'zabbix', sub: 'test-user' } };
    }
  };
}

test('e2e: POST /ingest → auth → normalize → outbound.send', async () => {
  const port = portCounter++;
  const outbound = createMockOutboundClient();

  const pipeline = createIngressPipeline({
    port,
    issuer: 'https://synthetic.okta.com',
    audience: 'synthetic-audience',
    outboundClient: outbound,
    logger: { info: () => {}, error: () => {} },
    verifierFactory: () => createMockJwtVerifier()
  });

  await pipeline.start();

  try {
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'alert' },
      headers: { authorization: 'Bearer valid-token' }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'sent');

    const payload = outbound.getLastPayload();
    assert.equal(payload.source, 'zabbix');
    assert.equal(payload.recipient.kind, 'user');
    assert.equal(payload.recipient.value, '123');
    assert.equal(payload.message.text, 'alert');
  } finally {
    await pipeline.stop();
  }
});

test('e2e: POST /ingest with invalid JWT → 401', async () => {
  const port = portCounter++;
  const outbound = createMockOutboundClient();

  const pipeline = createIngressPipeline({
    port,
    issuer: 'https://synthetic.okta.com',
    audience: 'synthetic-audience',
    outboundClient: outbound,
    logger: { info: () => {}, error: () => {} },
    verifierFactory: () => createMockJwtVerifier()
  });

  await pipeline.start();

  try {
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'alert' },
      headers: { authorization: 'Bearer invalid-token' }
    });

    assert.equal(res.status, 401);
  } finally {
    await pipeline.stop();
  }
});

test('e2e: POST /ingest with queue enabled → queued', async () => {
  const port = portCounter++;
  const outbound = createMockOutboundClient();
  let enqueued = [];

  const mockQueueStore = {
    enqueue: (entry) => { enqueued.push(entry); return { id: 1 }; },
    dequeue: () => [],
    ack: () => {},
    nack: () => {}
  };

  const pipeline = createIngressPipeline({
    port,
    issuer: 'https://synthetic.okta.com',
    audience: 'synthetic-audience',
    outboundClient: outbound,
    queueStore: mockQueueStore,
    logger: { info: () => {}, error: () => {} },
    verifierFactory: () => createMockJwtVerifier()
  });

  await pipeline.start();

  try {
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'alert' },
      headers: { authorization: 'Bearer valid-token' }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'queued');
    assert.equal(enqueued.length, 1);
  } finally {
    await pipeline.stop();
  }
});

test('e2e: dry-run mode works without queue', async () => {
  const port = portCounter++;
  const outbound = createMockOutboundClient();

  const pipeline = createIngressPipeline({
    port,
    issuer: 'https://synthetic.okta.com',
    audience: 'synthetic-audience',
    outboundClient: outbound,
    logger: { info: () => {}, error: () => {} },
    verifierFactory: () => createMockJwtVerifier()
  });

  await pipeline.start();

  try {
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'chat', value: '456' }, message: 'test' },
      headers: { authorization: 'Bearer valid-token' }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'sent');

    const payload = outbound.getLastPayload();
    assert.equal(payload.recipient.kind, 'chat');
    assert.equal(payload.recipient.value, '456');
  } finally {
    await pipeline.stop();
  }
});
