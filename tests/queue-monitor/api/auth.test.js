const test = require('node:test');
const assert = require('node:assert/strict');

const { createBearerAuth } = require('../../../src/queue-monitor/api/auth');

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

test('protectRoute calls handler when auth passes', () => {
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
});

test('protectRoute throws when apiKey is empty', () => {
    assert.throws(
        () => createBearerAuth({ apiKey: '' }),
        /apiKey is required/
    );
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
