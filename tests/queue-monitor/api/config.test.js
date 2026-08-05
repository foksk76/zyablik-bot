// SPDX-License-Identifier: Apache-2.0
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createConfigApi, createConfigMutationRateLimiter, computeConfigDiff, buildEffectiveSections, maskStagedSecrets, buildExportConfig, DEFAULT_MUTATION_MAX, DEFAULT_MUTATION_WINDOW_MS } = require('../../../src/queue-monitor/api/config');
const { CURRENT_VERSION } = require('../../../src/bot-platform/core/config-migrations');
const { writePending } = require('../../../src/bot-platform/core/config-store');

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
    const active = { version: 1, bot: { logLevel: 'info', httpProxy: null }, queue: { enabled: true } };
    const staged = { version: 1, bot: { logLevel: 'debug', httpProxy: null }, queue: { enabled: false } };
    const diff = computeConfigDiff(active, staged);
    assert.equal(diff.length, 2);
    assert.ok(diff.some((d) => d.section === 'bot' && d.key === 'logLevel' && d.old === 'info' && d.new === 'debug'));
    assert.ok(diff.some((d) => d.section === 'queue' && d.key === 'enabled' && d.old === true && d.new === false));
});

test('computeConfigDiff: секретные поля не попадают в diff', () => {
    const active = {
        version: 1,
        bot: { maxBotToken: '$MAX_BOT_TOKEN', logLevel: 'info' },
        monitor: { metricsApiKey: '$METRICS_API_KEY' }
    };
    const staged = {
        version: 1,
        bot: { maxBotToken: '$MAX_BOT_TOKEN', logLevel: 'debug' },
        monitor: { metricsApiKey: '' }
    };
    const diff = computeConfigDiff(active, staged);
    assert.ok(!diff.some((d) => d.key === 'maxBotToken'), 'maxBotToken не в diff');
    assert.ok(!diff.some((d) => d.key === 'metricsApiKey'), 'metricsApiKey не в diff');
    assert.equal(diff.length, 1, 'только несекретное изменение');
    assert.equal(diff[0].key, 'logLevel');
});

test('computeConfigDiff: секреты плагинов (plugins.<name>.*) не попадают в diff', () => {
    const plugins = [{ name: 'identity', configSchema: { apiToken: { type: 'string', secret: true }, syncMode: { type: 'enum', enum: ['auto', 'manual'] } } }];
    const active = { version: 1, plugins: { identity: { apiToken: '$ID_API_TOKEN', syncMode: 'auto' } } };
    const staged = { version: 1, plugins: { identity: { apiToken: '$ID_API_TOKEN', syncMode: 'manual' } } };
    const diff = computeConfigDiff(active, staged, plugins);
    // Формат строк совпадает с клиентским buildDiff: { section: pluginName, key }.
    assert.equal(diff.length, 1, 'только несекретное изменение плагина');
    assert.equal(diff[0].section, 'identity');
    assert.equal(diff[0].key, 'syncMode');
    assert.equal(diff[0].old, 'auto');
    assert.equal(diff[0].new, 'manual');
    assert.ok(!diff.some((d) => d.key === 'apiToken'), 'секретный под-ключ не в diff');
});

