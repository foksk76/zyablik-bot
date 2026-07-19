// SPDX-License-Identifier: Apache-2.0
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { formatLogLine } = require('../core/logger');

const MODULE_NAME = 'ingress-http-server';
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const MAX_API_TEXT_LIMIT = 4000;

function createIngressHttpServer(options = {}) {
  const port = options.port || 8443;
  const jwtAuth = options.jwtAuth;
  const normalizerRegistry = options.normalizerRegistry;
  const queueStore = options.queueStore;
  const outboundClient = options.outboundClient;
  const logger = options.logger || console;
  const maxBodyBytes = options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES;
  const logAudit = options.logAudit !== false;
  const logTrace = options.logTrace !== false;

  let server = null;

  function parseBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let totalBytes = 0;

      req.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBodyBytes) {
          req.destroy();
          reject(new Error('Request body too large'));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(body);
        } catch (error) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  function sendResponse(res, statusCode, body) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  async function handleIngest(req, res) {
    const reqId = crypto.randomUUID();
    const ip = req.socket && req.socket.remoteAddress || 'unknown';

    if (logTrace) {
      logger.info(formatLogLine({
        level: 'info',
        module: MODULE_NAME,
        reqId,
        action: 'ingress',
        context: { method: req.method, path: req.url, from: ip }
      }));
    }

    if (req.method !== 'POST') {
      sendResponse(res, 404, { error: 'Not found' });
      return;
    }

    let body;

    try {
      body = await parseBody(req);
    } catch (error) {
      sendResponse(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      sendResponse(res, 400, { error: 'Invalid request body' });
      return;
    }

    if (body.channel && (!body.recipient || !body.recipient.kind || !body.recipient.value)) {
      sendResponse(res, 501, { error: 'Channel without recipient not supported' });
      return;
    }

    if (!body.recipient || typeof body.recipient !== 'object') {
      sendResponse(res, 400, { error: 'Missing recipient' });
      return;
    }

    let source;

    try {
      const authHeader = req.headers.authorization || '';
      const authResult = await jwtAuth.authenticate(authHeader, { reqId, ip });
      source = authResult.source;
    } catch (error) {
      sendResponse(res, 401, { error: 'Unauthorized' });
      return;
    }

    const normalizer = normalizerRegistry.getNormalizer(source);

    let event;

    try {
      event = normalizer(body, source);
    } catch (error) {
      sendResponse(res, 400, { error: error.message });
      return;
    }

    if (logTrace) {
      logger.info(formatLogLine({
        level: 'info',
        module: MODULE_NAME,
        reqId,
        action: 'normalized',
        context: { recipient: event.recipient }
      }));
    }

    const text = typeof event.message === 'string' ? event.message : (event.message && event.message.text || '');

    if (text.length > MAX_API_TEXT_LIMIT) {
      sendResponse(res, 413, {
        error: `Message text exceeds MAX API limit of ${MAX_API_TEXT_LIMIT} characters (got ${text.length})`
      });
      return;
    }

    try {
      if (queueStore) {
        const outboundResponse = {
          kind: 'text',
          recipient: event.recipient,
          text
        };
        const { id } = queueStore.enqueue({ payload: outboundResponse, source, reqId });

        if (logAudit) {
          logger.info(formatLogLine({
            level: 'info',
            module: MODULE_NAME,
            action: 'message queued',
            context: { id, source, recipient: event.recipient }
          }));
        }

        sendResponse(res, 200, { status: 'queued' });
      } else {
        await outboundClient.send(event);
        sendResponse(res, 200, { status: 'sent' });
      }
    } catch (error) {
      logger.error(formatLogLine({
        level: 'error',
        module: MODULE_NAME,
        reqId,
        action: 'send failed',
        context: { reason: error.message }
      }));
      sendResponse(res, 500, { error: 'Internal server error' });
    }
  }

  function start() {
    return new Promise((resolve, reject) => {
      server = http.createServer(handleIngest);
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

  return {
    start,
    stop
  };
}

module.exports = {
  MODULE_NAME,
  MAX_API_TEXT_LIMIT,
  createIngressHttpServer
};
