const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createIngressHttpServer, MAX_API_TEXT_LIMIT } = require('../../src/bot-platform/ingress/http-server');

function createMockJwtAuth(shouldFail = false) {
  return {
    authenticate: async (header, options = {}) => {
      if (shouldFail || !header || header === '') throw new Error('auth failed');
      return { source: 'zabbix' };
    }
  };
}

function createMockNormalizerRegistry() {
  return {
    getNormalizer: (source) => {
      if (source === 'zabbix') {
        return (body) => ({
          source: 'zabbix',
          recipient: body.recipient,
          message: { text: body.message || '' },
          raw: { kind: 'reference', value: '<test>' }
        });
      }
      return null;
    }
  };
}

function createMockOutboundClient() {
  return {
    send: async (event) => ({ mode: 'live' })
  };
}

function createMockQueueStore() {
  let enqueued = [];
  return {
    enqueue: (entry) => { enqueued.push(entry); return { id: 1 }; },
    getEnqueued: () => enqueued
  };
}

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

let portCounter = 19000;

async function createAndStartServer(overrides = {}) {
  const port = portCounter++;
  const server = createIngressHttpServer({
    port,
    jwtAuth: overrides.jwtAuth || createMockJwtAuth(),
    normalizerRegistry: overrides.normalizerRegistry || createMockNormalizerRegistry(),
    outboundClient: overrides.outboundClient || createMockOutboundClient(),
    queueStore: overrides.queueStore || null,
    logger: overrides.logger || { info: () => {}, error: () => {} },
    logAudit: overrides.logAudit,
    logTrace: overrides.logTrace
  });
  await server.start();
  return { server, port };
}

test('POST /ingest with valid JWT + body returns 200', async () => {
  const { server, port } = await createAndStartServer();
  try {
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'test' },
      headers: { authorization: 'Bearer valid-token' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'sent');
  } finally {
    await server.stop();
  }
});

test('POST /ingest without JWT returns 401', async () => {
  const { server, port } = await createAndStartServer();
  try {
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'test' },
      headers: {}
    });
    assert.equal(res.status, 401);
  } finally {
    await server.stop();
  }
});

test('POST /ingest with invalid JWT returns 401', async () => {
  const { server, port } = await createAndStartServer({ jwtAuth: createMockJwtAuth(true) });
  try {
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'test' },
      headers: { authorization: 'Bearer invalid-token' }
    });
    assert.equal(res.status, 401);
  } finally {
    await server.stop();
  }
});

test('POST /ingest with invalid JSON returns 400', async () => {
  const { server, port } = await createAndStartServer();
  try {
    const res = await makeRequest(port, {
      method: 'POST',
      data: 'not json',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' }
    });
    assert.equal(res.status, 400);
  } finally {
    await server.stop();
  }
});

test('POST /ingest without recipient returns 400', async () => {
  const { server, port } = await createAndStartServer();
  try {
    const res = await makeRequest(port, {
      data: { message: 'test' },
      headers: { authorization: 'Bearer token' }
    });
    assert.equal(res.status, 400);
  } finally {
    await server.stop();
  }
});

test('POST /ingest with channel without recipient returns 501', async () => {
  const { server, port } = await createAndStartServer();
  try {
    const res = await makeRequest(port, {
      data: { channel: 'general' },
      headers: { authorization: 'Bearer token' }
    });
    assert.equal(res.status, 501);
  } finally {
    await server.stop();
  }
});

test('GET /ingest returns 404', async () => {
  const { server, port } = await createAndStartServer();
  try {
    const res = await makeRequest(port, {
      method: 'GET',
      headers: { authorization: 'Bearer token' }
    });
    assert.equal(res.status, 404);
  } finally {
    await server.stop();
  }
});

test('POST /ingest with queue enabled queues message', async () => {
  const queueStore = createMockQueueStore();
  const { server, port } = await createAndStartServer({ queueStore });
  try {
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'test' },
      headers: { authorization: 'Bearer token' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'queued');
    assert.equal(queueStore.getEnqueued().length, 1);
  } finally {
    await server.stop();
  }
});

test('POST /ingest generates reqId and logs trace ingress', async () => {
  const logEntries = [];
  const mockLogger = { info: (msg) => logEntries.push(msg), error: () => {} };
  const queueStore = createMockQueueStore();
  const { server, port } = await createAndStartServer({ queueStore, logger: mockLogger });
  try {
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'test' },
      headers: { authorization: 'Bearer token' }
    });
    assert.equal(res.status, 200);
    const ingressLog = logEntries.find((e) => typeof e === 'string' && e.includes('ingress-http-server:') && e.includes('ingress'));
    assert.ok(ingressLog, 'should have ingress trace log');
    assert.ok(ingressLog.includes('[ingress-http-server:'), 'should include reqId in module field');
  } finally {
    await server.stop();
  }
});

