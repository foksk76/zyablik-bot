const test = require('node:test');
const assert = require('node:assert/strict');

const { createQueueStore } = require('../../src/bot-platform/queue/store');

function createStore() {
  return createQueueStore({ dbPath: ':memory:' });
}

function makeEntry(payload = { text: 'test' }, source = 'zabbix') {
  return { payload, source };
}

test('createQueueStore initializes without errors', () => {
  const store = createStore();
  assert.ok(store);
  assert.equal(typeof store.enqueue, 'function');
  assert.equal(typeof store.dequeue, 'function');
  assert.equal(typeof store.ack, 'function');
  assert.equal(typeof store.nack, 'function');
  assert.equal(typeof store.stats, 'function');
  assert.equal(typeof store.close, 'function');
  store.close();
});

test('enqueue creates a pending record and returns id', () => {
  const store = createStore();
  const entry = makeEntry();
  const result = store.enqueue(entry);

  assert.equal(typeof result.id, 'number');
  assert.ok(result.id > 0);
  store.close();
});

test('dequeue returns pending records and marks them as processing', () => {
  const store = createStore();
  const entry = makeEntry();
  store.enqueue(entry);

  const batch = store.dequeue(10);

  assert.equal(batch.length, 1);
  assert.equal(batch[0].status, 'processing');
  assert.equal(batch[0].payload.text, 'test');
  assert.equal(batch[0].source, 'zabbix');
  store.close();
});

test('ack sets status to delivered', () => {
  const store = createStore();
  const { id } = store.enqueue(makeEntry());
  store.dequeue(10);

  store.ack(id);

  const stats = store.stats();
  assert.equal(stats.delivered, 1);
  assert.equal(stats.processing, 0);
  store.close();
});

test('nack with attempts < max sets status to pending with next_retry_at', () => {
  const store = createStore();
  const { id } = store.enqueue(makeEntry());
  store.dequeue(10);

  store.nack(id, 1, 5);

  const stats = store.stats();
  assert.equal(stats.pending, 1);
  assert.equal(stats.processing, 0);
  store.close();
});

test('nack with attempts >= max sets status to failed', () => {
  const store = createStore();
  const { id } = store.enqueue(makeEntry());
  store.dequeue(10);

  store.nack(id, 5, 5);

  const stats = store.stats();
  assert.equal(stats.failed, 1);
  assert.equal(stats.processing, 0);
  store.close();
});

test('stats returns correct counts', () => {
  const store = createStore();

  store.enqueue(makeEntry({ text: 'a' }));
  store.enqueue(makeEntry({ text: 'b' }));
  store.enqueue(makeEntry({ text: 'c' }));

  let stats = store.stats();
  assert.equal(stats.pending, 3);
  assert.equal(stats.processing, 0);
  assert.equal(stats.delivered, 0);
  assert.equal(stats.failed, 0);

  const batch = store.dequeue(2);
  stats = store.stats();
  assert.equal(stats.pending, 1);
  assert.equal(stats.processing, 2);

  store.ack(batch[0].id);
  stats = store.stats();
  assert.equal(stats.delivered, 1);
  assert.equal(stats.processing, 1);
  store.close();
});

test('dequeue skips records with next_retry_at in the future', () => {
  const store = createStore();
  const { id } = store.enqueue(makeEntry());
  store.dequeue(10);

  store.nack(id, 1, 5);

  const batch = store.dequeue(10);
  assert.equal(batch.length, 0);
  store.close();
});

test('enqueue with object payload stringifies it', () => {
  const store = createStore();
  const payload = { text: 'alert', severity: 'high' };
  const { id } = store.enqueue({ payload, source: 'zabbix' });
  const batch = store.dequeue(10);

  assert.equal(batch.length, 1);
  assert.deepEqual(batch[0].payload, payload);
  store.close();
});

test('dequeue respects batchSize limit', () => {
  const store = createStore();
  store.enqueue(makeEntry({ text: 'a' }));
  store.enqueue(makeEntry({ text: 'b' }));
  store.enqueue(makeEntry({ text: 'c' }));

  const batch = store.dequeue(2);
  assert.equal(batch.length, 2);

  const remaining = store.dequeue(10);
  assert.equal(remaining.length, 1);
  store.close();
});

test('dequeue returns empty array when queue is empty', () => {
  const store = createStore();
  const batch = store.dequeue(10);
  assert.deepEqual(batch, []);
  store.close();
});

test('enqueue stores req_id and dequeue returns it', () => {
  const store = createStore();
  const { id } = store.enqueue({ payload: { text: 'test' }, source: 'zabbix', reqId: 'req-abc-123' });
  const batch = store.dequeue(10);

  assert.equal(batch.length, 1);
  assert.equal(batch[0].reqId, 'req-abc-123');
  store.close();
});

test('enqueue without reqId stores null', () => {
  const store = createStore();
  store.enqueue({ payload: { text: 'test' }, source: 'zabbix' });
  const batch = store.dequeue(10);

  assert.equal(batch.length, 1);
  assert.equal(batch[0].reqId, null);
  store.close();
});

test('enqueue with reqId logs trace enqueued', () => {
  const logEntries = [];
  const logger = { info: (msg) => logEntries.push(msg) };
  const store = createQueueStore({ dbPath: ':memory:', logger });

  store.enqueue({ payload: { text: 'test' }, source: 'zabbix', reqId: 'req-xyz' });

  const enqueuedLog = logEntries.find((e) => typeof e === 'string' && e.includes('enqueued'));
  assert.ok(enqueuedLog, 'should have enqueued trace log');
  assert.ok(enqueuedLog.includes('req-xyz'), 'should include reqId');
  store.close();
});

test('enqueue without reqId skips trace log', () => {
  const logEntries = [];
  const logger = { info: (msg) => logEntries.push(msg) };
  const store = createQueueStore({ dbPath: ':memory:', logger });

  store.enqueue({ payload: { text: 'test' }, source: 'zabbix' });

  const enqueuedLog = logEntries.find((e) => typeof e === 'string' && e.includes('enqueued'));
  assert.equal(enqueuedLog, undefined, 'should not have trace log without reqId');
  store.close();
});
