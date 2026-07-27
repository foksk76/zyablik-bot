// SPDX-License-Identifier: Apache-2.0
'use strict';

const MODULE_NAME = 'queue-monitor-archive-routes';

function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function createArchiveRoutes(options = {}) {
    const reader = options.reader;
    const queueStore = options.queueStore || null;

    if (!reader) {
        throw new Error('reader is required');
    }

    function messages(ctx) {
        const page = Math.max(1, parseInt(ctx.query.page, 10) || 1);
        const rawLimit = parseInt(ctx.query.limit, 10);
        const limit = Number.isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), 100);
        const status = ctx.query.status || undefined;
        const source = ctx.query.source || undefined;
        const search = ctx.query.search || undefined;
        const sort = ctx.query.sort || 'created_at:desc';

        let from = null;
        let to = null;
        if (ctx.query.from && ctx.query.to) {
            from = Number(ctx.query.from);
            to = Number(ctx.query.to);
            if (Number.isNaN(from) || Number.isNaN(to) || from <= 0 || to <= 0 || from >= to) {
                from = null;
                to = null;
            }
        }

        const result = reader.archiveMessages({ page, limit, status, source, search, from, to, sort });

        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: result.data,
                total: result.total,
                page: result.page,
                limit: result.limit,
                pages: result.pages
            }
        };
    }

    function messageById(ctx) {
        const id = parseInt(ctx.urlPath.split('/').pop(), 10);
        if (Number.isNaN(id) || id <= 0) {
            return {
                statusCode: 400,
                body: { error: 'Invalid message ID' }
            };
        }

        const msg = reader.archiveMessageById(id);
        if (!msg) {
            return {
                statusCode: 404,
                body: { error: 'Message not found' }
            };
        }

        return {
            statusCode: 200,
            body: { status: 'ok', data: msg }
        };
    }

    function retry(ctx) {
        if (!queueStore) {
            return {
                statusCode: 503,
                body: { error: 'Retry unavailable — queueStore not configured' }
            };
        }

        const id = parseInt(ctx.urlPath.split('/').pop(), 10);
        if (Number.isNaN(id) || id <= 0) {
            return {
                statusCode: 400,
                body: { error: 'Invalid message ID' }
            };
        }

        const msg = reader.archiveMessageById(id);
        if (!msg) {
            return {
                statusCode: 404,
                body: { error: 'Message not found' }
            };
        }

        let payload;
        try {
            payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
        } catch {
            return {
                statusCode: 400,
                body: { error: 'Invalid payload JSON' }
            };
        }

        if (!payload || !payload.recipient || !payload.recipient.kind || !payload.recipient.value || !payload.text) {
            return {
                statusCode: 400,
                body: { error: 'Invalid payload structure: recipient.kind, recipient.value, and text are required' }
            };
        }

        const MAX_API_TEXT_LIMIT = 4000;
        if (typeof payload.text === 'string' && payload.text.length > MAX_API_TEXT_LIMIT) {
            return {
                statusCode: 400,
                body: { error: `Text exceeds ${MAX_API_TEXT_LIMIT} character limit` }
            };
        }

        const newId = `retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const source = msg.source || '';

        try {
            queueStore.enqueue({
                payload: { kind: payload.kind || 'message', recipient: payload.recipient, text: payload.text, format: payload.format },
                source,
                reqId: newId
            });
        } catch (error) {
            return {
                statusCode: 500,
                body: { error: `Enqueue failed: ${error.message}` }
            };
        }

        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: { newId, originalId: id }
            }
        };
    }

    function exportArchive(ctx) {
        const format = ctx.query.format === 'json' ? 'json' : 'csv';

        const status = ctx.query.status || undefined;
        const source = ctx.query.source || undefined;
        const search = ctx.query.search || undefined;

        let from = null;
        let to = null;
        if (ctx.query.from && ctx.query.to) {
            from = Number(ctx.query.from);
            to = Number(ctx.query.to);
            if (Number.isNaN(from) || Number.isNaN(to) || from <= 0 || to <= 0 || from >= to) {
                from = null;
                to = null;
            }
        }

        const now = new Date();
        const ts = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}_${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;

        const res = ctx.res;

        try {
            if (format === 'json') {
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Content-Disposition': `attachment; filename="archive_${ts}.json"`
                });

                res.write('{"data":[');
                let first = true;
                for (const batch of reader.archiveMessagesBatch({ status, source, search, from, to })) {
                    for (const row of batch) {
                        if (!first) res.write(',');
                        res.write(JSON.stringify(row));
                        first = false;
                    }
                }
                res.write(']}');
            } else {
                res.writeHead(200, {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="archive_${ts}.csv"`
                });

                res.write('id,reqId,source,status,attempts,createdAt,updatedAt,payload\n');
                for (const batch of reader.archiveMessagesBatch({ status, source, search, from, to })) {
                    for (const row of batch) {
                        const line = [
                            row.id,
                            csvEscape(row.reqId || ''),
                            csvEscape(row.source || ''),
                            row.status,
                            row.attempts,
                            row.createdAt,
                            row.updatedAt,
                            csvEscape(typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload))
                        ].join(',');
                        res.write(line + '\n');
                    }
                }
            }
        } catch (error) {
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Export failed' }));
            }
        } finally {
            if (!res.writableEnded) {
                res.end();
            }
        }
    }

    return {
        messages,
        messageById,
        retry,
        exportArchive
    };
}

module.exports = {
    MODULE_NAME,
    createArchiveRoutes
};
