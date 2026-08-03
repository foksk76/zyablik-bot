// SPDX-License-Identifier: Apache-2.0
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createConfigApi, createConfigMutationRateLimiter, computeConfigDiff, buildEffectiveSections, buildExportConfig, DEFAULT_MUTATION_MAX, DEFAULT_MUTATION_WINDOW_MS } = require('../../../src/queue-monitor/api/config');
const { CURRENT_VERSION } = require('../../../src/bot-platform/core/config-migrations');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'config-api-test-'));
}

function tmpConfig(contents) {
    const dir = tmpDir();
    const configPath = path.join(dir, 'zyablik.config.json');
    if (contents !== undefined) {
        fs.writeFileSync(configPath, JSON.stringify(contents, null, 2));
    }
    return { dir, configPath };
}

function mockReq(body, { limit = 1_000_000 } = {}) {
    const encoded = body === undefined ? Buffer.alloc(0) : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    let offset = 0;
    return {
        on(event, handler) {
            if (event === 'data') {
                if (encoded.length === 0) {
                    return;
                }
                const chunk = encoded.slice(offset, offset + Math.min(32, encoded.length - offset));
                offset += chunk.length;
                handler(chunk);
                if (offset < encoded.length) {
                    handler(encoded.slice(offset));
                    offset = encoded.length;
                }
                return;
            }
            if (event === 'end') {
                handler();
                return;
            }
            if (event === 'error') {
                // errors только при destroy — не эмитим.
                return;
            }
        },
        destroy() {}
    };
}

const minimalConfig = {
    version: CURRENT_VERSION,
    bot: { logLevel: 'info' },
    queue: { queueEnabled: true },
    ingress: { ingressEnabled: false },
    monitor: { monitorEnabled: true, monitorPort: 9000 },
    plugins: {}
};

function pluginFixture() {
    return {
        name: 'identity',
        configSchema: {
            syncMode: { type: 'enum', enum: ['auto', 'manual'], default: 'auto' },
            dryRun: { type: 'boolean', default: false }
        }
    };
}

// --- rate limiter ---

test('mutation rate limiter: max calls allowed within window', () => {
    const limiter = createConfigMutationRateLimiter({ max: 2, windowMs: 60_000 });
    assert.equal(limiter.tryAcquire().allowed, true);
    assert.equal(limiter.tryAcquire().allowed, true);
    const third = limiter.tryAcquire();
    assert.equal(third.allowed, false);
    assert.ok(third.waitMs > 0);
    assert.deepEqual(limiter.stats(), { mutations: 2, limit: 2, windowMs: 60_000 });
    limiter.reset();
    assert.deepEqual(limiter.stats(), { mutations: 0, limit: 2, windowMs: 60_000 });
});

test('mutation rate limiter: expired timestamps evicted', () => {
    let now = 1000;
    const limiter = createConfigMutationRateLimiter({ max: 2, windowMs: 100, now: () => now });
    assert.equal(limiter.tryAcquire().allowed, true);
    assert.equal(limiter.tryAcquire().allowed, true);
    now = 1101;
    assert.equal(limiter.tryAcquire().allowed, true);
});

test('mutation rate limiter: defaults exported', () => {
    assert.equal(DEFAULT_MUTATION_MAX, 10);
    assert.equal(DEFAULT_MUTATION_WINDOW_MS, 60_000);
    const limiter = createConfigMutationRateLimiter();
    assert.equal(limiter.stats().limit, 10);
});

// --- computeConfigDiff / buildEffectiveSections / buildExportConfig ---

test('computeConfigDiff: only changed fields reported', () => {
    const active = { version: 1, bot: { logLevel: 'info', httpProxy: null }, queue: { queueEnabled: true } };
    const staged = { version: 1, bot: { logLevel: 'debug', httpProxy: null }, queue: { queueEnabled: false } };
    const diff = computeConfigDiff(active, staged);
    assert.equal(diff.length, 2);
    assert.ok(diff.some((d) => d.section === 'bot' && d.key === 'logLevel' && d.old === 'info' && d.new === 'debug'));
    assert.ok(diff.some((d) => d.section === 'queue' && d.key === 'queueEnabled' && d.old === true && d.new === false));
});

test('buildEffectiveSections: secrets masked, defaults filled', () => {
    const fileConfig = {
        version: CURRENT_VERSION,
        bot: { maxBotToken: '$MAX_BOT_TOKEN', logLevel: 'warn' },
        monitor: { metricsApiKey: '' }
    };
    const result = buildEffectiveSections(fileConfig, true);
    assert.equal(result.version, CURRENT_VERSION);
    assert.equal(result.fileExists, true);
    assert.deepEqual(result.sections.bot.maxBotToken, { secret: true, set: true });
    assert.equal(result.sections.bot.logLevel, 'warn');
    assert.deepEqual(result.sections.monitor.metricsApiKey, { secret: true, set: false });
    // plugins секция переносится как есть
    assert.deepEqual(result.sections.plugins, {});
});

