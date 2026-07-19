'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createQueueWorker } = require('../../src/bot-platform/queue/worker');

function createBatchStore(allItems, batchSize = allItems.length) {
  let cursor = 0;

  return {
    dequeue: (size) => {
      const batch = allItems.slice(cursor, cursor + size);
      cursor += batch.length;
      return batch;
    },
    ack: () => {},
    nack: () => {},
    stats: () => ({})
  };
}

function makeItem(id, payload, attempts = 0) {
  return { id, payload, attempts, reqId: `req-${id}` };
}

function silentLogger() {
  return { info: () => {}, error: () => {} };
}

// ---------------------------------------------------------------------------
// 1. Random delivery: delivered/undelivered to random number
// ---------------------------------------------------------------------------

test('stress: 500 messages with 30% random failure rate', async () => {
  const TOTAL = 500;
  const FAIL_RATE = 0.3;
  const items = [];
  const outcomes = [];

  for (let i = 0; i < TOTAL; i++) {
    outcomes.push(Math.random() < FAIL_RATE);
  }

  for (let i = 0; i < TOTAL; i++) {
    items.push(makeItem(i, { text: `msg-${i}` }));
  }

  let sendIndex = 0;
  const store = createBatchStore(items);
  const outbound = {
    send: async () => {
      const shouldFail = outcomes[sendIndex];
      sendIndex++;
      if (shouldFail) {
        throw new Error('random failure');
      }
    }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: TOTAL,
    maxAttempts: 1,
    logger: silentLogger()
  });

  let acked = 0;
  let nacked = 0;
  store.ack = () => { acked++; };
  store.nack = () => { nacked++; };

  const result = await worker.poll();

  const expectedDelivered = outcomes.filter((f) => !f).length;
  const expectedFailed = outcomes.filter((f) => f).length;

  assert.equal(result.processed, expectedDelivered);
  assert.equal(acked, expectedDelivered);
  assert.equal(nacked, expectedFailed);
  assert.equal(acked + nacked, TOTAL);
});

test('stress: 1000 messages with 50% random failure rate', async () => {
  const TOTAL = 1000;
  const items = [];
  const outcomes = [];

  for (let i = 0; i < TOTAL; i++) {
    outcomes.push(Math.random() < 0.5);
  }

  for (let i = 0; i < TOTAL; i++) {
    items.push(makeItem(i, { text: `msg-${i}` }));
  }

  let sendIndex = 0;
  const store = createBatchStore(items);
  const outbound = {
    send: async () => {
      if (outcomes[sendIndex]) {
        sendIndex++;
        throw new Error('random failure');
      }
      sendIndex++;
    }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: TOTAL,
    maxAttempts: 1,
    logger: silentLogger()
  });

  let acked = 0;
  let nacked = 0;
  store.ack = () => { acked++; };
  store.nack = () => { nacked++; };

  const result = await worker.poll();

  const expectedDelivered = outcomes.filter((f) => !f).length;
  const expectedFailed = outcomes.filter((f) => f).length;

  assert.equal(result.processed, expectedDelivered);
  assert.equal(acked + nacked, TOTAL);
  assert.ok(Math.abs(expectedDelivered - expectedFailed) < TOTAL * 0.15,
    `delivered (${expectedDelivered}) and failed (${expectedFailed}) should be roughly equal`);
});

test('stress: 0% failure — all delivered', async () => {
  const TOTAL = 200;
  const items = Array.from({ length: TOTAL }, (_, i) => makeItem(i, { text: `msg-${i}` }));

  const store = createBatchStore(items);
  let sendCount = 0;
  const outbound = {
    send: async () => { sendCount++; }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: TOTAL,
    maxAttempts: 1,
    logger: silentLogger()
  });

  let acked = 0;
  store.ack = () => { acked++; };

  const result = await worker.poll();

  assert.equal(result.processed, TOTAL);
  assert.equal(acked, TOTAL);
  assert.equal(sendCount, TOTAL);
});

test('stress: 100% failure — all nacked', async () => {
  const TOTAL = 200;
  const items = Array.from({ length: TOTAL }, (_, i) => makeItem(i, { text: `msg-${i}` }));

  const store = createBatchStore(items);
  const outbound = {
    send: async () => { throw new Error('always fail'); }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: TOTAL,
    maxAttempts: 1,
    logger: silentLogger()
  });

  let nacked = 0;
  store.nack = () => { nacked++; };

  const result = await worker.poll();

  assert.equal(result.processed, 0);
  assert.equal(nacked, TOTAL);
});

// ---------------------------------------------------------------------------
// 2. Message sizes: empty / normal / over size
// ---------------------------------------------------------------------------

