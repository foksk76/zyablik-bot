const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessionStore } = require('../../src/queue-monitor/auth/session');
const { createAuthRoutes } = require('../../src/queue-monitor/api/auth-routes');

const SECRET = 'a'.repeat(32) + '-test-secret-do-not-use-in-prod';
const USER = { sub: 'user-1', name: 'Test Op', email: 'op@example.com' };

const silentLogger = { info() {}, warn() {}, error() {} };

// Mock OIDC client: запоминает вызовы, отдаёт предсказуемые токены.
function mockOidcClient() {
    const calls = { getAuthorizationUrl: [], callback: [], getUserInfo: [] };
    return {
        calls,
        async getAuthorizationUrl({ state, codeVerifier }) {
            calls.getAuthorizationUrl.push({ state, codeVerifier });
            return `https://idp.example/authorize?ok=1&state=${state}`;
        },
        async callback({ code, codeVerifier }) {
            calls.callback.push({ code, codeVerifier });
            return { accessToken: `at-${code}`, idToken: 'id', refreshToken: null };
        },
        async getUserInfo(accessToken) {
            calls.getUserInfo.push(accessToken);
            return USER;
        }
    };
}

// Имитация res: копит Set-Cookie в headers.
function mockRes() {
    const headers = {};
    return {
        headers,
        setHeader(name, value) { headers[name] = value; }
    };
}

// Извлечь cookie value из Set-Cookie header (после "name=" до первой ";").
function extractCookieValue(setCookie, name) {
    if (!setCookie) {
        return null;
    }
    const prefix = `${name}=`;
    if (!setCookie.startsWith(prefix)) {
        return null;
    }
    return setCookie.slice(prefix.length).split(';')[0];
}

function buildStore() {
    return createSessionStore({ secret: SECRET, logger: silentLogger });
}

// Выполнить login и вернуть { state, oauthStateCookie }.
// state берётся из Location в return-value (не из res).
async function performLogin(routes) {
    const res = mockRes();
    const result = await routes.login({ req: { headers: {} }, res });
    const state = new URL(result.headers.Location).searchParams.get('state');
    const oauthStateCookie = extractCookieValue(res.headers['Set-Cookie'], 'oauth_state');
    return { state, oauthStateCookie, loginResult: result };
}

// Выполнить callback с готовым oauth_state cookie. Возвращает { result, sessionCookie }.
async function performCallback(routes, { state, oauthStateCookie, code = 'c' }) {
    const res = mockRes();
    const result = await routes.callback({
        req: { headers: { cookie: `oauth_state=${oauthStateCookie}` } },
        res,
        query: { code, state }
    });
    const sessionCookie = extractCookieValue(res.headers['Set-Cookie'], 'session');
    return { result, sessionCookie };
}

test('createAuthRoutes requires oidcClient', () => {
    assert.throws(() => createAuthRoutes({ sessionStore: buildStore() }), /oidcClient is required/);
});

test('createAuthRoutes requires sessionStore', () => {
    assert.throws(() => createAuthRoutes({ oidcClient: mockOidcClient() }), /sessionStore is required/);
});

// --- login ---

test('login sets oauth_state cookie and redirects to IdP', async () => {
    const oidc = mockOidcClient();
    const routes = createAuthRoutes({
        oidcClient: oidc, sessionStore: buildStore(), logger: silentLogger
    });
    const res = mockRes();

    const result = await routes.login({ req: { headers: {} }, res });

    assert.equal(result.statusCode, 302);
    assert.ok(result.headers.Location.startsWith('https://idp.example/authorize'));
    assert.ok(result.headers.Location.includes('state='));

    const setCookie = res.headers['Set-Cookie'];
    assert.ok(setCookie.startsWith('oauth_state='));
    assert.ok(setCookie.includes('HttpOnly'));
    assert.ok(setCookie.includes('SameSite=Lax'));

    assert.equal(oidc.calls.getAuthorizationUrl.length, 1);
});