test('computeConfigDiff: изменение только секрета плагина → diff пуст', () => {
    const plugins = [{ name: 'identity', configSchema: { apiToken: { type: 'string', secret: true } } }];
    const active = { version: 1, plugins: { identity: { apiToken: '$ID_API_TOKEN' } } };
    const staged = { version: 1, plugins: { identity: { apiToken: '$NEW_TOKEN' } } };
    const diff = computeConfigDiff(active, staged, plugins);
    assert.equal(diff.length, 0, 'секрет меняется молча — только статус');
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
    // plugins секция переносится как есть (L3: Object.create(null) для
    // defense-in-depth от __proto__ — проверяем отсутствие ключей).
    assert.equal(Object.keys(result.sections.plugins).length, 0);
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

// Секреты плагинов в GET /api/config маскируются так же, как системные —
// даже $VAR-имя наружу не уходит (I4, buildEffectiveSections).
test('getConfig: plugin secrets masked as status, not as $VAR name', () => {
    const { dir, configPath } = tmpConfig({
        version: CURRENT_VERSION,
        plugins: { identity: { apiToken: '$ID_API_TOKEN', syncMode: 'manual' } }
    });
    const api = createConfigApi({
        environment: { ID_API_TOKEN: 'x' },
        configPath,
        plugins: [{
            name: 'identity',
            configSchema: { apiToken: { type: 'string', secret: true }, syncMode: { type: 'enum', enum: ['auto', 'manual'] } }
        }]
    });
    const result = api.getConfig({});
    assert.deepEqual(result.body.data.sections.plugins.identity.apiToken, { secret: true, set: true });
    assert.equal(result.body.data.sections.plugins.identity.syncMode, 'manual');
    assert.ok(!JSON.stringify(result.body).includes('$ID_API_TOKEN'), 'наружу не уходит даже $VAR-имя');
    fs.rmSync(dir, { recursive: true, force: true });
});

// H3 (review): объявленное НЕсекретное поле configSchema — обычное значение.
// $VAR-ссылка в нём не маскируется (это настройка, а не секрет).
test('getConfig: declared non-secret plugin field with $VAR is not masked (H3)', () => {
    const { dir, configPath } = tmpConfig({
        version: CURRENT_VERSION,
        plugins: { identity: { apiToken: '$ID_API_TOKEN', syncMode: '$SYNC_MODE_VAR' } }
    });
    const api = createConfigApi({
        environment: { ID_API_TOKEN: 'x', SYNC_MODE_VAR: 'manual' },
        configPath,
        plugins: [{
            name: 'identity',
            configSchema: {
                apiToken: { type: 'string', secret: true },
                syncMode: { type: 'enum', enum: ['auto', 'manual'], default: 'auto' }
            }
        }]
    });
    const result = api.getConfig({});
    assert.deepEqual(result.body.data.sections.plugins.identity.apiToken, { secret: true, set: true });
    assert.equal(result.body.data.sections.plugins.identity.syncMode, '$SYNC_MODE_VAR',
        'несекретное поле плагина отдаётся как есть, даже если значение — $VAR');
    assert.ok(JSON.stringify(result.body).includes('$SYNC_MODE_VAR'));
    assert.ok(!JSON.stringify(result.body).includes('$ID_API_TOKEN'));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('computeConfigDiff: declared non-secret $VAR plugin field appears in diff (H3)', () => {
    const plugins = [{ name: 'identity', configSchema: { syncMode: { type: 'enum', enum: ['auto', 'manual'] } } }];
    const active = { version: 1, plugins: { identity: { syncMode: '$SYNC_MODE_VAR' } } };
    const staged = { version: 1, plugins: { identity: { syncMode: 'manual' } } };
    const diff = computeConfigDiff(active, staged, plugins);
    assert.equal(diff.length, 1);
    assert.equal(diff[0].section, 'identity');
    assert.equal(diff[0].key, 'syncMode');
    assert.equal(diff[0].old, '$SYNC_MODE_VAR');
    assert.equal(diff[0].new, 'manual');
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

test('getStatus: recovery из стартового детектора доступен после рестарта (M6)', () => {
    // Регрессия: после crash-restart in-memory состояние API сбрасывается в
    // idle, и баннер отката был бы недостижим. createCore передаёт результат
    // детектора через options.recovery — он должен стать начальным статусом.
    const { dir, configPath } = tmpConfig(undefined);
    const recovery = {
        state: 'rolled_back',
        reason: 'предыдущий Apply не подтверждён (краш до ready), восстановлен lkg',
        restoredFrom: 'lkg'
    };
    const api = createConfigApi({ environment: {}, configPath, recovery });
    const result = api.getStatus({});
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.state, 'rolled_back');
    assert.equal(result.body.data.restoredFrom, 'lkg');
    assert.match(result.body.data.reason, /не подтверждён/);
    assert.ok(result.body.data.restoredAt);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('getStatus: idle не перетирается recovery со state=ok', () => {
    const { dir, configPath } = tmpConfig(undefined);
    const api = createConfigApi({
        environment: {},
        configPath,
        recovery: { state: 'ok', reason: null, restoredFrom: null }
    });
    assert.equal(api.getStatus({}).body.data.state, 'idle');
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

test('putStage: частичное обновление сохраняет $VAR-секреты активного конфига', async () => {
    const { dir, configPath } = tmpConfig({
        version: CURRENT_VERSION,
        bot: { logLevel: 'info', maxBotToken: '$MAX_BOT_TOKEN' },
        monitor: { monitorEnabled: true, monitorPort: 9000, metricsApiKey: '$METRICS_API_KEY' }
    });
    const api = createConfigApi({ environment: { MAX_BOT_TOKEN: 'x', METRICS_API_KEY: 'y' }, configPath });
    const changed = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'debug' },
        monitor: { monitorEnabled: true, monitorPort: 9000 }
    };

    const result = await api.putStage({ req: mockReq(changed) });
    assert.equal(result.statusCode, 200);
    // Ответ API маскирует $VAR-секреты — только статус (ADR-0045/0046).
    assert.deepEqual(result.body.data.staged.bot.maxBotToken, { secret: true, set: true });
    assert.deepEqual(result.body.data.staged.monitor.metricsApiKey, { secret: true, set: true });
    // diff не сообщает о секретах (сохранены без изменений)
    assert.ok(!result.body.data.diff.some((d) => d.key === 'maxBotToken' || d.key === 'metricsApiKey'));
    // staged записан на диск с секретами
    const stagedOnDisk = JSON.parse(fs.readFileSync(`${configPath}.staged.json`, 'utf8'));
    assert.equal(stagedOnDisk.bot.maxBotToken, '$MAX_BOT_TOKEN');
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

test('apply: broken staged config -> 400 and staged cleared', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    fs.writeFileSync(`${configPath}.staged.json`, '{broken json', 'utf8');

    const result = await api.apply({});
    assert.equal(result.statusCode, 400);
    assert.match(result.body.error, /cleared/);
    assert.equal(fs.existsSync(`${configPath}.staged.json`), false);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('confirm: снимает pending-маркер и фиксирует состояние confirmed (M2 review)', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    const { writePending, pendingExists } = require('../../../src/bot-platform/core/config-store');
    // pending.hash должен совпадать с активным файлом (L2 review).
    writePending(configPath, minimalConfig);
    assert.equal(pendingExists(configPath), true);

    const confirmed = api.confirm();
    assert.equal(confirmed, true);
    assert.equal(pendingExists(configPath), false);
    const status = api.getStatus({});
    assert.equal(status.body.data.state, 'confirmed');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('confirm: без pending-маркера — no-op, состояние не меняется', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    const confirmed = api.confirm();
    assert.equal(confirmed, false);
    const status = api.getStatus({});
    assert.equal(status.body.data.state, 'idle');
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

// M1 (review R6): битый lkg (коррупция JSON) на rollback — 400
// CONFIG_VALIDATION_ERROR, а не 500 (raw SyntaxError). rollback — самая
// аварийная операция, битый lkg в ней наиболее вероятен.
test('rollback: битый lkg — 400, а не 500', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath });
    fs.writeFileSync(`${configPath}.lkg`, '{ broken json', 'utf8');
    const result = await api.rollback({});
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.code, 'CONFIG_VALIDATION_ERROR');
    assert.match(result.body.error, /lkg повреждён/);
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

test('import: сохраняет $VAR-секреты активного конфига при частичном импорте', async () => {
    const { dir, configPath } = tmpConfig({
        version: CURRENT_VERSION,
        bot: { logLevel: 'info', maxBotToken: '$MAX_BOT_TOKEN' },
        monitor: { monitorEnabled: true, monitorPort: 9000, metricsApiKey: '$METRICS_API_KEY' }
    });
    const api = createConfigApi({ environment: { MAX_BOT_TOKEN: 'x', METRICS_API_KEY: 'y' }, configPath });
    const imported = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'debug' },
        monitor: { monitorEnabled: true, monitorPort: 9000 }
    };

    const result = await api.importConfig({ req: mockReq(imported) });
    assert.equal(result.statusCode, 200);
    // Ответ API маскирует $VAR-секреты — только статус (ADR-0045/0046).
    assert.deepEqual(result.body.data.staged.bot.maxBotToken, { secret: true, set: true });
    assert.deepEqual(result.body.data.staged.monitor.metricsApiKey, { secret: true, set: true });
    const stagedOnDisk = JSON.parse(fs.readFileSync(`${configPath}.staged.json`, 'utf8'));
    assert.equal(stagedOnDisk.bot.maxBotToken, '$MAX_BOT_TOKEN');
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

// F10-L1 (review R10): import с необъявленными ключами плагина (в т.ч.
// $VAR-секреты), которых нет в активном конфиге, предупреждает о ключах,
// которые round-trip «форма → Save» молча потеряет.
test('import: предупреждает о необъявленных ключах плагина, которых нет в active (F10-L1)', async () => {
    const { dir, configPath } = tmpConfig({ version: CURRENT_VERSION, bot: { logLevel: 'info' }, plugins: {} });
    const api = createConfigApi({ environment: {}, configPath, plugins: [] });
    const imported = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'info' },
        plugins: { legacy: { retries: 3, token: '$LEGACY' } }
    };

    const result = await api.importConfig({ req: mockReq(imported) });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.data.warnings, ['plugins.legacy.retries', 'plugins.legacy.token']);
    // Сами ключи в staged-файле есть (потеря — только при Save из формы).
    const stagedOnDisk = JSON.parse(fs.readFileSync(`${configPath}.staged.json`, 'utf8'));
    assert.equal(stagedOnDisk.plugins.legacy.retries, 3);
    assert.equal(stagedOnDisk.plugins.legacy.token, '$LEGACY');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('import: ключи, уже присутствующие в active, в warnings не попадают (F10-L1)', async () => {
    const { dir, configPath } = tmpConfig({
        version: CURRENT_VERSION,
        bot: { logLevel: 'info' },
        plugins: { legacy: { retries: 3, token: '$LEGACY' } }
    });
    const api = createConfigApi({ environment: {}, configPath, plugins: [] });
    const imported = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'debug' },
        plugins: { legacy: { retries: 3, token: '$LEGACY' } }
    };

    const result = await api.importConfig({ req: mockReq(imported) });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.data.warnings, [], 'активные ключи переживут Save — предупреждений нет');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('import: необъявленные ключи системных секций попадают в warnings (F10-L1)', async () => {
    const { dir, configPath } = tmpConfig({ version: CURRENT_VERSION, bot: { logLevel: 'info' } });
    const api = createConfigApi({ environment: {}, configPath });
    const imported = { version: CURRENT_VERSION, bot: { logLevel: 'info', extraKey: 'x' } };

    const result = await api.importConfig({ req: mockReq(imported) });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.data.warnings, ['bot.extraKey']);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('putStage: предупреждает о необъявленных ключах, которых нет в active (F10-L1)', async () => {
    const { dir, configPath } = tmpConfig({ version: CURRENT_VERSION, bot: { logLevel: 'info' }, plugins: {} });
    const api = createConfigApi({ environment: {}, configPath, plugins: [] });
    const changed = { version: CURRENT_VERSION, bot: { logLevel: 'info' }, plugins: { legacy: { retries: 3 } } };

    const result = await api.putStage({ req: mockReq(changed) });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.data.warnings, ['plugins.legacy.retries']);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('getStage: предупреждает о необъявленных ключах в существующем staged (F10-L1)', async () => {
    const { dir, configPath } = tmpConfig({ version: CURRENT_VERSION, bot: { logLevel: 'info' }, plugins: {} });
    const api = createConfigApi({ environment: {}, configPath, plugins: [] });
    const imported = { version: CURRENT_VERSION, bot: { logLevel: 'info' }, plugins: { legacy: { retries: 3 } } };
    await api.importConfig({ req: mockReq(imported) });

    const result = api.getStage({});
    assert.equal(result.body.data.exists, true);
    assert.deepEqual(result.body.data.warnings, ['plugins.legacy.retries']);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('putStage: секреты плагинов маскируются в staged-ответе', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const plugins = [{ name: 'identity', configSchema: { apiToken: { type: 'string', secret: true }, syncMode: { type: 'enum', enum: ['auto', 'manual'] } } }];
    const api = createConfigApi({ environment: { ID_API_TOKEN: 'x' }, configPath, plugins });
    const changed = {
        version: CURRENT_VERSION,
        plugins: { identity: { syncMode: 'auto', apiToken: '$ID_API_TOKEN' } }
    };
    const result = await api.putStage({ req: mockReq(changed) });
    assert.equal(result.statusCode, 200);
    // $VAR-имя не уходит наружу — только статус; на диске — как было.
    assert.deepEqual(result.body.data.staged.plugins.identity.apiToken, { secret: true, set: true });
    const onDisk = JSON.parse(fs.readFileSync(`${configPath}.staged.json`, 'utf8'));
    assert.equal(onDisk.plugins.identity.apiToken, '$ID_API_TOKEN');
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- Schemaless-плагины: маскирование значений (defense-in-depth, m4) ---

test('buildEffectiveSections: ветка плагина без configSchema маскирует и $VAR, и литералы', () => {
    const fileConfig = {
        version: CURRENT_VERSION,
        plugins: { legacy: { token: '$LEGACY_TOKEN', apiKey: 'sk-literal-secret', syncMode: 'auto' } }
    };
    const result = buildEffectiveSections(fileConfig, true, []);
    assert.deepEqual(result.sections.plugins.legacy.token, { secret: true, set: true });
    assert.deepEqual(result.sections.plugins.legacy.apiKey, { secret: true, set: true });
    assert.deepEqual(result.sections.plugins.legacy.syncMode, { secret: true, set: true });
    assert.ok(!JSON.stringify(result).includes('$LEGACY_TOKEN'), 'наружу не уходит даже $VAR-имя');
    assert.ok(!JSON.stringify(result).includes('sk-literal-secret'), 'наружу не уходит литеральный секрет');
});

test('maskStagedSecrets: ветка плагина без configSchema маскирует и $VAR, и литералы', () => {
    const staged = { version: 1, plugins: { legacy: { token: '$LEGACY_TOKEN', apiKey: 'sk-literal-secret', syncMode: 'auto' } } };
    const masked = maskStagedSecrets(staged, []);
    assert.deepEqual(masked.plugins.legacy.token, { secret: true, set: true });
    assert.deepEqual(masked.plugins.legacy.apiKey, { secret: true, set: true });
    assert.deepEqual(masked.plugins.legacy.syncMode, { secret: true, set: true });
    assert.ok(!JSON.stringify(masked).includes('$LEGACY_TOKEN'));
    assert.ok(!JSON.stringify(masked).includes('sk-literal-secret'));
});

test('computeConfigDiff: $VAR и необъявленные литералы ветки без configSchema не попадают в diff', () => {
    const plugins = [{ name: 'identity', configSchema: { syncMode: { type: 'enum', enum: ['auto', 'manual'] } } }];
    const active = { version: 1, plugins: { identity: { token: '$OLD_TOKEN', apiKey: 'old-literal', syncMode: 'auto' } } };
    const staged = { version: 1, plugins: { identity: { token: '$NEW_TOKEN', apiKey: 'new-literal', syncMode: 'manual' } } };
    const diff = computeConfigDiff(active, staged, plugins);
    assert.equal(diff.length, 1, 'только объявленное несекретное изменение');
    assert.equal(diff[0].key, 'syncMode');
    assert.ok(!JSON.stringify(diff).includes('$OLD_TOKEN') && !JSON.stringify(diff).includes('$NEW_TOKEN'));
    assert.ok(!JSON.stringify(diff).includes('old-literal') && !JSON.stringify(diff).includes('new-literal'));
});

test('computeConfigDiff: необъявленные ключи системных секций не попадают в diff (L1 R7)', () => {
    const active = { version: 1, bot: { logLevel: 'info', authTokenX: 'sk-active-literal' } };
    const staged = { version: 1, bot: { logLevel: 'debug', authTokenX: '$NEW_VAR' } };
    const diff = computeConfigDiff(active, staged);
    assert.equal(diff.length, 1, 'только объявленное изменение');
    assert.equal(diff[0].key, 'logLevel');
    assert.ok(!JSON.stringify(diff).includes('authTokenX'), 'необъявленный ключ не в diff');
    assert.ok(!JSON.stringify(diff).includes('sk-active-literal') && !JSON.stringify(diff).includes('$NEW_VAR'));
});

test('computeConfigDiff: необъявленная системная секция целиком не попадает в diff (L1 R7)', () => {
    const active = { version: 1, unknownSection: { apiKey: 'sk-literal' } };
    const staged = { version: 1, unknownSection: { apiKey: '$NEW_VAR' } };
    const diff = computeConfigDiff(active, staged);
    assert.equal(diff.length, 0, 'необъявленная секция молчит');
    assert.ok(!JSON.stringify(diff).includes('unknownSection'));
    assert.ok(!JSON.stringify(diff).includes('sk-literal'));
});

test('maskStagedSecrets: необъявленные ключи системных секций маскируются (L1 R7)', () => {
    const staged = { version: 1, bot: { logLevel: 'info', authTokenX: 'sk-literal-secret', legacyToken: '$LEGACY_TOKEN' } };
    const masked = maskStagedSecrets(staged, []);
    assert.deepEqual(masked.bot.authTokenX, { secret: true, set: true });
    assert.deepEqual(masked.bot.legacyToken, { secret: true, set: true });
    assert.equal(masked.bot.logLevel, 'info', 'объявленный несекретный ключ не маскируется');
    assert.ok(!JSON.stringify(masked).includes('sk-literal-secret'));
    assert.ok(!JSON.stringify(masked).includes('$LEGACY_TOKEN'));
});

test('maskStagedSecrets: необъявленные нестроковые ключи системных секций отбрасываются (R8)', () => {
    const staged = {
        version: 1,
        bot: {
            logLevel: 'info',
            extraNested: { token: 'sk-nested' },
            extraArr: ['sk-arr'],
            extraNum: 42,
            extraBool: true,
            extraEmpty: ''
        }
    };
    const masked = maskStagedSecrets(staged, []);
    assert.equal(masked.bot.logLevel, 'info', 'объявленный ключ цел');
    assert.ok(!('extraNested' in masked.bot), 'объект отброшен');
    assert.ok(!('extraArr' in masked.bot), 'массив отброшен');
    assert.ok(!('extraNum' in masked.bot), 'число отброшено');
    assert.ok(!('extraBool' in masked.bot), 'булево отброшено');
    assert.equal(masked.bot.extraEmpty, '', 'пустая строка не секрет — остаётся');
    assert.ok(!JSON.stringify(masked).includes('sk-nested'));
    assert.ok(!JSON.stringify(masked).includes('sk-arr'));
});

test('maskStagedSecrets: необъявленные нестроковые ключи ветки плагина отбрасываются (R8)', () => {
    const plugins = [{ name: 'identity', configSchema: { syncMode: { type: 'enum', enum: ['auto', 'manual'] } } }];
    const staged = {
        version: 1,
        plugins: { identity: { syncMode: 'auto', nested: { token: 'sk-nested' }, retries: 3 } }
    };
    const masked = maskStagedSecrets(staged, plugins);
    assert.equal(masked.plugins.identity.syncMode, 'auto', 'объявленный несекретный ключ цел');
    assert.ok(!('nested' in masked.plugins.identity), 'объект отброшен');
    assert.ok(!('retries' in masked.plugins.identity), 'число отброшено');
    assert.ok(!JSON.stringify(masked).includes('sk-nested'));
});

test('getConfig: ветка плагина без configSchema не уходит наружу (ни $VAR, ни литералы)', () => {
    const { dir, configPath } = tmpConfig({
        version: CURRENT_VERSION,
        plugins: { legacy: { token: '$LEGACY_TOKEN', apiKey: 'sk-literal-secret', syncMode: 'auto' } }
    });
    const api = createConfigApi({ environment: {}, configPath, plugins: [] });
    const result = api.getConfig({});
    assert.deepEqual(result.body.data.sections.plugins.legacy.token, { secret: true, set: true });
    assert.deepEqual(result.body.data.sections.plugins.legacy.apiKey, { secret: true, set: true });
    assert.deepEqual(result.body.data.sections.plugins.legacy.syncMode, { secret: true, set: true });
    assert.ok(!JSON.stringify(result.body).includes('$LEGACY_TOKEN'));
    assert.ok(!JSON.stringify(result.body).includes('sk-literal-secret'));
    fs.rmSync(dir, { recursive: true, force: true });
});

// N1 (review R9): R8-фикс не покрывал buildEffectiveSections — нестроковые
// необъявленные значения веток плагинов утекали в GET /api/config.
test('getConfig: нестроковые необъявленные значения ветки плагина не утекают (N1 R9)', () => {
    const { dir, configPath } = tmpConfig({
        version: CURRENT_VERSION,
        plugins: { legacy: { token: '$LEGACY_TOKEN', nested: { token: 'sk-nested' }, retries: 3, arr: ['sk-arr'], flag: true } }
    });
    const api = createConfigApi({ environment: {}, configPath, plugins: [] });
    const result = api.getConfig({});
    const legacy = result.body.data.sections.plugins.legacy;
    assert.deepEqual(legacy.token, { secret: true, set: true }, 'строка маскируется');
    assert.ok(!('nested' in legacy), 'объект отброшен');
    assert.ok(!('arr' in legacy), 'массив отброшен');
    assert.ok(!('retries' in legacy), 'число отброшено');
    assert.ok(!('flag' in legacy), 'булево отброшено');
    assert.ok(!JSON.stringify(result.body).includes('sk-nested'));
    assert.ok(!JSON.stringify(result.body).includes('sk-arr'));
    fs.rmSync(dir, { recursive: true, force: true });
});

// N1 (review R9): то же для плагина с configSchema — объявленное несекретное
// поле видимо, необъявленные нестроковые ключи отбрасываются.
test('getConfig: объявленное поле плагина видимо, необъявленные нестроковые — нет (N1 R9)', () => {
    const plugins = [{ name: 'identity', configSchema: { syncMode: { type: 'enum', enum: ['auto', 'manual'] } } }];
    const { dir, configPath } = tmpConfig({
        version: CURRENT_VERSION,
        plugins: { identity: { syncMode: 'auto', apiToken: '$ID_API_TOKEN', nested: { token: 'sk-nested' } } }
    });
    const api = createConfigApi({ environment: {}, configPath, plugins });
    const result = api.getConfig({});
    const identity = result.body.data.sections.plugins.identity;
    assert.equal(identity.syncMode, 'auto', 'объявленный несекретный ключ цел');
    assert.deepEqual(identity.apiToken, { secret: true, set: true }, 'объявленный секрет — статус');
    assert.ok(!('nested' in identity), 'необъявленный объект отброшен');
    assert.ok(!JSON.stringify(result.body).includes('sk-nested'));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('buildEffectiveSections: объявленное несекретное поле плагина остаётся видимым', () => {
    const plugins = [{ name: 'identity', configSchema: { syncMode: { type: 'enum', enum: ['auto', 'manual'] } } }];
    const fileConfig = { version: CURRENT_VERSION, plugins: { identity: { syncMode: 'manual', apiToken: '$ID_API_TOKEN' } } };
    const result = buildEffectiveSections(fileConfig, true, plugins);
    assert.equal(result.sections.plugins.identity.syncMode, 'manual');
    assert.deepEqual(result.sections.plugins.identity.apiToken, { secret: true, set: true });
});

// --- Статус: restartInitiated (ручной vs авто-рестарт) ---

test('getStatus: авто-apply — restartInitiated=true, pendingRemainingMs считается', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath, restart: () => {} });
    const changed = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'debug' },
        queue: { queueEnabled: true },
        ingress: { ingressEnabled: false },
        monitor: { monitorEnabled: true, monitorPort: 9000 },
        plugins: {}
    };
    await api.putStage({ req: mockReq(changed) });
    await api.apply({});
    const status = api.getStatus({});
    assert.equal(status.body.data.state, 'pending');
    assert.equal(status.body.data.restartInitiated, true);
    assert.equal(typeof status.body.data.pendingRemainingMs, 'number');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('getStatus: ручной apply — restartInitiated=false, pendingRemainingMs=null', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath, restart: null });
    const changed = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'debug' },
        queue: { queueEnabled: true },
        ingress: { ingressEnabled: false },
        monitor: { monitorEnabled: true, monitorPort: 9000 },
        plugins: {}
    };
    await api.putStage({ req: mockReq(changed) });
    await api.apply({});
    const status = api.getStatus({});
    assert.equal(status.body.data.state, 'pending');
    assert.equal(status.body.data.restartInitiated, false);
    assert.equal(status.body.data.pendingRemainingMs, null);
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- Толерантное чтение: битый файл не роняет API ---

test('getConfig: битый активный файл не роняет API (200 с дефолтами)', () => {
    const dir = tmpDir();
    const configPath = path.join(dir, 'zyablik.config.json');
    fs.writeFileSync(configPath, '{ broken json', 'utf8');
    const api = createConfigApi({ environment: {}, configPath });
    const result = api.getConfig({});
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.fileExists, true);
    fs.rmSync(dir, { recursive: true, force: true });
});

// --- single-flight (409) ---

test('import: close соединения освобождает мутацию (lock не висит)', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath, restart: () => {} });

    // Тело не приходит, сокет закрывается: readJsonBody должен отклониться
    // по 'close', importConfig вернуть 400, а single-flight слот освободиться.
    const closedReq = { handlers: {}, on(event, handler) { this.handlers[event] = handler; }, destroy() {} };
    const importPromise = api.importConfig({ req: closedReq });
    closedReq.handlers.close();
    const result = await importPromise;
    assert.equal(result.statusCode, 400);
    assert.match(result.body.error, /closed/i);

    // Слот свободен: следующий apply не получает 409 (только 400 без staged).
    const applyResult = await api.apply({});
    assert.equal(applyResult.statusCode, 400);
    fs.rmSync(dir, { recursive: true, force: true });
});

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

test('putStage during in-progress mutation returns 409 (single-flight, review)', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath, restart: () => {} });

    // «Зависший» import удерживает мутацию; параллельный stage получает 409
    // и не будет затёрт clearStaged из in-flight apply.
    const hangingReq = { on() {}, destroy() {} };
    try {
        api.importConfig({ req: hangingReq });
        const stageResult = await api.putStage({ req: mockReq(minimalConfig) });
        assert.equal(stageResult.statusCode, 409);
    } finally {
        // readJsonBody отклонится по destroy/таймауту; инстанс отбрасывается.
    }
    fs.rmSync(dir, { recursive: true, force: true });
});

test('getStage: без staged diff пуст (активный конфиг не показывается как удалённый, review)', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath, restart: () => {} });

    const stageResult = api.getStage({});

    assert.equal(stageResult.statusCode, 200);
    assert.equal(stageResult.body.data.exists, false);
    assert.deepEqual(stageResult.body.data.diff, []);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('getStage: битый staged — diff пуст (не «всё удалено»)', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    fs.writeFileSync(`${configPath}.staged.json`, '{broken json', 'utf8');
    const api = createConfigApi({ environment: {}, configPath, restart: () => {} });

    const stageResult = api.getStage({});

    assert.equal(stageResult.statusCode, 200);
    assert.equal(stageResult.body.data.exists, true);
    assert.deepEqual(stageResult.body.data.diff, []);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('getStatus: ручной apply — appliedAt/appliedAtMs null (вводящий timestamp убран, review)', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    const api = createConfigApi({ environment: {}, configPath, restart: null });
    const changed = {
        version: CURRENT_VERSION,
        bot: { logLevel: 'debug' },
        queue: { queueEnabled: true },
        ingress: { ingressEnabled: false },
        monitor: { monitorEnabled: true, monitorPort: 9000 },
        plugins: {}
    };
    await api.putStage({ req: mockReq(changed) });
    await api.apply({});

    const status = api.getStatus({});
    assert.equal(status.body.data.state, 'pending');
    assert.equal(status.body.data.restartInitiated, false);
    assert.equal(status.body.data.appliedAt, null);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('rate limited mutations return 429 with Retry-After', async () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    let now = 1000;
    const api = createConfigApi({
        environment: {},
        configPath,
        restart: () => {},
        // M1 (review R4): putStage теперь тоже расходует слот rate limit,
        // поэтому лимит = 2 (putStage + apply помещаются, второй apply — 429).
        mutationRateLimitMax: 2,
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

// M1 (review R4): PUT /stage расходует слот mutation rate limit наравне с
// apply/rollback/import. Раньше putStage обходил лимитер — два putStage при
// mutationRateLimitMax:1 давали оба 200, stats().mutations оставался 0.
test('putStage consumes mutation rate-limit slot (M1)', async () => {
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
    const first = await api.putStage({ req: mockReq(changed) });
    assert.equal(first.statusCode, 200);
    assert.equal(api._rateLimiter.stats().mutations, 1);

    now += 5000;
    const second = await api.putStage({ req: mockReq(changed) });
    assert.equal(second.statusCode, 429);
    assert.ok(second.headers['Retry-After']);
    fs.rmSync(dir, { recursive: true, force: true });
});

// L2 (review R4): после crash-restart in-memory state сбрасывается в idle,
// но pending-маркер жив на диске. /api/config/status должен показывать
// pending (StartupWait окно активно), а не вводящий idle.
test('getStatus surfaces pending marker after restart (L2)', () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    // Пишем pending-маркер, как если бы Apply записал его перед рестартом.
    writePending(configPath, minimalConfig, new Date(), { restartInitiated: true });

    // createConfigApi без recovery — in-memory state = idle (как после
    // crash-restart, когда recovery не передал rolled_back/quarantine).
    const api = createConfigApi({
        environment: {},
        configPath,
        restart: () => {},
        startupWaitMs: 60_000
    });

    const status = api.getStatus({});
    assert.equal(status.body.data.state, 'pending');
    assert.equal(status.body.data.restartInitiated, true);
    assert.equal(status.body.data.appliedHash !== null, true);
    // pendingRemainingMs должно быть положительным (окно активно).
    assert.ok(status.body.data.pendingRemainingMs > 0);

    fs.rmSync(dir, { recursive: true, force: true });
});

test('getStatus does not surface stale pending marker (hash mismatch, L2)', () => {
    const { dir, configPath } = tmpConfig(minimalConfig);
    // pending-маркер от другого конфига (hash не совпадёт с активным).
    const otherConfig = { ...minimalConfig, bot: { logLevel: 'debug' } };
    writePending(configPath, otherConfig, new Date(), { restartInitiated: true });

    const api = createConfigApi({
        environment: {},
        configPath,
        restart: () => {},
        startupWaitMs: 60_000
    });

    const status = api.getStatus({});
    assert.equal(status.body.data.state, 'idle');

    fs.rmSync(dir, { recursive: true, force: true });
});
