const test = require('node:test');
const assert = require('node:assert/strict');

const { createBearerAuth } = require('../../../src/queue-monitor/api/auth');
const { signSessionCookie } = require('../../../src/queue-monitor/auth/session');

function mockReq(headers = {}) {
    return { headers };
}

function mockRes() {
    let statusCode;
    let body;
    return {
        get statusCode() { return statusCode; },
        get body() { return body; },
        writeHead(code) { statusCode = code; },
        end(json) { body = json; }
    };
}

function createMockSessionStore(sessionData, secret) {
    const sessions = new Map();
    if (sessionData) {
        sessions.set(sessionData.sessionId, sessionData);
    }
    return {
        secret,
        get(sessionId) { return sessions.get(sessionId) || null; }
    };
}

function createSignedSessionCookie(sessionId, csrf, secret) {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const value = signSessionCookie(secret, sessionId, csrf, expiresAt);
    return `session=${value}`;
}

test('createBearerAuth throws when apiKey is empty', () => {
    assert.throws(
        () => createBearerAuth({ apiKey: '' }),
        /apiKey is required/
    );
});

test('authenticate returns true for valid Bearer token', () => {
    const auth = createBearerAuth({ apiKey: 'test-secret-123' });
    const req = mockReq({ authorization: 'Bearer test-secret-123' });
    const res = mockRes();

    assert.equal(auth.authenticate(req, res), true);
});

test('authenticate returns false for missing Authorization header', () => {
    const auth = createBearerAuth({ apiKey: 'test-secret-123' });
    const req = mockReq({});
    const res = mockRes();

    assert.equal(auth.authenticate(req, res), false);
    assert.equal(res.statusCode, 401);
});

test('authenticate returns false for wrong token', () => {
    const auth = createBearerAuth({ apiKey: 'test-secret-123' });
    const req = mockReq({ authorization: 'Bearer wrong-token' });
    const res = mockRes();

    assert.equal(auth.authenticate(req, res), false);
    assert.equal(res.statusCode, 401);
});

test('authenticate returns false for non-Bearer auth scheme', () => {
    const auth = createBearerAuth({ apiKey: 'test-secret-123' });
    const req = mockReq({ authorization: 'Basic dXNlcjpwYXNz' });
    const res = mockRes();

    assert.equal(auth.authenticate(req, res), false);
    assert.equal(res.statusCode, 401);
});

test('authenticate returns false for empty Bearer value', () => {
    const auth = createBearerAuth({ apiKey: 'test-secret-123' });
    const req = mockReq({ authorization: 'Bearer ' });
    const res = mockRes();

    assert.equal(auth.authenticate(req, res), false);
    assert.equal(res.statusCode, 401);
});

test('protectRoute calls handler when Bearer auth passes', () => {
    const auth = createBearerAuth({ apiKey: 'test-secret-123' });
    const handler = (ctx) => ({ statusCode: 200, body: { ok: true } });
    const protectedHandler = auth.protectRoute(handler);

    const ctx = {
        req: mockReq({ authorization: 'Bearer test-secret-123' }),
        res: mockRes()
    };

    const result = protectedHandler(ctx);
    assert.equal(result.body.ok, true);
});

test('protectRoute returns undefined when auth fails', () => {
    const auth = createBearerAuth({ apiKey: 'test-secret-123' });
    const handler = (ctx) => ({ statusCode: 200, body: { ok: true } });
    const protectedHandler = auth.protectRoute(handler);

    const ctx = {
        req: mockReq({}),
        res: mockRes()
    };

    const result = protectedHandler(ctx);
    assert.equal(result, undefined);
    assert.equal(ctx.res.statusCode, 401);
});

test('protectRoute returns 401 for expired session cookie', () => {
    const secret = 'test-session-secret-32-chars-long!!';
    const sessionData = { sessionId: 'sess-expired', user: { sub: 'operator' }, csrf: 'csrf-token' };
    const sessionStore = createMockSessionStore(sessionData, secret);

    // Create cookie with expiresAt in the past
    const { signSessionCookie: sign } = require('../../../src/queue-monitor/auth/session');
    const expiredAt = Math.floor(Date.now() / 1000) - 3600;
    const value = sign(secret, 'sess-expired', 'csrf-token', expiredAt);
    const cookie = `session=${value}`;

    const auth = createBearerAuth({ apiKey: 'test-secret-123', sessionStore });
    const handler = (ctx) => ({ statusCode: 200, body: { ok: true } });
    const protectedHandler = auth.protectRoute(handler);

    const ctx = {
        req: mockReq({ cookie }),
        res: mockRes()
    };

    const result = protectedHandler(ctx);
    assert.equal(result, undefined);
    assert.equal(ctx.res.statusCode, 401);
});

