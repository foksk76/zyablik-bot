const test = require('node:test');
const assert = require('node:assert/strict');

const { createQueueWorker } = require('../../src/bot-platform/queue/worker');

function createMockQueueStore(items = []) {
  let callCount = 0;

  return {
    dequeue: () => {
      if (callCount < items.length) {
        const batch = items[callCount];
        callCount++;
        return Array.isArray(batch) ? batch : [batch];
      }
      return [];
    },
    ack: () => {},
    nack: () => {},
    stats: () => ({ pending: 0, processing: 0, delivered: 0, failed: 0 })
  };
}

function createMockOutboundClient(shouldFail = false, errorDetails = null) {
  return {
    send: async (payload) => {
      if (shouldFail) {
        const error = new Error('send failed');
        if (errorDetails) {
          error.details = errorDetails;
        }
        throw error;
      }
      return { mode: 'live' };
    }
  };
}

test('createQueueWorker returns object with start, stop, poll', () => {
  const store = createMockQueueStore();
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({ queueStore: store, outboundClient: outbound });

  assert.equal(typeof worker.start, 'function');
  assert.equal(typeof worker.stop, 'function');
  assert.equal(typeof worker.poll, 'function');
});

test('poll dequeues items and sends via outboundClient', async () => {
  const items = [{ id: 1, payload: { text: 'test' }, attempts: 0 }];
  const store = createMockQueueStore([items]);
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({ queueStore: store, outboundClient: outbound });

  const result = await worker.poll();

  assert.equal(result.processed, 1);
});

test('successful send calls ack', async () => {
  let ackedId = null;
  const items = [{ id: 42, payload: { text: 'test' }, attempts: 0 }];
  const store = {
    dequeue: () => items,
    ack: (id) => { ackedId = id; },
    nack: () => {},
    stats: () => ({})
  };
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({ queueStore: store, outboundClient: outbound });

  await worker.poll();

  assert.equal(ackedId, 42);
});

test('failed send calls nack', async () => {
  let nackedId = null;
  let nackedAttempts = null;
  let nackedMax = null;
  const items = [{ id: 43, payload: { text: 'test' }, attempts: 2 }];
  const store = {
    dequeue: () => items,
    ack: () => {},
    nack: (id, attempts, max) => {
      nackedId = id;
      nackedAttempts = attempts;
      nackedMax = max;
    },
    stats: () => ({})
  };
  const outbound = createMockOutboundClient(true);
  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    maxAttempts: 5
  });

  await worker.poll();

  assert.equal(nackedId, 43);
  assert.equal(nackedAttempts, 3);
  assert.equal(nackedMax, 5);
});

test('start creates interval', () => {
  const store = createMockQueueStore();
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({ queueStore: store, outboundClient: outbound, intervalMs: 100 });

  worker.start();
  worker.stop();
});

test('stop clears interval', () => {
  const store = createMockQueueStore();
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({ queueStore: store, outboundClient: outbound, intervalMs: 100 });

  worker.start();
  worker.stop();
});

test('worker continues after send error', async () => {
  const items = [
    { id: 1, payload: { text: 'fail' }, attempts: 0 },
    { id: 2, payload: { text: 'ok' }, attempts: 0 }
  ];
  let sendCount = 0;

  const store = {
    dequeue: () => items,
    ack: () => {},
    nack: () => {},
    stats: () => ({})
  };
  const outbound = {
    send: async (payload) => {
      sendCount++;
      if (payload.text === 'fail') {
        throw new Error('send failed');
      }
    }
  };
  const worker = createQueueWorker({ queueStore: store, outboundClient: outbound, maxAttempts: 5 });

  const result = await worker.poll();

  assert.equal(sendCount, 2);
  assert.equal(result.processed, 1);
});

test('poll returns 0 processed when queue is empty', async () => {
  const store = createMockQueueStore([]);
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({ queueStore: store, outboundClient: outbound });

  const result = await worker.poll();

  assert.equal(result.processed, 0);
});

test('start does not create duplicate intervals', () => {
  const store = createMockQueueStore();
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({ queueStore: store, outboundClient: outbound, intervalMs: 100 });

  worker.start();
  worker.start();
  worker.stop();
});

test('successful delivery logs delivered with duration_ms', async () => {
  const logEntries = [];
  const items = [{ id: 10, payload: { text: 'test' }, attempts: 0, reqId: 'req-abc' }];
  const store = createMockQueueStore([items]);
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    logger: { info: (msg) => logEntries.push(msg), error: () => {} }
  });

  await worker.poll();

  const deliveredLog = logEntries.find((e) => typeof e === 'string' && e.includes('delivered'));
  assert.ok(deliveredLog, 'should have delivered log');
  assert.ok(deliveredLog.includes('"id":10'), 'should include item id');
  assert.ok(deliveredLog.includes('"duration_ms"'), 'should include duration_ms');
});

