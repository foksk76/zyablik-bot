const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const Database = require('better-sqlite3');
const { createQueueReader } = require('../../../src/queue-monitor/db/reader');
const { createMetricsRoutes } = require('../../../src/queue-monitor/api/metrics');

function tmpDb() {
  return path.join(os.tmpdir(), `metrics-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function initSchema(db) {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      req_id TEXT,
      processing_since INTEGER
    )
  `);
}

function seedRow(db, { status = 'pending', source = 'zabbix' }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ text: 'test', recipient: { value: 'user-1' } });
  db.prepare(`
    INSERT INTO delivery_queue (payload, source, status, attempts, next_retry_at, created_at, updated_at)
    VALUES (?, ?, ?, 0, 0, ?, ?)
  `).run(payload, source, status, now, now);
}

test('createMetricsRoutes throws when reader is missing', () => {
  assert.throws(
    () => createMetricsRoutes({}),
    /reader is required/
  );
});

test('summary returns 200 with queue counts', () => {
  const dbPath = tmpDb();
  const db = new Database(dbPath);
  initSchema(db);
  seedRow(db, { status: 'delivered' });
  seedRow(db, { status: 'failed' });
  seedRow(db, { status: 'pending' });
  db.close();

  const reader = createQueueReader({ dbPath });
  const routes = createMetricsRoutes({ reader });

  const result = routes.summary({});

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'ok');
  assert.equal(result.body.delivered, 1);
  assert.equal(result.body.failed, 1);
  assert.equal(result.body.pending, 1);
  assert.equal(result.body.total, 3);

  reader.close();
  fs.unlinkSync(dbPath);
});

test('summary returns zero counts for empty DB', () => {
  const dbPath = tmpDb();
  const db = new Database(dbPath);
  initSchema(db);
  db.close();

  const reader = createQueueReader({ dbPath });
  const routes = createMetricsRoutes({ reader });

  const result = routes.summary({});

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.total, 0);
  assert.equal(result.body.pending, 0);

  reader.close();
  fs.unlinkSync(dbPath);
});

test('discovery returns LLD format with all metrics', () => {
  const dbPath = tmpDb();
  const db = new Database(dbPath);
  initSchema(db);
  db.close();

  const reader = createQueueReader({ dbPath });
  const routes = createMetricsRoutes({ reader });

  const result = routes.discovery({});

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'ok');
  assert.ok(Array.isArray(result.body.data));
  assert.equal(result.body.data.length, 6);

  const metrics = result.body.data.map((item) => item['{#METRIC}']);
  assert.ok(metrics.includes('queue.pending'));
  assert.ok(metrics.includes('queue.processing'));
  assert.ok(metrics.includes('queue.delivered'));
  assert.ok(metrics.includes('queue.failed'));
  assert.ok(metrics.includes('queue.total'));
  assert.ok(metrics.includes('queue.totalAttempts'));

  reader.close();
  fs.unlinkSync(dbPath);
});