test('login oauth_state cookie roundtrips: state in URL matches state in cookie', async () => {
    const oidc = mockOidcClient();
    const routes = createAuthRoutes({
        oidcClient: oidc, sessionStore: buildStore(), logger: silentLogger
    });
    const { state, oauthStateCookie } = await performLogin(routes);
    assert.ok(state);
    assert.ok(oauthStateCookie);

    // Callback с тем же cookie и state из URL должен пройти state-проверку.
    const { result } = await performCallback(routes, { state, oauthStateCookie });
    assert.equal(result.statusCode, 302);
    assert.equal(result.headers.Location, '/');
});

// --- callback ---

test('callback exchanges code and creates session cookie', async () => {
    const oidc = mockOidcClient();
    const store = buildStore();
    const routes = createAuthRoutes({
        oidcClient: oidc, sessionStore: store, logger: silentLogger
    });

    const { state, oauthStateCookie } = await performLogin(routes);
    const { result, sessionCookie } = await performCallback(routes, { state, oauthStateCookie, code: 'auth-code-1' });

    assert.equal(result.statusCode, 302);
    assert.equal(result.headers.Location, '/');
    assert.ok(sessionCookie, 'session cookie set');

    assert.equal(oidc.calls.callback.length, 1);
    assert.equal(oidc.calls.callback[0].code, 'auth-code-1');
    assert.equal(store._size(), 1, 'session created in store');
});

test('callback rejects missing code or state', async () => {
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: buildStore(), logger: silentLogger
    });
    const res = mockRes();
    const result = await routes.callback({ req: { headers: {} }, res, query: {} });

    assert.equal(result.statusCode, 302);
    assert.ok(result.headers.Location.includes('error=missing_params'));
});

test('callback rejects state mismatch (CSRF)', async () => {
    const oidc = mockOidcClient();
    const routes = createAuthRoutes({
        oidcClient: oidc, sessionStore: buildStore(), logger: silentLogger
    });

    const { oauthStateCookie } = await performLogin(routes);

    // Callback с правильным cookie, но другим state в query.
    const res = mockRes();
    const result = await routes.callback({
        req: { headers: { cookie: `oauth_state=${oauthStateCookie}` } },
        res,
        query: { code: 'c', state: 'WRONG-STATE' }
    });

    assert.equal(result.statusCode, 302);
    assert.ok(result.headers.Location.includes('error=state_mismatch'));
    assert.equal(oidc.calls.callback.length, 0, 'OIDC exchange not called on CSRF mismatch');
});

test('callback rejects missing oauth_state cookie', async () => {
    const oidc = mockOidcClient();
    const routes = createAuthRoutes({
        oidcClient: oidc, sessionStore: buildStore(), logger: silentLogger
    });
    const res = mockRes();

    const result = await routes.callback({
        req: { headers: {} }, res, query: { code: 'c', state: 's' }
    });

    assert.ok(result.headers.Location.includes('error=state_mismatch'));
    assert.equal(oidc.calls.callback.length, 0);
});

test('callback redirects with error when OIDC token exchange fails', async () => {
    const oidc = {
        async getAuthorizationUrl({ state }) { return `https://idp.example/authorize?state=${state}`; },
        async callback() { throw new Error('token endpoint 500'); },
        async getUserInfo() { return USER; }
    };
    const store = buildStore();
    const routes = createAuthRoutes({
        oidcClient: oidc, sessionStore: store, logger: silentLogger
    });

    const { state, oauthStateCookie } = await performLogin(routes);
    const { result } = await performCallback(routes, { state, oauthStateCookie });

    assert.equal(result.statusCode, 302);
    assert.ok(result.headers.Location.includes('error=auth_failed'));
    assert.equal(store._size(), 0, 'no session created on failure');
});

// --- session ---

test('session returns authenticated=false when no cookie', () => {
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: buildStore(), logger: silentLogger
    });
    const result = routes.session({ req: { headers: {} } });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.authenticated, false);
    assert.equal(result.body.user, undefined);
});