test('POST /ingest with queue logs audit message queued', async () => {
  const logEntries = [];
  const mockLogger = { info: (msg) => logEntries.push(msg), error: () => {} };
  const queueStore = createMockQueueStore();
  const { server, port } = await createAndStartServer({ queueStore, logger: mockLogger });
  try {
    await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'test' },
      headers: { authorization: 'Bearer token' }
    });
    const queuedLog = logEntries.find((e) => typeof e === 'string' && e.includes('message queued'));
    assert.ok(queuedLog, 'should have message queued audit log');
  } finally {
    await server.stop();
  }
});

test('POST /ingest with LOG_AUDIT=false skips audit logs', async () => {
  const logEntries = [];
  const mockLogger = { info: (msg) => logEntries.push(msg), error: () => {} };
  const queueStore = createMockQueueStore();
  const { server, port } = await createAndStartServer({
    queueStore,
    logger: mockLogger,
    logAudit: false
  });
  try {
    await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'test' },
      headers: { authorization: 'Bearer token' }
    });
    const queuedLog = logEntries.find((e) => typeof e === 'string' && e.includes('message queued'));
    assert.equal(queuedLog, undefined, 'should not have audit log when LOG_AUDIT=false');
  } finally {
    await server.stop();
  }
});

test('POST /ingest with LOG_TRACE=false skips trace logs', async () => {
  const logEntries = [];
  const mockLogger = { info: (msg) => logEntries.push(msg), error: () => {} };
  const queueStore = createMockQueueStore();
  const { server, port } = await createAndStartServer({
    queueStore,
    logger: mockLogger,
    logTrace: false
  });
  try {
    await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'test' },
      headers: { authorization: 'Bearer token' }
    });
    const ingressLog = logEntries.find((e) => typeof e === 'string' && e.includes('[ingress-http-server:') && e.includes('ingress'));
    assert.equal(ingressLog, undefined, 'should not have trace log when LOG_TRACE=false');
  } finally {
    await server.stop();
  }
});

test('POST /ingest with auth failure logs trace ingress', async () => {
  const logEntries = [];
  const mockLogger = { info: (msg) => logEntries.push(msg), error: () => {} };
  const { server, port } = await createAndStartServer({
    jwtAuth: createMockJwtAuth(true),
    logger: mockLogger
  });
  try {
    await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'test' },
      headers: { authorization: 'Bearer invalid' }
    });
    const ingressLog = logEntries.find((e) => typeof e === 'string' && e.includes('ingress'));
    assert.ok(ingressLog, 'should have ingress trace log even on auth failure');
  } finally {
    await server.stop();
  }
});

test('POST /ingest with reqId is passed to queue payload', async () => {
  const queueStore = createMockQueueStore();
  const { server, port } = await createAndStartServer({ queueStore });
  try {
    await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: 'test' },
      headers: { authorization: 'Bearer token' }
    });
    const enqueued = queueStore.getEnqueued();
    assert.equal(enqueued.length, 1);
    assert.equal(typeof enqueued[0].reqId, 'string');
    assert.ok(enqueued[0].reqId.length > 0, 'reqId should not be empty');
  } finally {
    await server.stop();
  }
});

test('POST /ingest with text at MAX_API_TEXT_LIMIT is accepted', async () => {
  const queueStore = createMockQueueStore();
  const { server, port } = await createAndStartServer({ queueStore });
  try {
    const text = 'x'.repeat(MAX_API_TEXT_LIMIT);
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: text },
      headers: { authorization: 'Bearer token' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'queued');
    assert.equal(queueStore.getEnqueued().length, 1);
  } finally {
    await server.stop();
  }
});

test('POST /ingest with text exceeding MAX_API_TEXT_LIMIT returns 413', async () => {
  const queueStore = createMockQueueStore();
  const { server, port } = await createAndStartServer({ queueStore });
  try {
    const text = 'x'.repeat(MAX_API_TEXT_LIMIT + 1);
    const res = await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: text },
      headers: { authorization: 'Bearer token' }
    });
    assert.equal(res.status, 413);
    assert.ok(res.body.error.includes('exceeds MAX API limit'));
    assert.ok(res.body.error.includes(String(MAX_API_TEXT_LIMIT + 1)));
    assert.equal(queueStore.getEnqueued().length, 0);
  } finally {
    await server.stop();
  }
});

test('POST /ingest with oversized text does not enqueue', async () => {
  const queueStore = createMockQueueStore();
  const { server, port } = await createAndStartServer({ queueStore });
  try {
    const text = 'x'.repeat(5000);
    await makeRequest(port, {
      data: { recipient: { kind: 'user', value: '123' }, message: text },
      headers: { authorization: 'Bearer token' }
    });
    assert.equal(queueStore.getEnqueued().length, 0, 'should not enqueue oversized message');
  } finally {
    await server.stop();
  }
});
