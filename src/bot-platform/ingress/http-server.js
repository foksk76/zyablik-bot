'use strict';

const http = require('node:http');

const MODULE_NAME = 'ingress-http-server';
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

function createIngressHttpServer(options = {}) {
  const port = options.port || 8443;
  const jwtAuth = options.jwtAuth;
  const normalizerRegistry = options.normalizerRegistry;
  const queueStore = options.queueStore;
  const outboundClient = options.outboundClient;
  const logger = options.logger || console;
  const maxBodyBytes = options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES;

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

    if (!body || typeof body !== 'object') {
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
      const authResult = await jwtAuth.authenticate(authHeader);
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

    try {
      if (queueStore) {
        const outboundResponse = {
          kind: 'text',
          recipient: event.recipient,
          text: typeof event.message === 'string' ? event.message : (event.message.text || '')
        };
        queueStore.enqueue({ payload: outboundResponse, source });
        sendResponse(res, 200, { status: 'queued' });
      } else {
        await outboundClient.send(event);
        sendResponse(res, 200, { status: 'sent' });
      }
    } catch (error) {
      logger.error(`[${MODULE_NAME}] Send failed: ${error.message}`);
      sendResponse(res, 500, { error: 'Internal server error' });
    }
  }

  function start() {
    return new Promise((resolve) => {
      server = http.createServer(handleIngest);
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
  createIngressHttpServer
};
