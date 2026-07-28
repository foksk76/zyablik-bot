const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const Database = require('better-sqlite3');
const { createQueueReader } = require('../../../src/queue-monitor/db/reader');
const { createArchiveRoutes } = require('../../../src/queue-monitor/api/archive-routes');

function tmpDb() {
    return path.join(os.tmpdir(), `archive-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

function seedRow(db, { status = 'pending', source = 'zabbix', text = 'test message', reqId = null }) {
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ text, recipient: { kind: 'chat', value: 'chat-123' } });
    db.prepare(`
        INSERT INTO delivery_queue (payload, source, status, attempts, next_retry_at, created_at, updated_at, req_id)
        VALUES (?, ?, ?, 1, 0, ?, ?, ?)
    `).run(payload, source, status, now, now, reqId);
}

function mockRes() {
    const chunks = [];
    return {
        headers: null,
        statusCode: null,
        headersSent: false,
        writableEnded: false,
        writeHead(code, headers) {
            this.statusCode = code;
            this.headers = headers;
            this.headersSent = true;
        },
        write(chunk) {
            chunks.push(chunk);
        },
        end() { this.writableEnded = true; },
        getOutput() { return chunks.join(''); }
    };
}

// --- messages ---

test('messages returns paginated results', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    for (let i = 0; i < 5; i++) seedRow(db, { status: 'delivered' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const result = routes.messages({ query: { page: '1', limit: '2' } });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.length, 2);
    assert.equal(result.body.total, 5);
    assert.equal(result.body.pages, 3);
    assert.equal(result.body.page, 1);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('messages filters by status', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'delivered' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const result = routes.messages({ query: { status: 'failed' } });

    assert.equal(result.body.data.length, 1);
    assert.equal(result.body.data[0].status, 'failed');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('messages filters by source', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { source: 'zabbix' });
    seedRow(db, { source: 'ingest' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const result = routes.messages({ query: { source: 'zabbix' } });

    assert.equal(result.body.data.length, 1);
    assert.equal(result.body.data[0].source, 'zabbix');

    reader.close();
    fs.unlinkSync(dbPath);
});

// --- messageById ---

test('messageById returns 404 for missing message', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const result = routes.messageById({ urlPath: '/api/archive/messages/999', query: {} });

    assert.equal(result.statusCode, 404);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('messageById returns 400 for invalid ID', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const result = routes.messageById({ urlPath: '/api/archive/messages/abc', query: {} });

    assert.equal(result.statusCode, 400);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('messageById returns message when found', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { reqId: 'req-1' });
    const id = db.prepare('SELECT id FROM delivery_queue LIMIT 1').get().id;
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const result = routes.messageById({ urlPath: `/api/archive/messages/${id}`, query: {} });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.id, id);
    assert.equal(result.body.data.reqId, 'req-1');

    reader.close();
    fs.unlinkSync(dbPath);
});

// --- retry ---

test('retry returns 503 when queueStore not configured', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const result = routes.retry({ urlPath: '/api/archive/retry/1', query: {} });

    assert.equal(result.statusCode, 503);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('retry returns 404 when message not found', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const mockQueueStore = { enqueue: () => ({ id: 1 }) };
    const routes = createArchiveRoutes({ reader, queueStore: mockQueueStore });
    const result = routes.retry({ urlPath: '/api/archive/retry/999', query: {} });

    assert.equal(result.statusCode, 404);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('retry returns 400 for invalid payload structure', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.prepare(`
        INSERT INTO delivery_queue (payload, source, status, attempts, next_retry_at, created_at, updated_at)
        VALUES (?, 'zabbix', 'failed', 1, 0, ?, ?)
    `).run(JSON.stringify({ text: 'hi' }), Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));
    const id = db.prepare('SELECT id FROM delivery_queue LIMIT 1').get().id;
    db.close();

    const reader = createQueueReader({ dbPath });
    const mockQueueStore = { enqueue: () => ({ id: 1 }) };
    const routes = createArchiveRoutes({ reader, queueStore: mockQueueStore });
    const result = routes.retry({ urlPath: `/api/archive/retry/${id}`, query: {} });

    assert.equal(result.statusCode, 400);
    assert.ok(result.body.error.includes('recipient'));

    reader.close();
    fs.unlinkSync(dbPath);
});

test('retry enqueues new message and returns 200', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    const payload = JSON.stringify({ text: 'hello', recipient: { kind: 'chat', value: 'chat-42' } });
    db.prepare(`
        INSERT INTO delivery_queue (payload, source, status, attempts, next_retry_at, created_at, updated_at)
        VALUES (?, 'zabbix', 'delivered', 2, 0, ?, ?)
    `).run(payload, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));
    const id = db.prepare('SELECT id FROM delivery_queue LIMIT 1').get().id;
    db.close();

    const reader = createQueueReader({ dbPath });
    let enqueued = null;
    const mockQueueStore = { enqueue: (entry) => { enqueued = entry; return { id: 99 }; } };
    const routes = createArchiveRoutes({ reader, queueStore: mockQueueStore });
    const result = routes.retry({ urlPath: `/api/archive/retry/${id}`, query: {} });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.status, 'ok');
    assert.equal(result.body.data.originalId, id);
    assert.ok(result.body.data.newId);
    assert.equal(enqueued.source, 'zabbix');
    assert.equal(enqueued.payload.text, 'hello');
    assert.equal(enqueued.payload.recipient.value, 'chat-42');

    reader.close();
    fs.unlinkSync(dbPath);
});

// --- exportArchive ---

test('exportArchive returns CSV with headers', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered', source: 'zabbix' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const res = mockRes();
    routes.exportArchive({ query: { format: 'csv' }, res });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'text/csv');
    assert.ok(res.headers['Content-Disposition'].includes('.csv'));
    const output = res.getOutput();
    assert.ok(output.startsWith('id,reqId,source,status'));

    reader.close();
    fs.unlinkSync(dbPath);
});

test('exportArchive returns JSON with data array', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'failed' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const res = mockRes();
    routes.exportArchive({ query: { format: 'json' }, res });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'application/json');
    const output = res.getOutput();
    const parsed = JSON.parse(output);
    assert.ok(Array.isArray(parsed.data));
    assert.equal(parsed.data.length, 1);
    assert.equal(parsed.data[0].status, 'failed');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('exportArchive filters by status', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'failed' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const res = mockRes();
    routes.exportArchive({ query: { format: 'json', status: 'failed' }, res });

    const parsed = JSON.parse(res.getOutput());
    assert.equal(parsed.data.length, 1);
    assert.equal(parsed.data[0].status, 'failed');

    reader.close();
    fs.unlinkSync(dbPath);
});

// --- export error paths ---

test('exportArchive catches reader error and ends response', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const originalBatch = reader.archiveMessagesBatch;
    reader.archiveMessagesBatch = function* () {
        throw new Error('DB read failure');
    };
    const routes = createArchiveRoutes({ reader });
    const res = mockRes();
    routes.exportArchive({ query: { format: 'csv' }, res });

    // writeHead(200) is called before iteration, so headersSent is true.
    // The catch block sees headersSent=true and skips the 500 response.
    assert.equal(res.statusCode, 200);
    assert.ok(res.headersSent, 'headers were sent before error');
    assert.ok(res.writableEnded, 'res.end() was called in finally block');

    reader.archiveMessagesBatch = originalBatch;
    reader.close();
    fs.unlinkSync(dbPath);
});

test('exportArchive ends response after reader error (JSON)', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const originalBatch = reader.archiveMessagesBatch;
    reader.archiveMessagesBatch = function* () {
        throw new Error('stream error');
    };
    const routes = createArchiveRoutes({ reader });
    const res = mockRes();
    routes.exportArchive({ query: { format: 'json' }, res });

    assert.ok(res.writableEnded, 'res.end() was called in finally block');

    reader.archiveMessagesBatch = originalBatch;
    reader.close();
    fs.unlinkSync(dbPath);
});

test('exportArchive JSON with empty dataset returns empty data array', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const res = mockRes();
    routes.exportArchive({ query: { format: 'json' }, res });

    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(res.getOutput());
    assert.ok(Array.isArray(parsed.data));
    assert.equal(parsed.data.length, 0);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('exportArchive CSV escapes payload with commas and newlines', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ text: 'line1\nline2,with,commas', recipient: { value: 'u' } });
    db.prepare(`
        INSERT INTO delivery_queue (payload, source, status, attempts, next_retry_at, created_at, updated_at)
        VALUES (?, 'zabbix', 'delivered', 0, 0, ?, ?)
    `).run(payload, now, now);
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createArchiveRoutes({ reader });
    const res = mockRes();
    routes.exportArchive({ query: { format: 'csv' }, res });

    assert.equal(res.statusCode, 200);
    const output = res.getOutput();
    const lines = output.trim().split('\n');
    // First line is header, second line is data
    assert.equal(lines.length, 2, 'CSV has header + 1 data row');
    // The payload column (last) should be double-quoted because it contains commas/newlines
    const lastCommaIdx = lines[1].lastIndexOf(',');
    const payloadCol = lines[1].slice(lastCommaIdx + 1);
    assert.ok(payloadCol.startsWith('"'), 'payload column is quoted');
    assert.ok(payloadCol.endsWith('"'), 'payload column ends with quote');

    reader.close();
    fs.unlinkSync(dbPath);
});
