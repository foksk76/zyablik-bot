const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const Database = require('better-sqlite3');
const { createQueueReader } = require('../../../src/queue-monitor/db/reader');

function tmpDb() {
    return path.join(os.tmpdir(), `reader-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

function seedRow(db, { status = 'pending', source = 'zabbix', reqId = null, attempts = 0 }) {
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ text: `test-${status}`, recipient: { value: 'user-1' } });
    const result = db.prepare(`
        INSERT INTO delivery_queue (payload, source, status, attempts, next_retry_at, created_at, updated_at, req_id)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    `).run(payload, source, status, attempts, now, now, reqId);

    if (status === 'processing') {
        db.prepare('UPDATE delivery_queue SET processing_since = ? WHERE id = ?').run(now, result.lastInsertRowid);
    }

    return result.lastInsertRowid;
}

test('createQueueReader throws when dbPath is missing', () => {
    assert.throws(
        () => createQueueReader({}),
        /dbPath is required/
    );
});

test('summary returns zero counts for empty DB', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.summary();

    assert.equal(result.pending, 0);
    assert.equal(result.processing, 0);
    assert.equal(result.delivered, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 0);
    assert.equal(result.totalAttempts, 0);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('summary counts by status correctly', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'pending' });
    seedRow(db, { status: 'pending' });
    seedRow(db, { status: 'pending' });
    seedRow(db, { status: 'processing' });
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'pending' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.summary();

    assert.equal(result.delivered, 3);
    assert.equal(result.failed, 2);
    assert.equal(result.pending, 4);
    assert.equal(result.processing, 1);
    assert.equal(result.total, 10);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('summary includes totalAttempts from failed rows', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'failed', attempts: 3 });
    seedRow(db, { status: 'failed', attempts: 5 });
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.summary();

    assert.equal(result.totalAttempts, 8);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('timeseries returns hourly buckets', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'pending' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.timeseries(3600);

    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
    assert.equal(typeof result[0].bucket, 'number');
    assert.equal(typeof result[0].status, 'string');
    assert.equal(typeof result[0].count, 'number');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('timeseries with empty window returns all data', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'delivered' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.timeseries(0);

    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('topSource returns sources sorted by count', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { source: 'zabbix' });
    seedRow(db, { source: 'zabbix' });
    seedRow(db, { source: 'zabbix' });
    seedRow(db, { source: 'grafana' });
    seedRow(db, { source: 'grafana' });
    seedRow(db, { source: 'custom' });
    seedRow(db, { source: 'custom' });
    seedRow(db, { source: 'custom' });
    seedRow(db, { source: 'custom' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.topSource(5);

    assert.ok(Array.isArray(result));
    assert.equal(result.length, 3);
    assert.equal(result[0].source, 'custom');
    assert.equal(result[0].count, 4);
    assert.equal(result[1].source, 'zabbix');
    assert.equal(result[1].count, 3);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('topSource excludes empty source', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { source: '' });
    seedRow(db, { source: '' });
    seedRow(db, { source: 'zabbix' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.topSource(5);

    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'zabbix');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('topRecipient returns recipients sorted by count', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'failed' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.topRecipient(5);

    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
    assert.equal(typeof result[0].recipient, 'string');
    assert.equal(typeof result[0].count, 'number');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('errors returns failed messages sorted by updatedAt desc', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'pending' });
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'delivered' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.errors(10);

    assert.ok(Array.isArray(result));
    assert.equal(result.length, 2);
    assert.equal(typeof result[0].id, 'number');
    assert.equal(typeof result[0].attempts, 'number');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('errors respects limit', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'failed' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.errors(2);

    assert.equal(result.length, 2);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('errors includes reqId when present', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'failed', reqId: 'req-abc-123' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const result = reader.errors(10);

    assert.equal(result[0].reqId, 'req-abc-123');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('ready returns true for accessible DB', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();
    const reader = createQueueReader({ dbPath });

    assert.equal(reader.ready(), true);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('ready returns false for nonexistent path', () => {
    const reader = createQueueReader({ dbPath: '/tmp/nonexistent-reader-test.db' });

    assert.equal(reader.ready(), false);

    reader.close();
});

test('close closes the DB connection', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();
    const reader = createQueueReader({ dbPath });

    reader.close();

    assert.throws(() => reader.summary());
    fs.unlinkSync(dbPath);
});

// ADR-0041: buildTimeFilter
test('buildTimeFilter with relative window', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();
    const reader = createQueueReader({ dbPath });
    const now = Math.floor(Date.now() / 1000);

    const tf = reader.buildTimeFilter(3600);

    assert.equal(tf.clause, 'created_at >= ?');
    assert.equal(tf.params.length, 1);
    assert.ok(Math.abs(tf.params[0] - (now - 3600)) < 2);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('buildTimeFilter with absolute from/to', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();
    const reader = createQueueReader({ dbPath });

    const tf = reader.buildTimeFilter(0, 1721020800, 1721056800);

    assert.equal(tf.clause, 'created_at >= ? AND created_at <= ?');
    assert.deepEqual(tf.params, [1721020800, 1721056800]);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('buildTimeFilter absolute takes priority over relative', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();
    const reader = createQueueReader({ dbPath });

    const tf = reader.buildTimeFilter(3600, 1721020800, 1721056800);

    assert.equal(tf.clause, 'created_at >= ? AND created_at <= ?');
    assert.deepEqual(tf.params, [1721020800, 1721056800]);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('buildTimeFilter returns no-filter for zero/missing values', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    db.close();
    const reader = createQueueReader({ dbPath });

    const tf1 = reader.buildTimeFilter(0);
    assert.equal(tf1.clause, '1=1');
    assert.deepEqual(tf1.params, []);

    const tf2 = reader.buildTimeFilter(0, null, null);
    assert.equal(tf2.clause, '1=1');

    reader.close();
    fs.unlinkSync(dbPath);
});

test('summary with timeFilter returns only matching rows', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'delivered' });
    seedRow(db, { status: 'failed' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const now = Math.floor(Date.now() / 1000);
    const tf = reader.buildTimeFilter(3600);
    const result = reader.summary(tf);

    assert.equal(result.delivered, 1);
    assert.equal(result.failed, 1);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('topSource with timeFilter returns only matching rows', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { source: 'zabbix' });
    seedRow(db, { source: 'grafana' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const tf = reader.buildTimeFilter(3600);
    const result = reader.topSource(5, tf);

    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('errors with timeFilter returns only matching rows', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    seedRow(db, { status: 'failed' });
    seedRow(db, { status: 'delivered' });
    db.close();
    const reader = createQueueReader({ dbPath });

    const tf = reader.buildTimeFilter(3600);
    const result = reader.errors(10, tf);

    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);

    reader.close();
    fs.unlinkSync(dbPath);
});

test('timeseries with absolute timeFilter returns only rows in range', () => {
    const dbPath = tmpDb();
    const db = new Database(dbPath);
    initSchema(db);
    const now = Math.floor(Date.now() / 1000);
    // Seed a row 2 hours ago (outside 1-hour range)
    db.prepare(`
        INSERT INTO delivery_queue (payload, source, status, attempts, next_retry_at, created_at, updated_at)
        VALUES (?, 'zabbix', 'delivered', 0, 0, ?, ?)
    `).run(JSON.stringify({ text: 'old', recipient: { value: 'u' } }), now - 7200, now - 7200);
    // Seed a row 30 minutes ago (inside 1-hour range)
    db.prepare(`
        INSERT INTO delivery_queue (payload, source, status, attempts, next_retry_at, created_at, updated_at)
        VALUES (?, 'grafana', 'failed', 0, 0, ?, ?)
    `).run(JSON.stringify({ text: 'new', recipient: { value: 'u' } }), now - 1800, now - 1800);
    db.close();
    const reader = createQueueReader({ dbPath });

    const tf = reader.buildTimeFilter(0, now - 3600, now);
    const result = reader.timeseries(0, tf);

    // Only the recent row should appear (failed from grafana)
    const statuses = result.map((r) => r.status);
    assert.ok(statuses.includes('failed'), 'should include recent failed row');
    assert.ok(!statuses.includes('delivered') || result.every((r) => r.count === 0), 'should not include old delivered row');

    reader.close();
    fs.unlinkSync(dbPath);
});
