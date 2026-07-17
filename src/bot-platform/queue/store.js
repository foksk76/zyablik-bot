'use strict';

const MODULE_NAME = 'queue-store';
const DEFAULT_DB_PATH = 'delivery-queue.db';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS delivery_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_retry_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
)
`;

function createQueueStore(options = {}) {
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const backoffBase = options.backoffBase || 2;
  const backoffMax = options.backoffMax || 300;
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  const stmts = {
    insert: db.prepare(`
        INSERT INTO delivery_queue (payload, source, status, created_at, updated_at)
        VALUES (?, ?, 'pending', ?, ?)
    `),
    selectPending: db.prepare(`
        SELECT id, payload, source, status, attempts, next_retry_at, created_at, updated_at
        FROM delivery_queue
        WHERE status = 'pending' AND next_retry_at <= ?
        ORDER BY id ASC
        LIMIT ?
    `),
    updateStatusProcessing: db.prepare(`
        UPDATE delivery_queue SET status = 'processing', updated_at = ? WHERE id = ?
    `),
    updateStatusDelivered: db.prepare(`
        UPDATE delivery_queue SET status = 'delivered', updated_at = ? WHERE id = ?
    `),
    nackPending: db.prepare(`
        UPDATE delivery_queue
        SET status = 'pending', attempts = ?, next_retry_at = ?, updated_at = ?
        WHERE id = ?
    `),
    nackFailed: db.prepare(`
        UPDATE delivery_queue
        SET status = 'failed', attempts = ?, updated_at = ?
        WHERE id = ?
    `),
    countByStatus: db.prepare(`
        SELECT status, COUNT(*) as count FROM delivery_queue GROUP BY status
    `)
  };

  function enqueue(entry) {
    const now = Math.floor(Date.now() / 1000);
    const payload = typeof entry.payload === 'string'
      ? entry.payload
      : JSON.stringify(entry.payload);
    const source = entry.source || '';

    const result = stmts.insert.run(payload, source, now, now);

    return { id: result.lastInsertRowid };
  }

  function dequeue(batchSize) {
    const now = Math.floor(Date.now() / 1000);
    const rows = stmts.selectPending.all(now, batchSize);

    for (const row of rows) {
      stmts.updateStatusProcessing.run(now, row.id);
    }

    return rows.map((row) => ({
      id: row.id,
      payload: JSON.parse(row.payload),
      source: row.source,
      status: 'processing',
      attempts: row.attempts,
      nextRetryAt: row.next_retry_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  function ack(id) {
    const now = Math.floor(Date.now() / 1000);
    stmts.updateStatusDelivered.run(now, id);
  }

  function nack(id, attempts, maxAttempts) {
    const now = Math.floor(Date.now() / 1000);

    if (attempts >= maxAttempts) {
      stmts.nackFailed.run(attempts, now, id);
    } else {
      const backoffSeconds = Math.min(
        Math.pow(backoffBase, attempts) * 60,
        backoffMax
      );
      const nextRetryAt = now + backoffSeconds;
      stmts.nackPending.run(attempts, nextRetryAt, now, id);
    }
  }

  function stats() {
    const rows = stmts.countByStatus.all();
    const result = { pending: 0, processing: 0, delivered: 0, failed: 0 };

    for (const row of rows) {
      if (row.status in result) {
        result[row.status] = row.count;
      }
    }

    return result;
  }

  function close() {
    db.close();
  }

  return {
    enqueue,
    dequeue,
    ack,
    nack,
    stats,
    close
  };
}

module.exports = {
  MODULE_NAME,
  DEFAULT_DB_PATH,
  createQueueStore
};
