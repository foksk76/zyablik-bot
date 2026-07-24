// SPDX-License-Identifier: Apache-2.0
'use strict';

const MODULE_NAME = 'queue-reader';

function createQueueReader(options = {}) {
    const dbPath = options.dbPath;
    const logger = options.logger || null;

    if (!dbPath) {
        throw new Error('dbPath is required');
    }

    const Database = require('better-sqlite3');
    let db;
    let pingStmt;

    try {
        db = new Database(dbPath, { readonly: true });
        pingStmt = db.prepare('SELECT 1 as ok');
    } catch (error) {
        // WAL выставляется writer-ом (src/bot-platform/queue/store.js); на readonly
        // подключении journal_mode = WAL бросает SQLITE_READONLY, поэтому здесь прагму
        // не вызываем. Логируем ошибку — иначе /readyz молча держит 503 без причины.
        if (logger && typeof logger.error === 'function') {
            logger.error(`[${MODULE_NAME}] failed to open readonly queue DB`, {
                dbPath,
                error: error.message
            });
        }
        db = null;
        pingStmt = null;
    }

    // ADR-0041: dynamic SQL с clause interpolation — осознанный компромисс.
    // buildTimeFilter возвращает только захардкоженные SQL-фрагменты
    // (created_at >= ?, created_at >= ? AND created_at <= ?, 1=1),
    // параметры передаются через prepared statement params.
    // Токенизация SQL-инъекций невозможна, т.к. clause не зависит от user input.

    function buildTimeFilter(windowSeconds, from, to) {
        const now = Math.floor(Date.now() / 1000);

        if (from && to && from > 0 && to > from) {
            return { clause: 'created_at >= ? AND created_at <= ?', params: [from, to] };
        }

        if (windowSeconds && windowSeconds > 0) {
            return { clause: 'created_at >= ?', params: [now - windowSeconds] };
        }

        return { clause: '1=1', params: [] };
    }

    function summary(timeFilter) {
        const tf = timeFilter || { clause: '1=1', params: [] };
        const rows = db.prepare(`
            SELECT status, COUNT(*) as count, SUM(attempts) as total_attempts
            FROM delivery_queue
            WHERE ${tf.clause}
            GROUP BY status
        `).all(...tf.params);
        const result = { pending: 0, processing: 0, delivered: 0, failed: 0, totalAttempts: 0 };

        for (const row of rows) {
            if (row.status in result) {
                result[row.status] = row.count;
            }
            result.totalAttempts += row.total_attempts || 0;
        }

        result.total = result.pending + result.processing + result.delivered + result.failed;

        return result;
    }

    function timeseries(windowSeconds, timeFilter) {
        const tf = timeFilter || (windowSeconds ? (() => {
            const now = Math.floor(Date.now() / 1000);
            return { clause: 'created_at >= ?', params: [now - windowSeconds] };
        })() : { clause: '1=1', params: [] });

        const rows = db.prepare(`
            SELECT
                    (created_at / 3600) * 3600 as bucket,
                    status,
                    COUNT(*) as count
            FROM delivery_queue
            WHERE ${tf.clause}
            GROUP BY bucket, status
            ORDER BY bucket ASC
        `).all(...tf.params);

        return rows.map((row) => ({
            bucket: row.bucket,
            status: row.status,
            count: row.count
        }));
    }

    function topSource(limit, timeFilter) {
        const topLimit = limit || 5;
        const tf = timeFilter || { clause: '1=1', params: [] };
        return db.prepare(`
            SELECT source, COUNT(*) as count
            FROM delivery_queue
            WHERE source != '' AND ${tf.clause}
            GROUP BY source
            ORDER BY count DESC
            LIMIT ?
        `).all(...tf.params, topLimit);
    }

    function topRecipient(limit, timeFilter) {
        const topLimit = limit || 5;
        const tf = timeFilter || { clause: '1=1', params: [] };
        return db.prepare(`
            SELECT
                    json_extract(payload, '$.recipient.value') as recipient,
                    COUNT(*) as count
            FROM delivery_queue
            WHERE payload LIKE '%"recipient"%' AND ${tf.clause}
            GROUP BY recipient
            ORDER BY count DESC
            LIMIT ?
        `).all(...tf.params, topLimit);
    }

    function errors(limit, timeFilter) {
        const errorLimit = limit || 20;
        const tf = timeFilter || { clause: '1=1', params: [] };
        const rows = db.prepare(`
            SELECT id, req_id, source, payload, attempts, updated_at
            FROM delivery_queue
            WHERE status = 'failed' AND ${tf.clause}
            ORDER BY updated_at DESC
            LIMIT ?
        `).all(...tf.params, errorLimit);

        return rows.map((row) => ({
            id: row.id,
            reqId: row.req_id || null,
            source: row.source,
            payload: row.payload,
            attempts: row.attempts,
            updatedAt: row.updated_at
        }));
    }

    function ready() {
        if (!db) {
            return false;
        }

        try {
            pingStmt.get();
            return true;
        } catch (error) {
            // Симметрично с catch выше (DB-open): логируем, иначе /readyz молча
            // держит 503 без причины, когда БД деградирует в полёте.
            if (logger && typeof logger.error === 'function') {
                logger.error(`[${MODULE_NAME}] readiness ping failed`, {
                    error: error.message
                });
            }
            return false;
        }
    }

    function close() {
        if (db) {
            db.close();
        }
    }

    return {
        summary,
        timeseries,
        topSource,
        topRecipient,
        errors,
        ready,
        close,
        buildTimeFilter
    };
}

module.exports = {
    MODULE_NAME,
    createQueueReader
};
