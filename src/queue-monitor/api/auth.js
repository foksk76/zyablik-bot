// SPDX-License-Identifier: Apache-2.0
'use strict';

const crypto = require('node:crypto');
const { readSession, safeEqual } = require('../auth/session');

const MODULE_NAME = 'queue-monitor-bearer-auth';

function createBearerAuth(options = {}) {
    const apiKey = options.apiKey || '';
    const sessionStore = options.sessionStore || null;

    if (!apiKey) {
        throw new Error('apiKey is required — configure METRICS_API_KEY');
    }

    function checkBearer(req) {
        const authHeader = req.headers.authorization || '';
        const match = authHeader.match(/^Bearer\s+(.+)$/i);

        if (!match) {
            return false;
        }

        const token = match[1];

        if (!safeEqual(apiKey, token)) {
            return false;
        }

        return true;
    }

    // Публичный API: authenticate(req, res) → boolean + отправляет 401 при провале.
    function authenticate(req, res) {
        if (checkBearer(req)) {
            return true;
        }
        sendUnauthorized(res);
        return false;
    }

    function authenticateSession(req) {
        if (!sessionStore) {
            return false;
        }
        const session = readSession(req, sessionStore);
        return Boolean(session);
    }

    function protectRoute(handler) {
        return (ctx) => {
            if (checkBearer(ctx.req)) {
                return handler(ctx);
            }
            if (authenticateSession(ctx.req)) {
                return handler(ctx);
            }
            sendUnauthorized(ctx.res);
            return undefined;
        };
    }

    function sendUnauthorized(res) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    return {
        authenticate,
        protectRoute
    };
}

module.exports = {
    MODULE_NAME,
    createBearerAuth
};
