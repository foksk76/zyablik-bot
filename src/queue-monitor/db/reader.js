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
    let stmts;

    try {
        db = new Database(dbPath, { readonly: true });
        stmts = prepareStatements(db);
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
        stmts = null;
    }

    function prepareStatements(database) {
        return {
            summary: database.prepare(`
                    SELECT status, COUNT(*) as count, SUM(attempts) as total_attempts
                    FROM delivery_queue
                    GROUP BY status
            `),
            timeseries: database.prepare(`
                    SELECT
                            (created_at / 3600) * 3600 as bucket,
                            status,
                            COUNT(*) as count
                    FROM delivery_queue
                    WHERE created_at >= ?
                    GROUP BY bucket, status
                    ORDER BY bucket ASC
            `),
            topSource: database.prepare(`
                    SELECT source, COUNT(*) as count
                    FROM delivery_queue
                    WHERE source != ''
                    GROUP BY source
                    ORDER BY count DESC
                    LIMIT ?
            `),
            topRecipient: database.prepare(`
                    SELECT
                            json_extract(payload, '$.recipient.value') as recipient,
                            COUNT(*) as count
                    FROM delivery_queue
                    WHERE payload LIKE '%"recipient"%'
                    GROUP BY recipient
                    ORDER BY count DESC
                    LIMIT ?
            `),
            errors: database.prepare(`
                    SELECT id, req_id, source, payload, attempts, updated_at
                    FROM delivery_queue
                    WHERE status = 'failed'
                    ORDER BY updated_at DESC
                    LIMIT ?
            `),
            ping: database.prepare('SELECT 1 as ok')
        };
    }

    function summary() {
        const rows = stmts.summary.all();
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

    function timeseries(windowSeconds) {
        const now = Math.floor(Date.now() / 1000);
        const since = windowSeconds ? now - windowSeconds : 0;
        const rows = stmts.timeseries.all(since);

        return rows.map((row) => ({
            bucket: row.bucket,
            status: row.status,
            count: row.count
        }));
    }

    function topSource(limit) {
        const topLimit = limit || 5;
        return stmts.topSource.all(topLimit);
    }

    function topRecipient(limit) {
        const topLimit = limit || 5;
        return stmts.topRecipient.all(topLimit);
    }

    function errors(limit) {
        const errorLimit = limit || 20;
        const rows = stmts.errors.all(errorLimit);

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
            stmts.ping.get();
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
        close
    };
}

module.exports = {
    MODULE_NAME,
    createQueueReader
};
