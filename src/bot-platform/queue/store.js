// SPDX-License-Identifier: Apache-2.0
'use strict';

const { formatLogLine } = require('../core/logger');

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

const MIGRATION_SQL = [
  'ALTER TABLE delivery_queue ADD COLUMN req_id TEXT',
  'CREATE INDEX IF NOT EXISTS idx_queue_req_id ON delivery_queue(req_id)',
  // ADR-0033: метка времени взятия строки в обработку для reclaim
  // stale processing-строк после краша процесса.
  'ALTER TABLE delivery_queue ADD COLUMN processing_since INTEGER',
  // ADR-0028:59 специфицирует composite index для selectPending
  // (WHERE status='pending' AND next_retry_at <= ? ORDER BY id ASC).
  // `IF NOT EXISTS` делает миграцию идемпотентной.
  'CREATE INDEX IF NOT EXISTS idx_queue_pending ON delivery_queue(status, next_retry_at)'
];

const DEFAULT_PROCESSING_TTL_SECONDS = 300;

function createQueueStore(options = {}) {
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  // Числовые опции: `!= null` вместо `||`, иначе значение 0 молча подменялось
  // дефолтом (falsy). Config валидирует min/max для env, но программные
  // вызывающие стороны (тесты, embed) могут передать 0 осознанно.
  const backoffBase = options.backoffBase != null ? options.backoffBase : 2;
  const backoffMax = options.backoffMax != null ? options.backoffMax : 300;
  // Сколько секунд строка может быть в status='processing' до reclaim.
  // Покрывает типичный send + MAX API timeout (90с по умолчанию в live-service)
  // с запасом. См. ADR-0033.
  const processingTtlSeconds = options.processingTtlSeconds != null
    ? options.processingTtlSeconds
    : DEFAULT_PROCESSING_TTL_SECONDS;
  const logger = options.logger || null;
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  for (const sql of MIGRATION_SQL) {
    try {
      db.exec(sql);
    } catch (error) {
      if (!/duplicate column|already exists/i.test(error.message)) {
        throw error;
      }
    }
  }

  const stmts = {
    insert: db.prepare(`
        INSERT INTO delivery_queue (payload, source, status, req_id, created_at, updated_at)
        VALUES (?, ?, 'pending', ?, ?, ?)
    `),
    selectPending: db.prepare(`
        SELECT id, payload, source, status, attempts, next_retry_at, req_id, created_at, updated_at
        FROM delivery_queue
        WHERE status = 'pending' AND next_retry_at <= ?
        ORDER BY id ASC
        LIMIT ?
    `),
    updateStatusProcessing: db.prepare(`
        UPDATE delivery_queue
        SET status = 'processing', processing_since = ?, updated_at = ?
        WHERE id = ?
    `),
    updateStatusDelivered: db.prepare(`
        UPDATE delivery_queue SET status = 'delivered', updated_at = ? WHERE id = ?
    `),
    // ADR-0033: reclaim строк, зависших в 'processing' после краша процесса.
    // NULL трактуется как stale — покрывает строки от старого кода до миграции
    // (они гарантированно stalled, т.к. текущий код всегда ставит processing_since).
    reclaimStaleProcessing: db.prepare(`
        UPDATE delivery_queue
        SET status = 'pending', processing_since = NULL, updated_at = ?
        WHERE status = 'processing'
          AND (processing_since IS NULL OR processing_since <= ?)
    `),
    nackPending: db.prepare(`
        UPDATE delivery_queue
        SET status = 'pending', processing_since = NULL,
            attempts = ?, next_retry_at = ?, updated_at = ?
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
    const reqId = entry.reqId || null;

    const result = stmts.insert.run(payload, source, reqId, now, now);
    const id = result.lastInsertRowid;

    if (logger && reqId) {
      logger.info(formatLogLine({
        level: 'info',
        module: MODULE_NAME,
        reqId,
        action: 'enqueued',
        context: { id }
      }));
    }

    return { id };
  }

  // ADR-0033: вернуть зависшие 'processing' строки в 'pending'.
  // Вызывается в начале каждого dequeue-цикла (crash recovery между итерациями)
  // и может вызываться явно при старте процесса. Не инкрементирует attempts —
  // reclaim трактуется как crash-recovery (at-least-once), а не failed-delivery.
  function reclaimStale(now) {
    const ts = now != null ? now : Math.floor(Date.now() / 1000);
    return stmts.reclaimStaleProcessing.run(ts, ts - processingTtlSeconds).changes;
  }

  function dequeue(batchSize) {
    const now = Math.floor(Date.now() / 1000);
    reclaimStale(now);

    const rows = stmts.selectPending.all(now, batchSize);

    for (const row of rows) {
      stmts.updateStatusProcessing.run(now, now, row.id);
    }

    return rows.map((row) => ({
      id: row.id,
      payload: JSON.parse(row.payload),
      source: row.source,
      status: 'processing',
      attempts: row.attempts,
      nextRetryAt: row.next_retry_at,
      reqId: row.req_id || null,
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
    reclaimStale,
    ack,
    nack,
    stats,
    close
  };
}

module.exports = {
  MODULE_NAME,
  DEFAULT_DB_PATH,
  DEFAULT_PROCESSING_TTL_SECONDS,
  createQueueStore
};
