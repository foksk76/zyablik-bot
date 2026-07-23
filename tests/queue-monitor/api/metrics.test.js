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

test('timeseries returns 200 with bucket data', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'failed' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createMetricsRoutes({ reader });

    const result = routes.timeseries({ query: { window: '3600' } });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.status, 'ok');
    assert.equal(result.body.window, 3600);
    assert.ok(Array.isArray(result.body.data));

    reader.close();
    fs.unlinkSync(dbPath);
});

test('timeseries defaults to 0 (all data) when window is not specified', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createMetricsRoutes({ reader });

    const result = routes.timeseries({ query: {} });

    assert.equal(result.body.window, 0);

    reader.close();
    fs.unlinkSync(dbPath);
});

// ADR-0034: window задаётся как длительность (1h, 30m, 1d) или целое число секунд.
// Регрессия: parseInt('1h') молча возвращал 1 (1 секунду вместо 1 часа).
test('timeseries parses duration-format window (1h/30m/1d/2d/90s)', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createMetricsRoutes({ reader });

    const cases = [
        { input: '1h', expected: 3600 },
        { input: '30m', expected: 1800 },
        { input: '1d', expected: 86400 },
        { input: '2d', expected: 172800 },
        { input: '90s', expected: 90 },
        { input: '3600', expected: 3600 },
        { input: '1x', expected: 0 },
        { input: '-1', expected: 0 }
    ];

    for (const { input, expected } of cases) {
        const result = routes.timeseries({ query: { window: input } });
        assert.equal(result.body.window, expected, `window="${input}"`);
    }

    reader.close();
    fs.unlinkSync(dbPath);
});

test('top returns source data by default', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { source: 'zabbix' });
    seedRow(db, { source: 'zabbix' });
    seedRow(db, { source: 'grafana' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createMetricsRoutes({ reader });

    const result = routes.top({ query: {} });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.by, 'source');
    assert.equal(result.body.limit, 5);
    assert.ok(Array.isArray(result.body.data));
    assert.equal(result.body.data[0].source, 'zabbix');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('top returns recipient data when by=recipient', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'delivered' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createMetricsRoutes({ reader });

    const result = routes.top({ query: { by: 'recipient', limit: '10' } });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.by, 'recipient');
    assert.equal(result.body.limit, 10);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('errors returns 200 with failed messages', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'failed' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createMetricsRoutes({ reader });

    const result = routes.errors({ query: {} });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.status, 'ok');
    assert.equal(result.body.limit, 20);
    assert.equal(result.body.data.length, 2);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('errors respects limit query param', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'failed' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createMetricsRoutes({ reader });

    const result = routes.errors({ query: { limit: '1' } });

    assert.equal(result.body.limit, 1);
    assert.equal(result.body.data.length, 1);

    reader.close();
    fs.unlinkSync(dbPath);
});

// Регрессия security: parseInt('-1') === -1, Math.min(-1, 100) === -1.
// В SQLite LIMIT -1 означает «без ограничения», что пробивало MAX_LIMIT кап
// и позволяло вытащить все failed-записи (с payload) одним запросом.
// Также проверяем NaN и превышение капа — clamp в [MIN_LIMIT, MAX_LIMIT].
test('errors clamps negative limit to MIN_LIMIT (regression: SQLite LIMIT -1 = unlimited)', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'failed' });
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createMetricsRoutes({ reader });

    const result = routes.errors({ query: { limit: '-1' } });
    assert.equal(result.body.limit, 1, 'negative limit must clamp to MIN_LIMIT=1');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('errors clamps limit above MAX_LIMIT and accepts non-numeric as default', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createMetricsRoutes({ reader });

    assert.equal(routes.errors({ query: { limit: '99999' } }).body.limit, 100, 'over-cap clamps to MAX_LIMIT=100');
    assert.equal(routes.errors({ query: { limit: 'abc' } }).body.limit, 20, 'non-numeric falls back to default=20');
    assert.equal(routes.errors({ query: {} }).body.limit, 20, 'missing falls back to default=20');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('top clamps negative limit to MIN_LIMIT', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();

    const reader = createQueueReader({ dbPath });
    const routes = createMetricsRoutes({ reader });

    assert.equal(routes.top({ query: { limit: '-1' } }).body.limit, 1, 'negative clamps to MIN_LIMIT=1');
    assert.equal(routes.top({ query: { limit: '-1', by: 'recipient' } }).body.limit, 1, 'recipient path also clamps');

    reader.close();
    fs.unlinkSync(dbPath);
});
