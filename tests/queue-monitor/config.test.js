const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createQueueMonitorConfig,
    MODULE_NAME,
    DEFAULT_MONITOR_PORT
} = require('../../src/queue-monitor/config');

test('createQueueMonitorConfig uses safe defaults when env is empty', () => {
    const config = createQueueMonitorConfig({});

    assert.equal(config.moduleName, MODULE_NAME);
    assert.equal(config.monitorEnabled, false);
    assert.equal(config.monitorPort, DEFAULT_MONITOR_PORT);
    assert.equal(config.metricsApiKey, '');
    assert.equal(config.idpIssuer, '');
    assert.equal(config.idpClientId, '');
    assert.equal(config.idpClientSecret, '');
    assert.equal(config.idpRedirectUri, '');
    assert.equal(config.sessionSecret, '');
});

test('createQueueMonitorConfig reads MONITOR_ENABLED as true', () => {
    const config = createQueueMonitorConfig({ MONITOR_ENABLED: 'true' });

    assert.equal(config.monitorEnabled, true);
});

test('createQueueMonitorConfig reads MONITOR_ENABLED case-insensitive', () => {
    const config = createQueueMonitorConfig({ MONITOR_ENABLED: 'TRUE' });

    assert.equal(config.monitorEnabled, true);
});

test('createQueueMonitorConfig reads MONITOR_ENABLED false explicitly', () => {
    const config = createQueueMonitorConfig({ MONITOR_ENABLED: 'false' });

    assert.equal(config.monitorEnabled, false);
});

test('createQueueMonitorConfig reads MONITOR_PORT override', () => {
    const config = createQueueMonitorConfig({ MONITOR_PORT: '8080' });

    assert.equal(config.monitorPort, 8080);
});

test('createQueueMonitorConfig rejects invalid MONITOR_PORT', () => {
    assert.throws(
        () => createQueueMonitorConfig({ MONITOR_PORT: '0' }),
        /Invalid MONITOR_PORT value: 0/
    );
});

test('createQueueMonitorConfig rejects MONITOR_PORT above max', () => {
    assert.throws(
        () => createQueueMonitorConfig({ MONITOR_PORT: '70000' }),
        /Invalid MONITOR_PORT value: 70000/
    );
});

test('createQueueMonitorConfig reads METRICS_API_KEY', () => {
    const config = createQueueMonitorConfig({ METRICS_API_KEY: 'test-api-key-123' });

    assert.equal(config.metricsApiKey, 'test-api-key-123');
});

test('createQueueMonitorConfig reads IDP config', () => {
    const config = createQueueMonitorConfig({
        IDP_ISSUER: 'https://idp.example.com',
        IDP_CLIENT_ID: 'my-client',
        IDP_CLIENT_SECRET: 'secret',
        IDP_REDIRECT_URI: 'https://bot.example.com/callback'
    });

    assert.equal(config.idpIssuer, 'https://idp.example.com');
    assert.equal(config.idpClientId, 'my-client');
    assert.equal(config.idpClientSecret, 'secret');
    assert.equal(config.idpRedirectUri, 'https://bot.example.com/callback');
});

test('createQueueMonitorConfig reads SESSION_SECRET', () => {
    const config = createQueueMonitorConfig({ SESSION_SECRET: 'my-session-secret' });

    assert.equal(config.sessionSecret, 'my-session-secret');
});

// --- Sprint 23 / M2: rate limit config ---

test('createQueueMonitorConfig uses rate limit defaults when env is empty', () => {
    const config = createQueueMonitorConfig({});

    assert.equal(config.authRateLimit, true, 'enabled by default');
    assert.equal(config.authRateLimitMax, 20);
    assert.equal(config.authRateLimitWindowMs, 60_000);
    assert.equal(config.authRateConcurrency, 5);
});

test('createQueueMonitorConfig reads AUTH_RATE_LIMIT overrides', () => {
    const config = createQueueMonitorConfig({
        AUTH_RATE_LIMIT: 'false',
        AUTH_RATE_LIMIT_MAX: '50',
        AUTH_RATE_LIMIT_WINDOW_MS: '120000',
        AUTH_RATE_CONCURRENCY: '10'
    });

    assert.equal(config.authRateLimit, false);
    assert.equal(config.authRateLimitMax, 50);
    assert.equal(config.authRateLimitWindowMs, 120_000);
    assert.equal(config.authRateConcurrency, 10);
});

test('createQueueMonitorConfig rejects invalid AUTH_RATE_LIMIT_MAX', () => {
    assert.throws(
        () => createQueueMonitorConfig({ AUTH_RATE_LIMIT_MAX: '0' }),
        /Invalid AUTH_RATE_LIMIT_MAX value: 0/
    );
});

test('createQueueMonitorConfig rejects invalid AUTH_RATE_CONCURRENCY', () => {
    assert.throws(
        () => createQueueMonitorConfig({ AUTH_RATE_CONCURRENCY: 'abc' }),
        /Invalid AUTH_RATE_CONCURRENCY value: abc/
    );
});

// --- Sprint 23 / L3 (Task 6): IDP_REQUIRE_DISCOVERY ---

test('createQueueMonitorConfig defaults IDP_REQUIRE_DISCOVERY to false', () => {
    const config = createQueueMonitorConfig({});
    assert.equal(config.idpRequireDiscovery, false, 'fallback preserved by default');
});

test('createQueueMonitorConfig reads IDP_REQUIRE_DISCOVERY=true', () => {
    const config = createQueueMonitorConfig({ IDP_REQUIRE_DISCOVERY: 'true' });
    assert.equal(config.idpRequireDiscovery, true);
});

test('createQueueMonitorConfig trims whitespace from values', () => {
    const config = createQueueMonitorConfig({
        METRICS_API_KEY: '  test-key  ',
        MONITOR_PORT: '  8080  '
    });

    assert.equal(config.metricsApiKey, 'test-key');
    assert.equal(config.monitorPort, 8080);
});

test('createQueueMonitorConfig handles non-string env gracefully', () => {
    const config = createQueueMonitorConfig({ MONITOR_PORT: 8080 });

    assert.equal(config.monitorPort, DEFAULT_MONITOR_PORT);
});

test('createQueueMonitorConfig handles undefined env', () => {
    const config = createQueueMonitorConfig();

    assert.equal(config.monitorEnabled, false);
    assert.equal(config.monitorPort, DEFAULT_MONITOR_PORT);
});
