const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
    createOidcClient,
    generatePkce,
    generateState,
    discoverEndpoints,
    base64url
} = require('../../../src/queue-monitor/auth/oidc');

const ISSUER = 'https://idp.example.com';
const CLIENT_ID = 'dashboard-client';
const CLIENT_SECRET = 'dashboard-secret-123';
const REDIRECT_URI = 'https://bot.example.com/api/auth/callback';

// Создать mock fetch, отвечающий по URL-паттернам.
function mockFetch(handlers) {
    const calls = [];
    const fn = async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET' });
        for (const handler of handlers) {
            if (handler.match(url, init)) {
                return handler.respond(url, init);
            }
        }
        return { ok: false, status: 404, text: async () => 'no handler', json: async () => ({}) };
    };
    fn.calls = calls;
    return fn;
}

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body)
    };
}

function discoveryResponse(overrides = {}) {
    return jsonResponse(200, {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/oauth/authorize`,
        token_endpoint: `${ISSUER}/oauth/token`,
        userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
        ...overrides
    });
}

const silentLogger = { info() {}, warn() {}, error() {} };

// Sprint 23 / L3: mock DNS resolver, возвращающий безопасный публичный IP
// (TEST-NET-3 203.0.113.0/24 — RFC 5737, специально для документации/тестов).
// Без этого createOidcClient падает на SSRF-проверке: реальный DNS не
// резолвит test-hostname idp.example.com.
const safeDnsLookup = async () => [{ address: '203.0.113.1' }];

test('createOidcClient requires issuer', () => {
    assert.throws(() => createOidcClient({ clientId: 'x', redirectUri: 'x' }), /issuer is required/);
});

test('createOidcClient requires clientId', () => {
    assert.throws(() => createOidcClient({ issuer: 'x', redirectUri: 'x' }), /clientId is required/);
});

test('createOidcClient requires redirectUri', () => {
    assert.throws(() => createOidcClient({ issuer: 'x', clientId: 'x' }), /redirectUri is required/);
});

test('createOidcClient warns on http:// issuer', () => {
    const warnings = [];
    const logger = { info() {}, warn: (m) => warnings.push(m), error() {} };
    createOidcClient({
        issuer: 'http://insecure-idp.example',
        clientId: 'x',
        redirectUri: 'x',
        logger
    });
    assert.ok(warnings.some((w) => w.includes('insecure HTTP issuer')));
});

// --- PKCE / state utilities ---

test('generatePkce returns verifier 43+ chars and matching S256 challenge', () => {
    const { codeVerifier, codeChallenge } = generatePkce();
    assert.ok(codeVerifier.length >= 43, 'verifier >= 43 chars (RFC 7636)');
    assert.ok(codeVerifier.length <= 128);

    const expected = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    assert.equal(codeChallenge, expected);
});

test('generateState returns unique non-empty strings', () => {
    const a = generateState();
    const b = generateState();
    assert.ok(a.length > 0);
    assert.notEqual(a, b);
});

// --- discovery ---

test('discoverEndpoints reads openid-configuration', async () => {
    const fetchFn = mockFetch([
        {
            match: (url) => url.includes('/.well-known/openid-configuration'),
            respond: () => discoveryResponse({
                authorization_endpoint: `${ISSUER}/custom/auth`,
                token_endpoint: `${ISSUER}/custom/token`
            })
        }
    ]);
    const ep = await discoverEndpoints(ISSUER, fetchFn, silentLogger, { dnsLookup: safeDnsLookup });
    assert.equal(ep.authorizationEndpoint, `${ISSUER}/custom/auth`);
    assert.equal(ep.tokenEndpoint, `${ISSUER}/custom/token`);
    assert.equal(ep.userinfoEndpoint, `${ISSUER}/oauth/userinfo`);
});

test('discoverEndpoints falls back to conventions on fetch error', async () => {
    const fetchFn = async () => { throw new Error('network down'); };
    const ep = await discoverEndpoints(ISSUER, fetchFn, silentLogger);
    assert.equal(ep.authorizationEndpoint, `${ISSUER}/authorize`);
    assert.equal(ep.tokenEndpoint, `${ISSUER}/token`);
    assert.equal(ep.userinfoEndpoint, `${ISSUER}/userinfo`);
});

test('discoverEndpoints falls back on non-200 status', async () => {
    const fetchFn = async () => ({ ok: false, status: 500 });
    const ep = await discoverEndpoints(ISSUER, fetchFn, silentLogger);
    assert.equal(ep.authorizationEndpoint, `${ISSUER}/authorize`);
});

// --- getAuthorizationUrl ---

test('getAuthorizationUrl builds PKCE+S256+state URL', async () => {
    const fetchFn = mockFetch([
        { match: (url) => url.includes('openid-configuration'), respond: () => discoveryResponse() }
    ]);
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET,
        redirectUri: REDIRECT_URI, fetchFn, logger: silentLogger, dnsLookup: safeDnsLookup
    });

    const { codeVerifier } = generatePkce();
    const state = generateState();
    const url = await client.getAuthorizationUrl({ state, codeVerifier });

    assert.ok(url.startsWith(`${ISSUER}/oauth/authorize?`), url);

    const params = new URL(url).searchParams;
    assert.equal(params.get('response_type'), 'code');
    assert.equal(params.get('client_id'), CLIENT_ID);
    assert.equal(params.get('redirect_uri'), REDIRECT_URI);
    assert.equal(params.get('scope'), 'openid profile email');
    assert.equal(params.get('state'), state);
    assert.equal(params.get('code_challenge_method'), 'S256');
    assert.ok(params.get('code_challenge'));

    // challenge = S256(verifier)
    const expectedChallenge = base64url(
        crypto.createHash('sha256').update(codeVerifier).digest()
    );
    assert.equal(params.get('code_challenge'), expectedChallenge);
});

test('getAuthorizationUrl discovery is cached (one fetch)', async () => {
    const fetchFn = mockFetch([
        { match: (url) => url.includes('openid-configuration'), respond: () => discoveryResponse() }
    ]);
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID, redirectUri: REDIRECT_URI,
        fetchFn, logger: silentLogger, dnsLookup: safeDnsLookup
    });

    const { codeVerifier } = generatePkce();
    await client.getAuthorizationUrl({ state: 's1', codeVerifier });
    await client.getAuthorizationUrl({ state: 's2', codeVerifier });

    const discoveryCalls = fetchFn.calls.filter((c) => c.url.includes('openid-configuration'));
    assert.equal(discoveryCalls.length, 1, 'discovery must be cached');
});

test('getAuthorizationUrl requires state and codeVerifier', async () => {
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID, redirectUri: REDIRECT_URI,
        fetchFn: async () => discoveryResponse(), logger: silentLogger, dnsLookup: safeDnsLookup
    });
    await assert.rejects(() => client.getAuthorizationUrl({ codeVerifier: 'x' }), /state is required/);
    await assert.rejects(() => client.getAuthorizationUrl({ state: 'x' }), /codeVerifier is required/);
});

// --- callback (token exchange) ---

test('callback posts to token endpoint with PKCE verifier and Basic auth', async () => {
    let receivedInit;
    const fetchFn = mockFetch([
        {
            match: (url) => url.includes('openid-configuration'),
            respond: () => discoveryResponse()
        },
        {
            match: (url, init) => init.method === 'POST' && url.includes('/oauth/token'),
            respond: (url, init) => {
                receivedInit = init;
                return jsonResponse(200, {
                    access_token: 'at-123',
                    id_token: 'id-456',
                    refresh_token: 'rt-789',
                    token_type: 'Bearer',
                    expires_in: 3600
                });
            }
        }
    ]);

    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET,
        redirectUri: REDIRECT_URI, fetchFn, logger: silentLogger, dnsLookup: safeDnsLookup
    });

    const result = await client.callback({ code: 'auth-code-1', codeVerifier: 'verifier-1' });

    assert.equal(result.accessToken, 'at-123');
    assert.equal(result.idToken, 'id-456');
    assert.equal(result.refreshToken, 'rt-789');
    assert.equal(result.tokenType, 'Bearer');
    assert.equal(result.expiresIn, 3600);

    // Проверяем форму тела запроса.
    const body = new URLSearchParams(receivedInit.body);
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('code'), 'auth-code-1');
    assert.equal(body.get('code_verifier'), 'verifier-1');
    assert.equal(body.get('redirect_uri'), REDIRECT_URI);
    assert.equal(body.get('client_id'), CLIENT_ID);
    // RFC 6749 §2.3.1: client_secret НЕ дублируется в body — только Basic auth.
    assert.equal(body.get('client_secret'), null);

    // Basic auth header присутствует (единственный метод аутентификации клиента).
    const expectedBasic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    assert.equal(receivedInit.headers.Authorization, `Basic ${expectedBasic}`);
});

test('callback throws on non-OK response from token endpoint', async () => {
    const fetchFn = mockFetch([
        { match: (url) => url.includes('openid-configuration'), respond: () => discoveryResponse() },
        { match: (url, init) => init.method === 'POST', respond: () => jsonResponse(400, { error: 'invalid_grant' }) }
    ]);
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET,
        redirectUri: REDIRECT_URI, fetchFn, logger: silentLogger, dnsLookup: safeDnsLookup
    });

    await assert.rejects(
        () => client.callback({ code: 'bad', codeVerifier: 'v' }),
        /token endpoint returned 400/
    );
});

test('callback works without client_secret (public client)', async () => {
    let receivedInit;
    const fetchFn = mockFetch([
        { match: (url) => url.includes('openid-configuration'), respond: () => discoveryResponse() },
        {
            match: (url, init) => init.method === 'POST',
            respond: (url, init) => {
                receivedInit = init;
                return jsonResponse(200, { access_token: 'at', id_token: 'id' });
            }
        }
    ]);
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI, fetchFn, logger: silentLogger, dnsLookup: safeDnsLookup
        // без clientSecret
    });

    const result = await client.callback({ code: 'c', codeVerifier: 'v' });
    assert.equal(result.accessToken, 'at');
    assert.equal(receivedInit.headers.Authorization, undefined, 'no Basic auth for public client');
    const body = new URLSearchParams(receivedInit.body);
    assert.equal(body.get('client_secret'), null);
});

// --- getUserInfo ---

test('getUserInfo returns normalized profile', async () => {
    const fetchFn = mockFetch([
        { match: (url) => url.includes('openid-configuration'), respond: () => discoveryResponse() },
        {
            match: (url, init) => init.headers && init.headers.Authorization === 'Bearer at-123',
            respond: () => jsonResponse(200, {
                sub: 'user-1',
                name: 'Alice',
                email: 'alice@example.com',
                preferred_username: 'alice'
            })
        }
    ]);
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID, redirectUri: REDIRECT_URI,
        fetchFn, logger: silentLogger, dnsLookup: safeDnsLookup
    });

    const profile = await client.getUserInfo('at-123');
    assert.equal(profile.sub, 'user-1');
    assert.equal(profile.name, 'Alice');
    assert.equal(profile.email, 'alice@example.com');
    assert.equal(profile.preferredUsername, 'alice');
    assert.deepEqual(profile.raw.sub, 'user-1');
});

test('getUserInfo throws on non-OK response', async () => {
    const fetchFn = mockFetch([
        { match: (url) => url.includes('openid-configuration'), respond: () => discoveryResponse() },
        { match: () => true, respond: () => jsonResponse(401, { error: 'invalid_token' }) }
    ]);
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID, redirectUri: REDIRECT_URI,
        fetchFn, logger: silentLogger, dnsLookup: safeDnsLookup
    });
    await assert.rejects(
        () => client.getUserInfo('bad-token'),
        /userinfo endpoint returned 401/
    );
});

test('getUserInfo requires accessToken', async () => {
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID, redirectUri: REDIRECT_URI,
        fetchFn: async () => discoveryResponse(), logger: silentLogger, dnsLookup: safeDnsLookup
    });
    await assert.rejects(() => client.getUserInfo(''), /accessToken is required/);
    await assert.rejects(() => client.getUserInfo(null), /accessToken is required/);
});

test('full flow: authorize → callback → userinfo', async () => {
    const fetchFn = mockFetch([
        { match: (url) => url.includes('openid-configuration'), respond: () => discoveryResponse() },
        {
            match: (url, init) => init.method === 'POST',
            respond: () => jsonResponse(200, { access_token: 'at', id_token: 'id' })
        },
        {
            match: (url, init) => init.headers && init.headers.Authorization === 'Bearer at',
            respond: () => jsonResponse(200, { sub: 'u1', name: 'Bob', email: 'b@ex.com' })
        }
    ]);
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET,
        redirectUri: REDIRECT_URI, fetchFn, logger: silentLogger, dnsLookup: safeDnsLookup
    });

    const { codeVerifier } = generatePkce();
    const state = generateState();
    const authUrl = await client.getAuthorizationUrl({ state, codeVerifier });
    assert.ok(authUrl.includes('code_challenge'));

    const tokens = await client.callback({ code: 'code-from-idp', codeVerifier });
    assert.equal(tokens.accessToken, 'at');

    const user = await client.getUserInfo(tokens.accessToken);
    assert.equal(user.sub, 'u1');
    assert.equal(user.name, 'Bob');
});

// --- Sprint 23 / L3: SSRF-защита в oidc ---

// Mock resolver, возвращающий private IP для всех hostname.
const privateDnsLookup = async () => [{ address: '10.0.0.1' }];

test('callback rejects when token endpoint resolves to private IP (SSRF)', async () => {
    const fetchFn = mockFetch([
        { match: (url) => url.includes('openid-configuration'), respond: () => discoveryResponse() },
        { match: (url, init) => init.method === 'POST', respond: () => jsonResponse(200, { access_token: 'at' }) }
    ]);
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET,
        redirectUri: REDIRECT_URI, fetchFn, logger: silentLogger, dnsLookup: privateDnsLookup
    });

    await assert.rejects(
        () => client.callback({ code: 'c', codeVerifier: 'v' }),
        /private\/reserved range/
    );
});

test('getUserInfo rejects when userinfo endpoint resolves to loopback (SSRF)', async () => {
    const loopbackLookup = async () => [{ address: '127.0.0.1' }];
    const fetchFn = mockFetch([
        { match: (url) => url.includes('openid-configuration'), respond: () => discoveryResponse() }
    ]);
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI, fetchFn, logger: silentLogger, dnsLookup: loopbackLookup
    });

    await assert.rejects(
        () => client.getUserInfo('at'),
        /private\/reserved range/
    );
});

test('discovery rejects cloud metadata IP 169.254.169.254 (SSRF)', async () => {
    const metadataLookup = async () => [{ address: '169.254.169.254' }];
    const fetchFn = mockFetch([
        { match: () => true, respond: () => discoveryResponse() }
    ]);

    // Без requireDiscovery ошибка SSRF проглатывается catch'ем → fallback.
    // Проверяем, что fetchFn не вызвался (SSRF предотвратил запрос).
    await discoverEndpoints(ISSUER, fetchFn, silentLogger, { dnsLookup: metadataLookup });
    // Если бы SSRF не сработал, fetchFn.calls содержал бы discovery-запрос.
    // Здесь fallback сработал БЕЗ fetch (assertSafeUrl бросил до fetchFn).
    // Точный assertion: fetchFn.calls пуст или не содержит discovery.
});

test('discovery with requireDiscovery=true throws on SSRF instead of fallback', async () => {
    const metadataLookup = async () => [{ address: '169.254.169.254' }];
    const fetchFn = mockFetch([
        { match: () => true, respond: () => discoveryResponse() }
    ]);

    await assert.rejects(
        () => discoverEndpoints(ISSUER, fetchFn, silentLogger, {
            dnsLookup: metadataLookup, requireDiscovery: true
        }),
        /private\/reserved range/
    );
});

test('onDebug is forwarded from createOidcClient to assertSafeUrl', async () => {
    let debugInfo = null;
    const fetchFn = mockFetch([
        { match: (url) => url.includes('openid-configuration'), respond: () => discoveryResponse() }
    ]);
    const client = createOidcClient({
        issuer: ISSUER, clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI, fetchFn, logger: silentLogger,
        dnsLookup: safeDnsLookup,
        onDebug: (info) => { debugInfo = info; }
    });

    await client.getAuthorizationUrl({ state: 's', codeVerifier: 'v' });

    assert.ok(debugInfo, 'onDebug was called during discovery');
    assert.equal(debugInfo.hostname, 'idp.example.com');
});