test('buildEffectiveSections: missing file returns defaults and fileExists=false', () => {
    const result = buildEffectiveSections(null, false);
    assert.equal(result.fileExists, false);
    assert.equal(result.sections.bot.maxBotToken.set, false);
});

test('buildExportConfig: returns file config with version fallback', () => {
    const dump = buildExportConfig(minimalConfig);
    assert.equal(dump.version, CURRENT_VERSION);
    const empty = buildExportConfig(null);
    assert.equal(empty.version, CURRENT_VERSION);
    assert.deepEqual(empty.bot, {});
});

// --- createConfigApi: GET /api/config ---

test('getConfig: masks secrets and returns defaults when no file', () => {
    const { dir, configPath } = tmpConfig(undefined);
    const api = createConfigApi({ environment: {}, configPath, plugins: [pluginFixture()] });
    const result = api.getConfig({});
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.status, 'ok');
    assert.equal(result.body.data.fileExists, false);
    assert.deepEqual(result.body.data.sections.bot.maxBotToken, { secret: true, set: false });
    fs.rmSync(dir, { recursive: true, force: true });
});

test('getConfig: file secrets shown only as status', () => {
    const { dir, configPath } = tmpConfig({
        version: CURRENT_VERSION,
        bot: { maxBotToken: '$MAX_BOT_TOKEN', logLevel: 'info' },
        monitor: { metricsApiKey: '$MAX_METRICS_API_KEY', monitorPort: 9000 }
    });
    const api = createConfigApi({ environment: { MAX_BOT_TOKEN: 'x', MAX_METRICS_API_KEY: 'y' }, configPath });
    const result = api.getConfig({});
    assert.equal(result.body.data.fileExists, true);
    assert.deepEqual(result.body.data.sections.bot.maxBotToken, { secret: true, set: true });
    assert.deepEqual(result.body.data.sections.monitor.metricsApiKey, { secret: true, set: true });
    // не-секреты — как в файле
    assert.equal(result.body.data.sections.bot.logLevel, 'info');
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- createConfigApi: GET /api/config/schema ---

test('getSchema: merged schema includes system and plugins', () => {
    const { dir, configPath } = tmpConfig(undefined);
    const api = createConfigApi({ environment: {}, configPath, plugins: [pluginFixture()] });
    const result = api.getSchema({});
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.version, CURRENT_VERSION);
    assert.ok(result.body.data.schema.bot);
    assert.ok(result.body.data.schema.queue);
    assert.ok(result.body.data.schema.plugins);
    assert.deepEqual(result.body.data.schema.plugins.identity.syncMode, { type: 'enum', enum: ['auto', 'manual'], default: 'auto' });
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- createConfigApi: status lifecycle ---

test('getStatus: idle by default', () => {
    const { dir, configPath } = tmpConfig(undefined);
    const api = createConfigApi({ environment: {}, configPath });
    const result = api.getStatus({});
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.state, 'idle');
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- PUT /api/config/stage ---

test('putStage: validates and stores staged config with diff', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath, plugins: [pluginFixture()] });
    const changed = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'debug' },
        queue: { queueEnabled: true },
        ingress: { ingressEnabled: false },
        monitor: { monitorEnabled: true, monitorPort: 9000 },
        plugins: { identity: { syncMode: 'manual' } }
    };
    const result = await api.putStage({ req: mockReq(changed) });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.status, 'ok');
    assert.equal(result.body.data.staged.bot.logLevel, 'debug');
    assert.ok(result.body.data.diff.length > 0);
    // staged записан на диск
    const stageResult = api.getStage({});
    assert.equal(stageResult.body.data.exists, true);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('putStage: rejects invalid body (non-object)', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    const result = await api.putStage({ req: mockReq('42') });
    assert.equal(result.statusCode, 400);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('putStage: rejects invalid field type', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    const bad = {
        version: CURRENT_VERSION,
        bot: { logLevel: 123 }
    };
    const result = await api.putStage({ req: mockReq(bad) });
    assert.equal(result.statusCode, 400);
    assert.ok(result.body.errors.length > 0);
    assert.ok(result.body.errors.some((e) => e.section === 'bot' && e.field === 'logLevel'));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('putStage: rejects literal secret in file', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    const bad = {
        version: CURRENT_VERSION,
        bot: { maxBotToken: 'literal-secret-value' }
    };
    const result = await api.putStage({ req: mockReq(bad) });
    assert.equal(result.statusCode, 400);
    assert.ok(result.body.errors.some((e) => e.field === 'maxBotToken' && /секрет/.test(e.reason)));
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- POST /api/config/apply ---

test('apply: 400 when no staged config', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    const result = await api.apply({});
    assert.equal(result.statusCode, 400);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('apply: writes active config, returns 202, single-flight', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    let restarted = 0;
    const api = createConfigApi({
        environment: {},
        configPath,
        restart: () => { restarted++; }
    });
    const changed = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'debug' },
        queue: { queueEnabled: true },
        ingress: { ingressEnabled: false },
        monitor: { monitorEnabled: true, monitorPort: 9000 },
        plugins: {}
    };
    await api.putStage({ req: mockReq(changed) });

    // первый apply — 202
    const result = await api.apply({});
    assert.equal(result.statusCode, 202);
    assert.equal(restarted, 1);
    // активный файл перезаписан
    const active = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(active.bot.logLevel, 'debug');

    const status = api.getStatus({});
    assert.equal(status.body.data.state, 'pending');
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- POST /api/config/rollback ---

test('rollback: 202 with restart, restores from manual', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    let restarted = 0;
    const api = createConfigApi({
        environment: {},
        configPath,
        restart: () => { restarted++; }
    });
    const changed = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'debug' },
        queue: { queueEnabled: true },
        ingress: { ingressEnabled: false },
        monitor: { monitorEnabled: true, monitorPort: 9000 },
        plugins: {}
    };
    // сначала apply: создаёт lkg (копия активного до записи нового)
    await api.putStage({ req: mockReq(changed) });
    const applied = await api.apply({});
    assert.equal(applied.statusCode, 202);
    // затем rollback: восстанавливает lkg
    const result = await api.rollback({});
    assert.equal(result.statusCode, 202);
    assert.equal(restarted, 2);
    const status = api.getStatus({});
    assert.equal(status.body.data.state, 'rolled_back');
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- GET /api/config/export ---

test('export: returns current active config', () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    const result = api.exportConfig({});
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.status, 'ok');
    assert.ok(result.headers['Content-Disposition']);
    assert.match(result.headers['Content-Disposition'], /zyablik\.config_/);
    assert.equal(result.body.data.version, CURRENT_VERSION);
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- POST /api/config/import ---

test('import: valid config becomes staged', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    const imported = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'info' },
        queue: { queueEnabled: true },
        ingress: { ingressEnabled: false },
        monitor: { monitorEnabled: true, monitorPort: 9000 },
        plugins: {}
    };
    const result = await api.importConfig({ req: mockReq(imported) });
    assert.equal(result.statusCode, 200);
    assert.equal(api.getStage({}).body.data.exists, true);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('import: rejects literal secret', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    const bad = {
        version: CURRENT_VERSION,
        bot: { maxBotToken: 'literal-secret' }
    };
    const result = await api.importConfig({ req: mockReq(bad) });
    assert.equal(result.statusCode, 400);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('import: rejects unknown plugin config field', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath, plugins: [pluginFixture()] });
    const bad = {
        version: CURRENT_VERSION,
        plugins: { identity: { syncMode: 'not-a-mode' } }
    };
    const result = await api.importConfig({ req: mockReq(bad) });
    assert.equal(result.statusCode, 400);
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- single-flight (409) ---

test('apply during in-progress mutation returns 409', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({
        environment: {},
        configPath,
        restart: () => {}
    });

    // «Зависший» import: тело никогда не приходит, мутация удерживается.
    const hangingReq = { on() {}, destroy() {} };
    let importPromise;
    try {
        importPromise = api.importConfig({ req: hangingReq });
        const applyResult = await api.apply({});
        assert.equal(applyResult.statusCode, 409);
        // Мутация освободится, когда readJsonBody отклонится — destroy() без
        // данных. Завершаем зависший промис принудительно.
    } finally {
        importPromise = null;
    }
    fs.rmSync(dir, { recursive: true, force: true });
});

test('rate limited mutations return 429 with Retry-After', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    let now = 1000;
    const api = createConfigApi({
        environment: {},
        configPath,
        restart: () => {},
        mutationRateLimitMax: 1,
        mutationRateLimitWindowMs: 60_000,
        rateLimiterNow: () => now
    });
    const changed = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'debug' },
        queue: { queueEnabled: true },
        ingress: { ingressEnabled: false },
        monitor: { monitorEnabled: true, monitorPort: 9000 },
        plugins: {}
    };
    await api.putStage({ req: mockReq(changed) });
    const first = await api.apply({});
    assert.equal(first.statusCode, 202);
    now += 5000;
    const second = await api.apply({});
    assert.equal(second.statusCode, 429);
    assert.ok(second.headers['Retry-After']);
    fs.rmSync(dir, { recursive: true, force: true });
});
