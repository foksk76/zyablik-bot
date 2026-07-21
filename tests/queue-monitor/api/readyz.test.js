const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const Database = require('better-sqlite3');
const { createQueueReader } = require('../../../src/queue-monitor/db/reader');
const { createReadyzRoute } = require('../../../src/queue-monitor/api/readyz');

function tmpDb() {
  return path.join(os.tmpdir(), `readyz-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

test('createReadyzRoute throws when reader is missing', () => {
  assert.throws(
    () => createReadyzRoute({}),
    /reader is required/
  );
});

test('readyz returns 200 when DB is accessible', () => {
  const dbPath = tmpDb();
  const db = new Database(dbPath);
  initSchema(db);
  db.close();

  const reader = createQueueReader({ dbPath });
  const route = createReadyzRoute({ reader });

  const result = route.readyz({});

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'ok');

  reader.close();
  fs.unlinkSync(dbPath);
});

test('readyz returns 503 when DB is not accessible', () => {
  const reader = createQueueReader({ dbPath: '/tmp/nonexistent-readyz-test.db' });
  const route = createReadyzRoute({ reader });

  const result = route.readyz({});

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.status, 'error');
  assert.equal(result.body.error, 'Database not ready');
});
