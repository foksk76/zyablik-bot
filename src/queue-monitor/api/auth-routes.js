// SPDX-License-Identifier: Apache-2.0
'use strict';

// ADR-0034: OAuth2 Authorization Code + PKCE endpoints для UI dashboard.
// Handler'ы следуют существующей контракции queue-monitor:
//   (ctx) => { statusCode, headers?, body? } | undefined
// http-server.js применит headers (Location, Set-Cookie) к ответу.
//
// CSRF-защита: state = random, сохраняется в short-lived подписанном cookie
// (oauth_state) и сверяется в callback. PKCE S256 обязателен.

const { generatePkce, generateState } = require('../auth/oidc');
const {
    readSession,
    setSessionCookie,
    clearSessionCookie,
    setStateCookie,
    readStateCookie,
    clearStateCookie,
    safeEqual,
    STATE_COOKIE_NAME
} = require('../auth/session');

const MODULE_NAME = 'queue-monitor-auth-routes';

function createAuthRoutes(options = {}) {
    const oidcClient = options.oidcClient;
    const sessionStore = options.sessionStore;
    const secure = options.secure === true;
    const logger = options.logger || console;

    if (!oidcClient) {
        throw new Error('oidcClient is required');
    }
    if (!sessionStore) {
        throw new Error('sessionStore is required');
    }

    // GET /api/auth/login — redirect на IdP authorization URL.
    // Генерирует state + PKCE verifier, кладёт в oauth_state cookie, 302 на IdP.
    async function login(ctx) {
        const { codeVerifier } = generatePkce();
        const state = generateState();

        setStateCookie(ctx.res, sessionStore.secret, { state, codeVerifier }, { secure });

        try {
            const authUrl = await oidcClient.getAuthorizationUrl({ state, codeVerifier });
            return {
                statusCode: 302,
                headers: { Location: authUrl }
            };
        } catch (error) {
            logger.error(`[${MODULE_NAME}] login: failed to build authorization URL`, {
                error: error.message
            });
            return redirectWithError('/', 'auth_failed');
        }
    }

    // GET /api/auth/callback?code=&state= — обмен code на токены, создание session.
    async function callback(ctx) {
        const { code, state } = ctx.query || {};

        if (!code || !state) {
            clearStateCookie(ctx.res, { secure });
            return redirectWithError('/', 'missing_params');
        }

        // Сверяем state с подписанным oauth_state cookie (CSRF-echo).
        const stored = readStateCookie(ctx.req, sessionStore.secret);
        clearStateCookie(ctx.res, { secure }); // однократный использования

        if (!stored || stored.state !== state) {
            return redirectWithError('/', 'state_mismatch');
        }

        try {
            const tokens = await oidcClient.callback({
                code,
                codeVerifier: stored.codeVerifier
            });
            const user = await oidcClient.getUserInfo(tokens.accessToken);

            const { sessionId, csrf, expiresAt } = sessionStore.create(user);
            setSessionCookie(ctx.res, sessionStore, sessionId, csrf, expiresAt, { secure });

            return {
                statusCode: 302,
                headers: { Location: '/' }
            };
        } catch (error) {
            logger.error(`[${MODULE_NAME}] callback: OAuth2 exchange failed`, {
                error: error.message
            });
            return redirectWithError('/', 'auth_failed');
        }
    }

    // POST /api/auth/logout — проверка CSRF (X-CSRF-Token header), destroy session.
    function logout(ctx) {
        const session = readSession(ctx.req, sessionStore);

        // Если нет активной сессии — просто редирект на /.
        if (!session) {
            clearSessionCookie(ctx.res, { secure });
            return {
                statusCode: 302,
                headers: { Location: '/' }
            };
        }

        // CSRF: X-CSRF-Token должен совпадать с session.csrf (timing-safe сравнение,
        // как и для cookie-подписей — иначе plain !== утечёт токен по timing).
        const providedToken = ctx.req.headers['x-csrf-token'];
        if (!providedToken || !safeEqual(providedToken, session.csrf)) {
            return {
                statusCode: 403,
                body: { status: 'error', error: 'CSRF token missing or invalid' }
            };
        }

        sessionStore.destroy(session.sessionId);
        clearSessionCookie(ctx.res, { secure });

        return {
            statusCode: 302,
            headers: { Location: '/' }
        };
    }

    // GET /api/auth/session — статус аутентификации для UI.
    function session(ctx) {
        const current = readSession(ctx.req, sessionStore);
        if (!current) {
            return {
                statusCode: 200,
                body: { authenticated: false }
            };
        }
        return {
            statusCode: 200,
            body: {
                authenticated: true,
                user: current.user,
                csrf: current.csrf
            }
        };
    }

    function redirectWithError(path, errorCode) {
        return {
            statusCode: 302,
            headers: { Location: `${path}?error=${errorCode}` }
        };
    }

    return { login, callback, logout, session };
}

module.exports = {
    MODULE_NAME,
    STATE_COOKIE_NAME,
    createAuthRoutes
};
