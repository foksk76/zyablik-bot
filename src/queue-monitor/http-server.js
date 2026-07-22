// SPDX-License-Identifier: Apache-2.0
'use strict';

// ADR-0023: stdlib `http.createServer` — без HTTP-фреймворков.
// Handler-контракт: (ctx) => { statusCode, headers?, body? } | undefined
//   - undefined: handler сам записал ответ в ctx.res (например, потоковая отдача)
//   - headers: применяются к ответу (Location для redirect, Set-Cookie, Content-Type override)
// Static serving: если route не найден И путь не /api/* И не /readyz И задан staticDir,
// отдаём файл из staticDir; при отсутствии файла — SPA-fallback на index.html.

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MODULE_NAME = 'queue-monitor-http';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

function createMonitorHttpServer(options = {}) {
    const port = options.port || 9000;
    const logger = options.logger || console;
    const routes = options.routes || {};
    const staticDir = options.staticDir || null;
    let server = null;

    function parseQuery(url) {
        const idx = url.indexOf('?');
        if (idx === -1) {
            return {};
        }
        const search = url.slice(idx + 1);
        const params = {};
        for (const pair of search.split('&')) {
            const eqIdx = pair.indexOf('=');
            const key = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
            const value = eqIdx === -1 ? '' : pair.slice(eqIdx + 1);
            if (key) {
                params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
            }
        }
        return params;
    }

    function sendJson(res, statusCode, body, headers) {
        const responseHeaders = { 'Content-Type': 'application/json' };
        if (headers) {
            Object.assign(responseHeaders, headers);
        }
        res.writeHead(statusCode, responseHeaders);
        res.end(JSON.stringify(body));
    }

    function sendRedirect(res, statusCode, headers) {
        // Для redirect тело не нужно; Location обязателен.
        res.writeHead(statusCode, headers);
        res.end();
    }

    // Безопасно отрезолвить urlPath внутри staticDir. Возвращает абсолютный путь
    // к файлу или null (если path выходит за пределы staticDir / некорректен).
    function resolveStaticPath(urlPath) {
        if (!staticDir) {
            return null;
        }
        // Берём pathname, обрезаем query (на всякий случай — urlPath уже без query,
        // но дублируем для надёжности).
        const cleanPath = urlPath.split('?')[0];

        // decodeURIComponent может бросить на невалидном %; ловим.
        let decoded;
        try {
            decoded = decodeURIComponent(cleanPath);
        } catch {
            return null;
        }

        // Защита от path traversal: нормализуем и проверяем, что результат внутри staticDir.
        const root = path.resolve(staticDir);
        const resolved = path.resolve(root, '.' + decoded);

        if (resolved !== root && !resolved.startsWith(root + path.sep)) {
            return null;
        }
        return resolved;
    }

    // Отдать статический файл или index.html (SPA fallback). Возвращает true, если
    // ответ записан (файл найден или fallback сработал), false — если отдавать нечего.
    // Асинхронно (fs.promises) — не блокирует event loop при отдаче ассетов.
    async function serveStatic(req, res, urlPath) {
        if (!staticDir) {
            return false;
        }
        const filePath = resolveStaticPath(urlPath);
        if (!filePath) {
            return false;
        }

        // Если запрос директории или корня — отдаём index.html.
        let candidate = filePath;
        const tryFiles = [candidate];
        if (urlPath === '/' || urlPath === '') {
            tryFiles[0] = path.join(staticDir, 'index.html');
        }

        for (const f of tryFiles) {
            if (await fileExists(f)) {
                await writeStaticFile(res, f);
                return true;
            }
        }

        // SPA fallback: если файл не найден и это не ассет — отдаём index.html,
        // чтобы client-side routing отработал.
        const indexPath = path.join(staticDir, 'index.html');
        if (await fileExists(indexPath)) {
            await writeStaticFile(res, indexPath);
            return true;
        }
        return false;
    }

    // Асинхронная проверка существования файла (без блокировки event loop).
    async function fileExists(f) {
        try {
            const stat = await fs.promises.stat(f);
            return stat.isFile();
        } catch {
            return false;
        }
    }

    async function writeStaticFile(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        try {
            const data = await fs.promises.readFile(filePath);
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': data.length
            });
            res.end(data);
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to read static file' }));
            logger.error(`[${MODULE_NAME}] static file read failed`, {
                path: filePath,
                error: error.message
            });
        }
    }

    async function handleRequest(req, res) {
        const reqId = crypto.randomUUID();
        const urlPath = req.url.split('?')[0];

        let query;
        try {
            query = parseQuery(req.url);
        } catch {
            sendJson(res, 400, { error: 'Malformed query string' });
            return;
        }

        const method = req.method;

        const routeKey = `${method} ${urlPath}`;
        const handler = routes[routeKey] || routes[urlPath];

        if (handler) {
            try {
                const result = await handler({ req, res, reqId, query, urlPath });
                if (result !== undefined) {
                    const statusCode = result.statusCode || 200;
                    // Redirect: Location в headers, тело не нужно.
                    if (statusCode >= 300 && statusCode < 400) {
                        sendRedirect(res, statusCode, result.headers || {});
                    } else if (result.body !== undefined) {
                        sendJson(res, statusCode, result.body, result.headers);
                    } else {
                        // Только headers (например, 204 No Content).
                        res.writeHead(statusCode, result.headers || {});
                        res.end();
                    }
                }
            } catch (error) {
                logger.error(`[${MODULE_NAME}] handler error`, { reqId, error: error.message });
                sendJson(res, 500, { error: 'Internal server error' });
            }
            return;
        }

        // Нет route: пробуем static serving для GET-запросов, кроме /api/* и /readyz.
        if (method === 'GET' && !urlPath.startsWith('/api/') && urlPath !== '/readyz') {
            if (await serveStatic(req, res, urlPath)) {
                return;
            }
        }

        sendJson(res, 404, { error: 'Not found' });
    }

    function start() {
        return new Promise((resolve, reject) => {
            server = http.createServer(handleRequest);
            server.on('error', reject);
            server.listen(port, () => {
                logger.info(`[${MODULE_NAME}] Listening on port ${port}`);
                resolve();
            });
        });
    }

    function stop() {
        return new Promise((resolve, reject) => {
            if (!server) {
                resolve();
                return;
            }
            server.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    function registerRoute(method, path, handler) {
        routes[`${method} ${path}`] = handler;
    }

    return {
        start,
        stop,
        registerRoute,
        _resolveStaticPath: resolveStaticPath,
        _serveStatic: serveStatic
    };
}

module.exports = {
    MODULE_NAME,
    MIME_TYPES,
    createMonitorHttpServer
};
