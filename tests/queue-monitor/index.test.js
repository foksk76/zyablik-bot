const test = require('node:test');
const assert = require('node:assert/strict');

const { createQueueMonitor } = require('../../src/queue-monitor/index');

test('createQueueMonitor returns no-op when MONITOR_ENABLED is false', async () => {
    const monitor = createQueueMonitor({
        environment: { MONITOR_ENABLED: 'false' }
    });

    assert.equal(typeof monitor.start, 'function');
    assert.equal(typeof monitor.stop, 'function');
    assert.equal(typeof monitor.ready, 'function');
    assert.equal(monitor.ready(), true);

    await monitor.start();
    await monitor.stop();
});

test('createQueueMonitor returns no-op when MONITOR_ENABLED is not set', async () => {
    const monitor = createQueueMonitor({
        environment: {}
    });

    assert.equal(monitor.ready(), true);
});

test('createQueueMonitor throws when MONITOR_ENABLED=true but METRICS_API_KEY is empty', () => {
    assert.throws(
        () => createQueueMonitor({
            environment: { MONITOR_ENABLED: 'true' },
            reader: { ready: () => true, close: () => {} },
            httpServer: { start: async () => {}, stop: async () => {}, registerRoute: () => {} }
        }),
        /MONITOR_ENABLED=true requires METRICS_API_KEY/
    );
});

test('createQueueMonitor with injected dependencies', async () => {
    const fakeReader = {
        ready: () => true,
        close: () => {},
        summary: () => ({ pending: 0, processing: 0, delivered: 0, failed: 0, totalAttempts: 0, total: 0 }),
        timeseries: () => [],
        topSource: () => [],
        topRecipient: () => [],
        errors: () => []
    };

    const registeredRoutes = [];
    const fakeHttpServer = {
        start: async () => {},
        stop: async () => {},
        registerRoute: (method, path) => { registeredRoutes.push({ method, path }); }
    };

    const monitor = createQueueMonitor({
        environment: { MONITOR_ENABLED: 'true', MONITOR_PORT: '19100', METRICS_API_KEY: 'test-key' },
        reader: fakeReader,
        httpServer: fakeHttpServer
    });

    assert.ok(registeredRoutes.length > 0);
    assert.ok(registeredRoutes.some((r) => r.path === '/readyz'));
    assert.ok(registeredRoutes.some((r) => r.path === '/api/metrics/summary'));
    assert.ok(registeredRoutes.some((r) => r.path === '/api/metrics/discovery'));
    assert.ok(registeredRoutes.some((r) => r.path === '/api/metrics/timeseries'));
    assert.ok(registeredRoutes.some((r) => r.path === '/api/metrics/top'));
    assert.ok(registeredRoutes.some((r) => r.path === '/api/metrics/errors'));

    await monitor.start();
    await monitor.stop();
});

test('createQueueMonitor shutdown closes reader', async () => {
    let closed = false;
    const fakeReader = {
        ready: () => true,
        close: () => { closed = true; },
        summary: () => ({}),
        timeseries: () => [],
        topSource: () => [],
        topRecipient: () => [],
        errors: () => []
    };

    const fakeHttpServer = {
        start: async () => {},
        stop: async () => {},
        registerRoute: () => {}
    };

    const monitor = createQueueMonitor({
        environment: { MONITOR_ENABLED: 'true', METRICS_API_KEY: 'test-key' },
        reader: fakeReader,
        httpServer: fakeHttpServer
    });

    await monitor.start();
    assert.equal(closed, false);
    await monitor.stop();
    assert.equal(closed, true);
});

// --- Sprint 23 / M2: rate limiter wiring ---