test('timing-safe comparison prevents timing attacks', () => {
    const auth = createBearerAuth({ apiKey: 'secret' });
    const req1 = mockReq({ authorization: 'Bearer secrete' });
    const req2 = mockReq({ authorization: 'Secret' });
    const res1 = mockRes();
    const res2 = mockRes();

    assert.equal(auth.authenticate(req1, res1), false);
    assert.equal(auth.authenticate(req2, res2), false);
    assert.equal(res1.statusCode, 401);
    assert.equal(res2.statusCode, 401);
});

// --- ADR-0035: session fallback tests ---

test('protectRoute passes when session is valid (no Bearer)', () => {
    const secret = 'test-session-secret-32-chars-long!!';
    const sessionData = { sessionId: 'sess-123', user: { sub: 'operator' }, csrf: 'csrf-token' };
    const sessionStore = createMockSessionStore(sessionData, secret);
    const cookie = createSignedSessionCookie('sess-123', 'csrf-token', secret);

    const auth = createBearerAuth({ apiKey: 'test-secret-123', sessionStore });
    const handler = (ctx) => ({ statusCode: 200, body: { ok: true } });
    const protectedHandler = auth.protectRoute(handler);

    const ctx = {
        req: mockReq({ cookie }),
        res: mockRes()
    };

    const result = protectedHandler(ctx);
    assert.equal(result.body.ok, true);
});

test('protectRoute returns 401 when no Bearer and no session', () => {
    const secret = 'test-session-secret-32-chars-long!!';
    const sessionStore = createMockSessionStore(null, secret);

    const auth = createBearerAuth({ apiKey: 'test-secret-123', sessionStore });
    const handler = (ctx) => ({ statusCode: 200, body: { ok: true } });
    const protectedHandler = auth.protectRoute(handler);

    const ctx = {
        req: mockReq({}),
        res: mockRes()
    };

    const result = protectedHandler(ctx);
    assert.equal(result, undefined);
    assert.equal(ctx.res.statusCode, 401);
});

test('protectRoute prefers Bearer over session', () => {
    const secret = 'test-session-secret-32-chars-long!!';
    const sessionData = { sessionId: 'sess-456', user: { sub: 'operator' }, csrf: 'csrf-token' };
    const sessionStore = createMockSessionStore(sessionData, secret);
    const cookie = createSignedSessionCookie('sess-456', 'csrf-token', secret);

    const auth = createBearerAuth({ apiKey: 'test-secret-123', sessionStore });
    const handler = (ctx) => ({ statusCode: 200, body: { ok: true } });
    const protectedHandler = auth.protectRoute(handler);

    // Bearer + session — Bearer succeeds first
    const ctx = {
        req: mockReq({ authorization: 'Bearer test-secret-123', cookie }),
        res: mockRes()
    };

    const result = protectedHandler(ctx);
    assert.equal(result.body.ok, true);
});

test('protectRoute in bearer-only mode ignores session cookie', () => {
    const auth = createBearerAuth({ apiKey: 'test-secret-123' });
    const handler = (ctx) => ({ statusCode: 200, body: { ok: true } });
    const protectedHandler = auth.protectRoute(handler);

    // Session cookie present but no sessionStore — should fail
    const ctx = {
        req: mockReq({ cookie: 'session=fake.sig' }),
        res: mockRes()
    };

    const result = protectedHandler(ctx);
    assert.equal(result, undefined);
    assert.equal(ctx.res.statusCode, 401);
});

test('protectRoute returns 401 when session not found in store after valid cookie', () => {
    const secret = 'test-session-secret-32-chars-long!!';
    // Empty store — session was purged/destroyed server-side
    const sessionStore = createMockSessionStore(null, secret);
    const cookie = createSignedSessionCookie('sess-purged', 'csrf-token', secret);

    const auth = createBearerAuth({ apiKey: 'test-secret-123', sessionStore });
    const handler = (ctx) => ({ statusCode: 200, body: { ok: true } });
    const protectedHandler = auth.protectRoute(handler);

    const ctx = {
        req: mockReq({ cookie }),
        res: mockRes()
    };

    const result = protectedHandler(ctx);
    assert.equal(result, undefined);
    assert.equal(ctx.res.statusCode, 401);
});