test('stress: empty message payload processed without error', async () => {
  const items = [makeItem(1, {})];
  const store = createBatchStore(items);
  let sentPayload = null;
  const outbound = {
    send: async (payload) => { sentPayload = payload; }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: 1,
    logger: silentLogger()
  });

  const result = await worker.poll();

  assert.equal(result.processed, 1);
  assert.deepEqual(sentPayload, {});
});

test('stress: normal size message (100 bytes)', async () => {
  const text = 'x'.repeat(100);
  const items = [makeItem(1, { text })];
  const store = createBatchStore(items);
  let sentPayload = null;
  const outbound = {
    send: async (payload) => { sentPayload = payload; }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: 1,
    logger: silentLogger()
  });

  const result = await worker.poll();

  assert.equal(result.processed, 1);
  assert.equal(sentPayload.text, text);
  assert.equal(sentPayload.text.length, 100);
});

test('stress: medium size message (2000 bytes)', async () => {
  const text = 'a'.repeat(2000);
  const items = [makeItem(1, { text })];
  const store = createBatchStore(items);
  let sentPayload = null;
  const outbound = {
    send: async (payload) => { sentPayload = payload; }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: 1,
    logger: silentLogger()
  });

  const result = await worker.poll();

  assert.equal(result.processed, 1);
  assert.equal(sentPayload.text.length, 2000);
});

test('stress: near-limit message (3999 bytes)', async () => {
  const text = 'b'.repeat(3999);
  const items = [makeItem(1, { text })];
  const store = createBatchStore(items);
  let sentPayload = null;
  const outbound = {
    send: async (payload) => { sentPayload = payload; }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: 1,
    logger: silentLogger()
  });

  const result = await worker.poll();

  assert.equal(result.processed, 1);
  assert.equal(sentPayload.text.length, 3999);
});

test('stress: over-limit message (5000 bytes) still processed by worker', async () => {
  const text = 'c'.repeat(5000);
  const items = [makeItem(1, { text })];
  const store = createBatchStore(items);
  let sentPayload = null;
  const outbound = {
    send: async (payload) => { sentPayload = payload; }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: 1,
    logger: silentLogger()
  });

  const result = await worker.poll();

  assert.equal(result.processed, 1);
  assert.equal(sentPayload.text.length, 5000);
});

test('stress: mixed sizes in single batch', async () => {
  const payloads = [
    {},
    { text: '' },
    { text: 'hello' },
    { text: 'x'.repeat(500) },
    { text: 'y'.repeat(3999) },
    { text: 'z'.repeat(5000) }
  ];

  const items = payloads.map((p, i) => makeItem(i, p));
  const store = createBatchStore(items);
  const sentPayloads = [];
  const outbound = {
    send: async (payload) => { sentPayloads.push(payload); }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: payloads.length,
    logger: silentLogger()
  });

  const result = await worker.poll();

  assert.equal(result.processed, payloads.length);
  assert.equal(sentPayloads.length, payloads.length);
  assert.deepEqual(sentPayloads[0], {});
  assert.equal(sentPayloads[1].text, '');
  assert.equal(sentPayloads[2].text, 'hello');
  assert.equal(sentPayloads[3].text.length, 500);
  assert.equal(sentPayloads[4].text.length, 3999);
  assert.equal(sentPayloads[5].text.length, 5000);
});

// ---------------------------------------------------------------------------
// 3. Throughput: timed message processing at 10/100/1000 msg thresholds
// ---------------------------------------------------------------------------

test('stress: throughput >= 10 msg/sec (200 messages)', async () => {
  const TOTAL = 200;
  const items = Array.from({ length: TOTAL }, (_, i) => makeItem(i, { text: `msg-${i}` }));

  const store = createBatchStore(items);
  const outbound = {
    send: async () => {}
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: TOTAL,
    logger: silentLogger()
  });

  const start = process.hrtime.bigint();
  const result = await worker.poll();
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const elapsedMs = elapsedNs / 1e6;
  const msgsPerSec = (TOTAL / elapsedMs) * 1000;

  assert.equal(result.processed, TOTAL);
  assert.ok(msgsPerSec >= 10,
    `throughput ${msgsPerSec.toFixed(0)} msg/sec is below 10 msg/sec threshold`);
});

test('stress: throughput >= 100 msg/sec (500 messages)', async () => {
  const TOTAL = 500;
  const items = Array.from({ length: TOTAL }, (_, i) => makeItem(i, { text: `msg-${i}` }));

  const store = createBatchStore(items);
  const outbound = {
    send: async () => {}
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: TOTAL,
    logger: silentLogger()
  });

  const start = process.hrtime.bigint();
  const result = await worker.poll();
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const elapsedMs = elapsedNs / 1e6;
  const msgsPerSec = (TOTAL / elapsedMs) * 1000;

  assert.equal(result.processed, TOTAL);
  assert.ok(msgsPerSec >= 100,
    `throughput ${msgsPerSec.toFixed(0)} msg/sec is below 100 msg/sec threshold`);
});

