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

// ADR-0033: reclaim зависших processing-строк после краша процесса.
//
// Семантика reclaimStale(ts): строка reclaim-ится, если
//   processing_since IS NULL OR processing_since <= ts - processingTtlSeconds
// Поэтому для симуляции "прошёл час" вызываем reclaimStale с ts = now + 3600.

test('reclaimStale returns stale processing rows to pending without incrementing attempts', () => {
  const store = createQueueStore({ dbPath: ':memory:', processingTtlSeconds: 300 });
  const { id } = store.enqueue(makeEntry());
  store.dequeue(10); // помечает processing_since = now

  // Симулируем краш + прошествие часа: reclaim с ts в будущем.
  const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
  const reclaimed = store.reclaimStale(oneHourLater);

  assert.equal(reclaimed, 1, 'should reclaim exactly one row');

  const batch = store.dequeue(10); // dequeue снова берёт reclaim-нутую строку
  assert.equal(batch.length, 1);
  assert.equal(batch[0].id, id);
  assert.equal(batch[0].status, 'processing');
  assert.equal(batch[0].attempts, 0, 'reclaim must not increment attempts');
  store.close();
});

test('reclaimStale does not touch processing rows within TTL', () => {
  const store = createQueueStore({ dbPath: ':memory:', processingTtlSeconds: 300 });
  store.enqueue(makeEntry());
  store.dequeue(10); // processing_since = now, свежая

  // ts = сейчас: processing_since (now) <= now - 300? Нет → не stale.
  const now = Math.floor(Date.now() / 1000);
  const reclaimed = store.reclaimStale(now);

  assert.equal(reclaimed, 0, 'fresh processing row must not be reclaimed');

  const stats = store.stats();
  assert.equal(stats.processing, 1, 'row stays in processing');
  assert.equal(stats.pending, 0);
  store.close();
});

test('reclaimStale treats NULL processing_since as stale', () => {
  // Напрямую тестируем NULL-ветку условия `processing_since IS NULL OR ...`.
  // NULL processing_since встречается у строк, оставшихся от кода до миграции
  // ADR-0033 (current код всегда ставит processing_since = now при dequeue).
  // Такие строки гарантированно stalled и должны reclaim-иться при ЛЮБОМ ts.
  //
  // Используем файловую БД во временном файле, чтобы открыть второй connection
  // и вставить processing-строку с processing_since = NULL через raw SQL
  // (минуя dequeue, который выставил бы processing_since = now).
  const Database = require('better-sqlite3');
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const tmpPath = path.join(os.tmpdir(), `queue-null-test-${process.pid}-${Date.now()}.db`);
  try {
    const store = createQueueStore({ dbPath: tmpPath, processingTtlSeconds: 300 });
    store.enqueue(makeEntry());

    // Второй connection в ту же файловую БД: помечаем строку processing с NULL.
    const rawDb = new Database(tmpPath);
    rawDb.prepare(
      "UPDATE delivery_queue SET status = 'processing', processing_since = NULL"
    ).run();
    rawDb.close();

    // При ts = СЕЙЧАС non-NULL fresh строка не была бы stale (now - 300 < now).
    // Но NULL-строка reclaim-ится при любом ts — это и есть суть NULL-ветки.
    const now = Math.floor(Date.now() / 1000);
    const reclaimed = store.reclaimStale(now);
    assert.equal(reclaimed, 1, 'NULL processing_since reclaimed even at current ts');

    const stats = store.stats();
    assert.equal(stats.processing, 0, 'row moved out of processing');
    assert.equal(stats.pending, 1, 'row returned to pending');
    store.close();
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(`${tmpPath}-wal`); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(`${tmpPath}-shm`); } catch (e) { /* ignore */ }
  }
});

test('dequeue reclaims stale rows before selecting pending', () => {
  const store = createQueueStore({ dbPath: ':memory:', processingTtlSeconds: 300 });
  const { id } = store.enqueue(makeEntry());
  store.dequeue(10); // → processing, processing_since = now

  // Симулируем, что прошёл час: вызываем reclaim с будущим ts,
  // при котором processing_since <= ts - ttl → строка stale.
  const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
  store.reclaimStale(oneHourLater);

  // Теперь dequeue должен снова взять ту же строку (она вернулась в pending).
  const batch = store.dequeue(10);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].id, id);
  assert.equal(batch[0].attempts, 0);
  store.close();
});