test('createQueueMonitor registers auth routes with rate limiter when OAuth2 enabled', async () => {
    const registeredRoutes = [];
    const fakeHttpServer = {
        start: async () => {},
        stop: async () => {},
        registerRoute: (method, path) => { registeredRoutes.push({ method, path }); }
    };
    const fakeReader = {
        ready: () => true, close: () => {},
        summary: () => ({}), timeseries: () => [],
        topSource: () => [], topRecipient: () => [], errors: () => []
    };
    // Инжектируем oidcClient, чтобы authEnabled === true без реальной сети.
    const fakeOidc = {
        getAuthorizationUrl: async () => 'https://idp/authorize',
        callback: async () => ({ accessToken: 'at' }),
        getUserInfo: async () => ({ sub: 'u' })
    };

    const monitor = createQueueMonitor({
        environment: {
            MONITOR_ENABLED: 'true',
            METRICS_API_KEY: 'test-key',
            IDP_ISSUER: 'https://idp.example.com',
            IDP_CLIENT_ID: 'cid',
            IDP_REDIRECT_URI: 'https://bot.example.com/callback',
            SESSION_SECRET: 'a'.repeat(32) + '-test'
        },
        reader: fakeReader,
        httpServer: fakeHttpServer,
        oidcClient: fakeOidc
    });

    await monitor.start();

    assert.ok(registeredRoutes.some((r) => r.path === '/api/auth/login'), 'login route registered');
    assert.ok(registeredRoutes.some((r) => r.path === '/api/auth/callback'), 'callback route registered');
    assert.ok(registeredRoutes.some((r) => r.path === '/api/auth/logout'), 'logout route registered');
    assert.ok(registeredRoutes.some((r) => r.path === '/api/auth/session'), 'session route registered');

    await monitor.stop();
});

test('createQueueMonitor accepts injected rateLimiter when OAuth2 enabled', async () => {
    const fakeHttpServer = { start: async () => {}, stop: async () => {}, registerRoute: () => {} };
    const fakeReader = { ready: () => true, close: () => {},
        summary: () => ({}), timeseries: () => [], topSource: () => [], topRecipient: () => [], errors: () => [] };
    const fakeOidc = {
        getAuthorizationUrl: async () => 'https://idp/authorize',
        callback: async () => ({ accessToken: 'at' }),
        getUserInfo: async () => ({ sub: 'u' })
    };
    const injectedLimiter = { tryAcquireAuthRequest: () => {}, tryAcquireCallback: () => {}, releaseCallback: () => {} };

    // Не должно бросать — options.rateLimiter принимается и прокидывается в auth-routes.
    const monitor = createQueueMonitor({
        environment: {
            MONITOR_ENABLED: 'true', METRICS_API_KEY: 'k',
            IDP_ISSUER: 'https://idp.example.com', IDP_CLIENT_ID: 'cid',
            IDP_REDIRECT_URI: 'https://bot.example.com/callback',
            SESSION_SECRET: 'a'.repeat(32) + '-test'
        },
        reader: fakeReader, httpServer: fakeHttpServer, oidcClient: fakeOidc,
        rateLimiter: injectedLimiter
    });

    await monitor.start();
    await monitor.stop();
});

test('createQueueMonitor works without OAuth2 (bearer-only, no rate limiter)', async () => {
    const registeredRoutes = [];
    const fakeHttpServer = {
        start: async () => {}, stop: async () => {},
        registerRoute: (method, path) => { registeredRoutes.push({ method, path }); }
    };
    const fakeReader = { ready: () => true, close: () => {},
        summary: () => ({}), timeseries: () => [], topSource: () => [], topRecipient: () => [], errors: () => [] };

    const monitor = createQueueMonitor({
        environment: { MONITOR_ENABLED: 'true', METRICS_API_KEY: 'k' },
        reader: fakeReader, httpServer: fakeHttpServer
    });

    await monitor.start();
    // Без OAuth2 auth-маршруты не регистрируются — rate limiter не нужен.
    assert.ok(!registeredRoutes.some((r) => r.path === '/api/auth/login'));
    await monitor.stop();
});