test('stress: throughput >= 1000 msg/sec (2000 messages)', async () => {
  const TOTAL = 2000;
  const items = Array.from({ length: TOTAL }, (_, i) => makeItem(i, { text: `msg-${i}` }));

  const store = createBatchStore(items);
  const outbound = {
    send: async () => {}
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: TOTAL,
    logger: silentLogger()
  });

  const start = process.hrtime.bigint();
  const result = await worker.poll();
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const elapsedMs = elapsedNs / 1e6;
  const msgsPerSec = (TOTAL / elapsedMs) * 1000;

  assert.equal(result.processed, TOTAL);
  assert.ok(msgsPerSec >= 1000,
    `throughput ${msgsPerSec.toFixed(0)} msg/sec is below 1000 msg/sec threshold`);
});

test('stress: throughput with 50% failure >= 100 msg/sec (500 messages)', async () => {
  const TOTAL = 500;
  const items = Array.from({ length: TOTAL }, (_, i) => makeItem(i, { text: `msg-${i}` }));

  let sendIndex = 0;
  const store = createBatchStore(items);
  const outbound = {
    send: async () => {
      if (sendIndex % 2 === 1) {
        sendIndex++;
        throw new Error('fail');
      }
      sendIndex++;
    }
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: TOTAL,
    maxAttempts: 1,
    logger: silentLogger()
  });

  const start = process.hrtime.bigint();
  const result = await worker.poll();
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const elapsedMs = elapsedNs / 1e6;
  const totalAttempted = result.processed + (TOTAL - result.processed);
  const msgsPerSec = (totalAttempted / elapsedMs) * 1000;

  assert.equal(totalAttempted, TOTAL);
  assert.ok(msgsPerSec >= 100,
    `throughput ${msgsPerSec.toFixed(0)} msg/sec is below 100 msg/sec threshold`);
});

// ---------------------------------------------------------------------------
// 4. Multi-batch stress: worker processes multiple sequential batches
// ---------------------------------------------------------------------------

test('stress: sequential poll cycles drain 1000 messages in batches of 100', async () => {
  const TOTAL = 1000;
  const BATCH_SIZE = 100;
  const items = Array.from({ length: TOTAL }, (_, i) => makeItem(i, { text: `msg-${i}` }));

  let cursor = 0;
  const store = {
    dequeue: (size) => {
      const batch = items.slice(cursor, cursor + size);
      cursor += batch.length;
      return batch;
    },
    ack: () => {},
    nack: () => {},
    stats: () => ({})
  };

  const outbound = {
    send: async () => {}
  };

  const worker = createQueueWorker({
    queueStore: store,
    outboundClient: outbound,
    batchSize: BATCH_SIZE,
    logger: silentLogger()
  });

  let totalProcessed = 0;
  const start = process.hrtime.bigint();

  for (let cycle = 0; cycle < Math.ceil(TOTAL / BATCH_SIZE) + 1; cycle++) {
    const result = await worker.poll();
    totalProcessed += result.processed;
    if (result.processed === 0) break;
  }

  const elapsedNs = Number(process.hrtime.bigint() - start);
  const elapsedMs = elapsedNs / 1e6;

  assert.equal(totalProcessed, TOTAL);
});

test('stress: worker handles interleaved success/failure across 500 messages', async () => {
  const TOTAL = 500;
  const items = Array.from({ length: TOTAL }, (_, i) => makeItem(i, { text: `msg-${i}` }));

  const failIds = new Set();
  for (let i = 0; i < TOTAL; i++) {
    if (Math.random() < 0.4) failIds.add(i);
  }

  let sendCount = 0;
  const outbound = {
    send: async (payload) => {
      sendCount++;
      const msgId = parseInt(payload.text.split('-')[1], 10);
      if (failIds.has(msgId)) {
        throw new Error('random failure');
      }
    }
  };

  let ackedIds = [];
  let nackedIds = [];
  const store2 = createBatchStore(items);
  store2.ack = (id) => { ackedIds.push(id); };
  store2.nack = (id) => { nackedIds.push(id); };

  const worker = createQueueWorker({
    queueStore: store2,
    outboundClient: outbound,
    batchSize: TOTAL,
    maxAttempts: 1,
    logger: silentLogger()
  });

  const result = await worker.poll();

  assert.equal(sendCount, TOTAL);
  assert.equal(ackedIds.length + nackedIds.length, TOTAL);
  assert.equal(result.processed, TOTAL - failIds.size);
  assert.equal(nackedIds.length, failIds.size);
});