test('failed delivery logs failed with reason', async () => {
  const logEntries = [];
  const items = [{ id: 11, payload: { text: 'fail' }, attempts: 2, reqId: 'req-def' }];
  const store = createMockQueueStore([items]);
  const outbound = createMockOutboundClient(true);
  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    maxAttempts: 5,
    logger: { info: (msg) => logEntries.push(msg), error: () => {} }
  });

  await worker.poll();

  const failedLog = logEntries.find((e) => typeof e === 'string' && e.includes('failed'));
  assert.ok(failedLog, 'should have failed log');
  assert.ok(failedLog.includes('"reason":"send failed"'), 'should include reason');
  assert.ok(failedLog.includes('"attempts":3'), 'should include attempts');
});

test('failed delivery logs error details when present', async () => {
  const logEntries = [];
  const items = [{ id: 14, payload: { text: 'fail' }, attempts: 0, reqId: 'req-detail' }];
  const store = createMockQueueStore([items]);
  const details = {
    statusCode: 404,
    responseBody: { code: 'chat.not.found', message: 'Chat with user 12345678 not found' }
  };
  const outbound = createMockOutboundClient(true, details);
  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    maxAttempts: 5,
    logger: { info: (msg) => logEntries.push(msg), error: () => {} }
  });

  await worker.poll();

  const failedLog = logEntries.find((e) => typeof e === 'string' && e.includes('failed'));
  assert.ok(failedLog, 'should have failed log');
  assert.ok(failedLog.includes('"statusCode":404'), 'should include statusCode from details');
  assert.ok(failedLog.includes('"code":"chat.not.found"'), 'should include responseBody code');
  assert.ok(failedLog.includes('"reason":"send failed"'), 'should include reason');
});

test('failed delivery preserves error.message reason when details contains reason key', async () => {
  const logEntries = [];
  const items = [{ id: 15, payload: { text: 'fail' }, attempts: 0, reqId: 'req-rate' }];
  const store = createMockQueueStore([items]);
  const errorDetails = { reason: 'recipient', key: 'user_id:999', wait_ms: 5000 };
  const outbound = {
    send: async () => {
      const error = new Error('Rate limiter wait timeout exceeded');
      error.code = 'RATE_LIMIT_TIMEOUT';
      error.details = errorDetails;
      throw error;
    }
  };
  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    maxAttempts: 5,
    logger: { info: (msg) => logEntries.push(msg), error: () => {} }
  });

  await worker.poll();

  const failedLog = logEntries.find((e) => typeof e === 'string' && e.includes('failed'));
  assert.ok(failedLog, 'should have failed log');
  assert.ok(failedLog.includes('"reason":"Rate limiter wait timeout exceeded"'), 'reason should be error.message, not details.reason');
  assert.ok(failedLog.includes('"key":"user_id:999"'), 'should include details.key');
  assert.ok(failedLog.includes('"wait_ms":5000'), 'should include details.wait_ms');
});

test('dequeued trace log includes reqId', async () => {
  const logEntries = [];
  const items = [{ id: 12, payload: { text: 'test' }, attempts: 0, reqId: 'req-ghi' }];
  const store = createMockQueueStore([items]);
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    logger: { info: (msg) => logEntries.push(msg), error: () => {} }
  });

  await worker.poll();

  const dequeuedLog = logEntries.find((e) => typeof e === 'string' && e.includes('dequeued'));
  assert.ok(dequeuedLog, 'should have dequeued trace log');
  assert.ok(dequeuedLog.includes('req-ghi'), 'should include reqId');
});

test('audit-only delivery logs action message delivered without reqId', async () => {
  const logEntries = [];
  const items = [{ id: 20, payload: { text: 'test' }, attempts: 0, reqId: 'req-audit1' }];
  const store = createMockQueueStore([items]);
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    logAudit: true,
    logTrace: false,
    logger: { info: (msg) => logEntries.push(msg), error: () => {} }
  });

  await worker.poll();

  const deliveredLog = logEntries.find((e) => typeof e === 'string' && e.includes('message delivered'));
  assert.ok(deliveredLog, 'should have "message delivered" audit log');
  assert.ok(!deliveredLog.includes('req-audit1'), 'audit log should not include reqId');
});

test('audit-only failed delivery logs action message failed without reqId', async () => {
  const logEntries = [];
  const items = [{ id: 21, payload: { text: 'fail' }, attempts: 2, reqId: 'req-audit2' }];
  const store = createMockQueueStore([items]);
  const outbound = createMockOutboundClient(true);
  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    maxAttempts: 5,
    logAudit: true,
    logTrace: false,
    logger: { info: (msg) => logEntries.push(msg), error: () => {} }
  });

  await worker.poll();

  const failedLog = logEntries.find((e) => typeof e === 'string' && e.includes('message failed'));
  assert.ok(failedLog, 'should have "message failed" audit log');
  assert.ok(!failedLog.includes('req-audit2'), 'audit log should not include reqId');
});

test('worker without logger works without errors', async () => {
  const items = [{ id: 13, payload: { text: 'test' }, attempts: 0 }];
  const store = createMockQueueStore([items]);
  const outbound = createMockOutboundClient();
  const worker = createQueueWorker({ queueStore: store, outboundClient: outbound });

  const result = await worker.poll();
  assert.equal(result.processed, 1);
});
