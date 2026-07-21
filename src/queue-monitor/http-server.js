// SPDX-License-Identifier: Apache-2.0
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const MODULE_NAME = 'queue-monitor-http';

function createMonitorHttpServer(options = {}) {
  const port = options.port || 9000;
  const logger = options.logger || console;
  const routes = options.routes || {};
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

  function sendJson(res, statusCode, body) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
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

    if (!handler) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    try {
      const result = await handler({ req, res, reqId, query, urlPath });
      if (result !== undefined) {
        sendJson(res, result.statusCode || 200, result.body || result);
      }
    } catch (error) {
      logger.error(`[${MODULE_NAME}] handler error`, { reqId, error: error.message });
      sendJson(res, 500, { error: 'Internal server error' });
    }
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
    registerRoute
  };
}

module.exports = {
  MODULE_NAME,
  createMonitorHttpServer
};