test('session returns authenticated=true with user and csrf after login', async () => {
    const store = buildStore();
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: store, logger: silentLogger
    });

    const { state, oauthStateCookie } = await performLogin(routes);
    const { sessionCookie } = await performCallback(routes, { state, oauthStateCookie });

    const result = routes.session({
        req: { headers: { cookie: `session=${sessionCookie}` } }
    });

    assert.equal(result.body.authenticated, true);
    assert.deepEqual(result.body.user, USER);
    assert.equal(typeof result.body.csrf, 'string');
    assert.ok(result.body.csrf.length > 0);
});

// --- logout ---

test('logout without session redirects to /', () => {
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: buildStore(), logger: silentLogger
    });
    const res = mockRes();
    const result = routes.logout({ req: { headers: {} }, res });

    assert.equal(result.statusCode, 302);
    assert.equal(result.headers.Location, '/');
    assert.ok(res.headers['Set-Cookie'].includes('Max-Age=0'), 'session cookie cleared');
});

test('logout rejects without CSRF token', async () => {
    const store = buildStore();
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: store, logger: silentLogger
    });

    const { state, oauthStateCookie } = await performLogin(routes);
    const { sessionCookie } = await performCallback(routes, { state, oauthStateCookie });

    const result = routes.logout({
        req: { headers: { cookie: `session=${sessionCookie}` } },
        res: mockRes()
    });

    assert.equal(result.statusCode, 403);
    assert.ok(result.body.error.toLowerCase().includes('csrf'));
    assert.equal(store._size(), 1, 'session NOT destroyed without CSRF');
});

test('logout with valid CSRF destroys session', async () => {
    const store = buildStore();
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: store, logger: silentLogger
    });

    const { state, oauthStateCookie } = await performLogin(routes);
    const { sessionCookie } = await performCallback(routes, { state, oauthStateCookie });
    const sessionInfo = routes.session({ req: { headers: { cookie: `session=${sessionCookie}` } } });
    const csrf = sessionInfo.body.csrf;

    const result = routes.logout({
        req: { headers: { cookie: `session=${sessionCookie}`, 'x-csrf-token': csrf } },
        res: mockRes()
    });

    assert.equal(result.statusCode, 302);
    assert.equal(result.headers.Location, '/');
    assert.equal(store._size(), 0, 'session destroyed');
});

test('logout rejects wrong CSRF token', async () => {
    const store = buildStore();
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: store, logger: silentLogger
    });

    const { state, oauthStateCookie } = await performLogin(routes);
    const { sessionCookie } = await performCallback(routes, { state, oauthStateCookie });

    const result = routes.logout({
        req: { headers: { cookie: `session=${sessionCookie}`, 'x-csrf-token': 'WRONG-CSRF' } },
        res: mockRes()
    });

    assert.equal(result.statusCode, 403);
    assert.equal(store._size(), 1, 'session NOT destroyed on wrong CSRF');
});

// --- Sprint 23 / M2: rate limiting на login/callback ---

// Mock rate limiter: детерминированно разрешает/отклоняет, считает вызовы.
function mockRateLimiter({ allowAuth = true, allowCallback = true } = {}) {
    const calls = { tryAcquireAuthRequest: 0, tryAcquireCallback: 0, releaseCallback: 0 };
    return {
        calls,
        tryAcquireAuthRequest() {
            calls.tryAcquireAuthRequest += 1;
            return allowAuth
                ? { allowed: true, reason: null, waitMs: 0 }
                : { allowed: false, reason: 'rate-limit', waitMs: 5000 };
        },
        tryAcquireCallback() {
            calls.tryAcquireCallback += 1;
            return allowCallback
                ? { allowed: true, reason: null }
                : { allowed: false, reason: 'concurrency' };
        },
        releaseCallback() {
            calls.releaseCallback += 1;
        }
    };
}

test('login without rateLimiter works as before (backward compatibility)', async () => {
    const store = buildStore();
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: store, logger: silentLogger
        // без rateLimiter
    });

    const result = await routes.login({ req: { headers: {} }, res: mockRes() });
    assert.equal(result.statusCode, 302);
    assert.ok(result.headers.Location.startsWith('https://idp.example/authorize'));
});

