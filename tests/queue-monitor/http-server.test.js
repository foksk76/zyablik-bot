const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMonitorHttpServer } = require('../../src/queue-monitor/http-server');

function get(url, port) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${url}`, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(body) });
                } catch {
                    resolve({ status: res.statusCode, body });
                }
            });
        }).on('error', reject);
    });
}

test('createMonitorHttpServer returns object with start/stop/registerRoute', () => {
    const server = createMonitorHttpServer({ port: 19001 });

    assert.equal(typeof server.start, 'function');
    assert.equal(typeof server.stop, 'function');
    assert.equal(typeof server.registerRoute, 'function');
});

test('server returns 404 for unknown routes', async () => {
    const server = createMonitorHttpServer({ port: 19002 });
    await server.start();

    const res = await get('/unknown', 19002);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Not found');

    await server.stop();
});

test('server handles registered GET route', async () => {
    const server = createMonitorHttpServer({ port: 19003 });
    server.registerRoute('GET', '/test', () => ({ statusCode: 200, body: { ok: true } }));
    await server.start();

    const res = await get('/test', 19003);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    await server.stop();
});

test('server passes query params to handler', async () => {
    const server = createMonitorHttpServer({ port: 19004 });
    let receivedQuery;
    server.registerRoute('GET', '/query', (ctx) => {
        receivedQuery = ctx.query;
        return { statusCode: 200, body: { query: ctx.query } };
    });
    await server.start();

    const res = await get('/query?window=1h&limit=5', 19004);
    assert.equal(res.status, 200);
    assert.equal(receivedQuery.window, '1h');
    assert.equal(receivedQuery.limit, '5');

    await server.stop();
});

test('server handles handler errors gracefully', async () => {
    const server = createMonitorHttpServer({ port: 19005 });
    server.registerRoute('GET', '/error', () => {
        throw new Error('boom');
    });
    await server.start();

    const res = await get('/error', 19005);
    assert.equal(res.status, 500);
    assert.equal(res.body.error, 'Internal server error');

    await server.stop();
});

test('server returns early when handler returns undefined', async () => {
    const server = createMonitorHttpServer({ port: 19006 });
    let resRef;
    server.registerRoute('GET', '/noop', (ctx) => {
        resRef = ctx.res;
        ctx.res.writeHead(204);
        ctx.res.end();
    });
    await server.start();

    const result = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:19006/noop', (res) => {
            resolve({ status: res.statusCode });
        }).on('error', reject);
    });
    assert.equal(result.status, 204);

    await server.stop();
});

test('stop resolves when server was never started', async () => {
    const server = createMonitorHttpServer({ port: 19007 });
    await server.stop();
});

test('start and stop lifecycle works', async () => {
    const server = createMonitorHttpServer({ port: 19008 });
    await server.start();
    const res = await get('/test', 19008);
    assert.equal(res.status, 404);
    await server.stop();
});

test('server provides reqId in context', async () => {
    const server = createMonitorHttpServer({ port: 19009 });
    let capturedReqId;
    server.registerRoute('GET', '/reqid', (ctx) => {
        capturedReqId = ctx.reqId;
        return { statusCode: 200, body: { reqId: ctx.reqId } };
    });
    await server.start();

    const res = await get('/reqid', 19009);
    assert.equal(res.status, 200);
    assert.equal(typeof capturedReqId, 'string');
    assert.ok(capturedReqId.length > 0);

    await server.stop();
});

// --- Headers support (redirect, Set-Cookie) ---

test('handler returning redirect statusCode applies Location header without body', async () => {
    const server = createMonitorHttpServer({ port: 19010 });
    server.registerRoute('GET', '/redir', () => ({
        statusCode: 302,
        headers: { Location: 'https://idp.example/authorize' }
    }));
    await server.start();

    const res = await get('/redir', 19010);
    assert.equal(res.status, 302);
    // raw response: проверяем Location через повторный запрос без auto-redirect
    assert.equal(res.body, ''); // redirect не имеет тела

    await server.stop();
});

test('handler returning redirect preserves Location header (raw)', async () => {
    const server = createMonitorHttpServer({ port: 19011 });
    server.registerRoute('GET', '/go', () => ({
        statusCode: 302,
        headers: { Location: '/destination' }
    }));
    await server.start();

    const location = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:19011/go', (res) => {
            resolve(res.headers.location);
            res.resume();
        }).on('error', reject);
    });
    assert.equal(location, '/destination');

    await server.stop();
});

test('handler can override Content-Type via headers', async () => {
    const server = createMonitorHttpServer({ port: 19012 });
    server.registerRoute('GET', '/custom', () => ({
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: { ok: true }
    }));
    await server.start();

    const contentType = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:19012/custom', (res) => {
            resolve(res.headers['content-type']);
            res.resume();
        }).on('error', reject);
    });
    assert.equal(contentType, 'text/plain');

    await server.stop();
});

// --- Static serving ---

function tmpStaticDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qm-static-'));
    return dir;
}

test('static serving serves index.html for GET /', async () => {
    const dir = tmpStaticDir();
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>Dashboard</body></html>');
    try {
        const server = createMonitorHttpServer({ port: 19013, staticDir: dir });
        await server.start();

        const contentType = await new Promise((resolve, reject) => {
            http.get('http://127.0.0.1:19013/', (res) => {
                let body = '';
                res.on('data', (c) => { body += c; });
                res.on('end', () => {
                    resolve({ status: res.statusCode, type: res.headers['content-type'], body });
                });
            }).on('error', reject);
        });

        assert.equal(contentType.status, 200);
        assert.equal(contentType.type, 'text/html; charset=utf-8');
        assert.ok(contentType.body.includes('Dashboard'));

        await server.stop();
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('static serving serves assets with correct MIME types', async () => {
    const dir = tmpStaticDir();
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("hi");');
    fs.writeFileSync(path.join(dir, 'style.css'), 'body { color: red; }');
    fs.writeFileSync(path.join(dir, 'logo.svg'), '<svg></svg>');
    try {
        const server = createMonitorHttpServer({ port: 19014, staticDir: dir });
        await server.start();

        async function fetchHead(urlPath) {
            return new Promise((resolve, reject) => {
                http.get(`http://127.0.0.1:19014${urlPath}`, (res) => {
                    resolve({ status: res.statusCode, type: res.headers['content-type'] });
                    res.resume();
                }).on('error', reject);
            });
        }

        assert.equal((await fetchHead('/app.js')).type, 'text/javascript; charset=utf-8');
        assert.equal((await fetchHead('/style.css')).type, 'text/css; charset=utf-8');
        assert.equal((await fetchHead('/logo.svg')).type, 'image/svg+xml');

        await server.stop();
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('static serving SPA-fallback returns index.html for unknown paths', async () => {
    const dir = tmpStaticDir();
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>SPA</html>');
    try {
        const server = createMonitorHttpServer({ port: 19015, staticDir: dir });
        await server.start();

        const result = await new Promise((resolve, reject) => {
            http.get('http://127.0.0.1:19015/some/client/route', (res) => {
                let body = '';
                res.on('data', (c) => { body += c; });
                res.on('end', () => resolve({ status: res.statusCode, body }));
            }).on('error', reject);
        });

        assert.equal(result.status, 200);
        assert.ok(result.body.includes('SPA'));

        await server.stop();
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('static serving does NOT intercept /api/* routes', async () => {
    const dir = tmpStaticDir();
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>SPA</html>');
    try {
        const server = createMonitorHttpServer({ port: 19016, staticDir: dir });
        await server.start();

        const res = await get('/api/metrics/summary', 19016);
        assert.equal(res.status, 404, '/api/* falls through to 404 when no route registered');

        await server.stop();
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('static serving does NOT intercept /readyz', async () => {
    const dir = tmpStaticDir();
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>SPA</html>');
    fs.writeFileSync(path.join(dir, 'readyz'), 'should-not-serve');
    try {
        const server = createMonitorHttpServer({ port: 19017, staticDir: dir });
        await server.start();

        const res = await get('/readyz', 19017);
        assert.equal(res.status, 404, '/readyz falls through, static file ignored');

        await server.stop();
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('static serving blocks path traversal', () => {
    const dir = tmpStaticDir();
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'TOPSECRET');
    try {
        const server = createMonitorHttpServer({ port: 19018, staticDir: dir });

        // Traversal через ../ должен возвращать null (путь выходит за staticDir).
        assert.equal(server._resolveStaticPath('/../secret.txt'), null, '../ blocked');
        assert.equal(server._resolveStaticPath('/../../etc/passwd'), null, '../../ blocked');

        // Валидный вложенный путь резолвится внутри dir.
        fs.mkdirSync(path.join(dir, 'css'));
        fs.writeFileSync(path.join(dir, 'css', 'app.css'), 'body{}');
        const valid = server._resolveStaticPath('/css/app.css');
        assert.equal(valid, path.join(dir, 'css', 'app.css'));
        assert.ok(valid.startsWith(dir + path.sep));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('server decodes + as space in query params (URL form encoding)', async () => {
    const server = createMonitorHttpServer({ port: 19020 });
    let receivedQuery;
    server.registerRoute('GET', '/search', (ctx) => {
        receivedQuery = ctx.query;
        return { statusCode: 200, body: { query: ctx.query } };
    });
    await server.start();

    const res = await get('/search?search=%D0%A1%D0%B5%D1%80%D0%B2%D0%B5%D1%80+ELK', 19020);
    assert.equal(res.status, 200);
    assert.equal(receivedQuery.search, 'Сервер ELK', '+ decoded as space');

    await server.stop();
});

test('static serving returns 404 when staticDir has no index.html and route missing', async () => {
    const dir = tmpStaticDir();
    // пустая директория, без index.html
    try {
        const server = createMonitorHttpServer({ port: 19019, staticDir: dir });
        await server.start();

        const res = await get('/nonexistent', 19019);
        assert.equal(res.status, 404);

        await server.stop();
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
