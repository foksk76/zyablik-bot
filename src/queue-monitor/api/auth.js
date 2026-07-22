// SPDX-License-Identifier: Apache-2.0
'use strict';

const crypto = require('node:crypto');

const MODULE_NAME = 'queue-monitor-bearer-auth';

function createBearerAuth(options = {}) {
    const apiKey = options.apiKey || '';

    if (!apiKey) {
        throw new Error('apiKey is required — configure METRICS_API_KEY');
    }

    function authenticate(req, res) {
        const authHeader = req.headers.authorization || '';
        const match = authHeader.match(/^Bearer\s+(.+)$/i);

        if (!match) {
            sendUnauthorized(res);
            return false;
        }

        const token = match[1];
        const expected = Buffer.from(apiKey, 'utf8');
        const received = Buffer.from(token, 'utf8');

        if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
            sendUnauthorized(res);
            return false;
        }

        return true;
    }

    function protectRoute(handler) {
        return (ctx) => {
            if (!authenticate(ctx.req, ctx.res)) {
                return;
            }
            return handler(ctx);
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