test('login returns 429 when auth rate limit exceeded', async () => {
    const store = buildStore();
    const limiter = mockRateLimiter({ allowAuth: false });
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: store, logger: silentLogger, rateLimiter: limiter
    });

    const result = await routes.login({ req: { headers: {} }, res: mockRes() });

    assert.equal(result.statusCode, 429);
    assert.equal(result.headers['Retry-After'], '5', 'Retry-After = ceil(waitMs/1000)');
    assert.equal(result.body.error, 'Too Many Requests');
    assert.equal(limiter.calls.tryAcquireAuthRequest, 1);
    // При отказе IdP не вызывается.
    assert.equal(limiter.calls.tryAcquireCallback, 0);
});

test('callback returns 429 when auth rate limit exceeded (before IdP work)', async () => {
    const store = buildStore();
    const limiter = mockRateLimiter({ allowAuth: false });
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: store, logger: silentLogger, rateLimiter: limiter
    });

    // Нужен валидный oauth_state cookie, чтобы пройти state-проверку до rate-limit.
    // Но rate-limit проверяется ДО state-проверки, поэтому cookie не нужен.
    const result = await routes.callback({
        req: { headers: {} },
        res: mockRes(),
        query: { code: 'c', state: 's' }
    });

    assert.equal(result.statusCode, 429);
    assert.equal(limiter.calls.tryAcquireAuthRequest, 1);
    assert.equal(limiter.calls.tryAcquireCallback, 0, 'callback slot not acquired on rate-limit');
});

test('callback returns 429 when concurrency cap reached', async () => {
    const store = buildStore();
    const limiter = mockRateLimiter({ allowAuth: true, allowCallback: false });
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: store, logger: silentLogger, rateLimiter: limiter
    });

    // Готовим валидный oauth_state cookie через login.
    const { state, oauthStateCookie } = await performLogin(routes);

    const result = await performCallback(routes, { state, oauthStateCookie });

    assert.equal(result.result.statusCode, 429);
    assert.equal(result.result.body.error, 'Too Many Requests');
    assert.equal(limiter.calls.tryAcquireCallback, 1);
});

test('callback releases concurrency slot on success', async () => {
    const store = buildStore();
    const limiter = mockRateLimiter();
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: store, logger: silentLogger, rateLimiter: limiter
    });

    const { state, oauthStateCookie } = await performLogin(routes);
    await performCallback(routes, { state, oauthStateCookie });

    assert.equal(limiter.calls.tryAcquireCallback, 1);
    assert.equal(limiter.calls.releaseCallback, 1, 'slot released after success');
});

test('callback releases concurrency slot even when IdP exchange fails', async () => {
    // Критично: если releaseCallback не вызовется при ошибке IdP, слот зависнет
    // и заблокирует легитимные callback'и (regression-сценарий M2-C).
    const store = buildStore();
    const limiter = mockRateLimiter();

    // OIDC client, у которого callback бросает.
    const failingOidc = mockOidcClient();
    failingOidc.callback = async () => { throw new Error('IdP down'); };

    const routes = createAuthRoutes({
        oidcClient: failingOidc, sessionStore: store, logger: silentLogger, rateLimiter: limiter
    });

    const { state, oauthStateCookie } = await performLogin(routes);
    const { result } = await performCallback(routes, { state, oauthStateCookie });

    assert.equal(result.statusCode, 302, 'still redirects with error query');
    assert.ok(result.headers.Location.includes('error=auth_failed'));
    assert.equal(limiter.calls.tryAcquireCallback, 1);
    assert.equal(limiter.calls.releaseCallback, 1, 'slot released in finally despite IdP error');
});

test('callback does not acquire concurrency slot on missing params (cheap reject)', async () => {
    const store = buildStore();
    const limiter = mockRateLimiter();
    const routes = createAuthRoutes({
        oidcClient: mockOidcClient(), sessionStore: store, logger: silentLogger, rateLimiter: limiter
    });

    const result = await routes.callback({
        req: { headers: {} },
        res: mockRes(),
        query: {} // нет code/state
    });

    assert.equal(result.headers.Location, '/?error=missing_params');
    // missing_params — ранний return до любых лимитов.
    assert.equal(limiter.calls.tryAcquireAuthRequest, 0);
    assert.equal(limiter.calls.tryAcquireCallback, 0);
});

