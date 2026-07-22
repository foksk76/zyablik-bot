// SPDX-License-Identifier: Apache-2.0
'use strict';

// ADR-0034 (поправка 2026-07-21): hand-rolled OIDC-клиент на stdlib.
// Authorization Code + PKCE (S256). Без openid-client (ESM-only, 3-я JWT-библиотека).
// Паттерн зеркалирует src/bot-platform/ingress/oidc-verifier.js.
//
// Логирование через logger.error/warn — БЕЗ токенов (ADR-0013).

const crypto = require('node:crypto');

const MODULE_NAME = 'queue-monitor-oidc';
const DEFAULT_SCOPE = 'openid profile email';
const DISCOVERY_PATH = '/.well-known/openid-configuration';

function base64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Сгенерировать PKCE code_verifier (43-128 chars, base64url random).
// Возвращает { codeVerifier, codeChallenge } где codeChallenge = S256(verifier).
function generatePkce() {
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    return { codeVerifier, codeChallenge };
}

// Сгенерировать непредсказуемый state для CSRF-защиты OAuth2 flow.
function generateState() {
    return base64url(crypto.randomBytes(16));
}

function joinUrl(base, path) {
    return base.replace(/\/+$/, '') + path;
}

// Выполнить discovery OP, чтобы узнать endpoints. Кешируется (1 процесс = 1 OP).
// Fallback на конвенции (/authorize, /token, /userinfo), если discovery недоступен.
async function discoverEndpoints(issuer, fetchFn, logger) {
    const fallback = {
        authorizationEndpoint: joinUrl(issuer, '/authorize'),
        tokenEndpoint: joinUrl(issuer, '/token'),
        userinfoEndpoint: joinUrl(issuer, '/userinfo')
    };
    try {
        const url = joinUrl(issuer, DISCOVERY_PATH);
        const response = await fetchFn(url);
        if (!response.ok) {
            logger.warn(`[${MODULE_NAME}] discovery ${url} returned ${response.status}, using fallback endpoints`);
            return fallback;
        }
        const doc = await response.json();
        return {
            authorizationEndpoint: doc.authorization_endpoint || fallback.authorizationEndpoint,
            tokenEndpoint: doc.token_endpoint || fallback.tokenEndpoint,
            userinfoEndpoint: doc.userinfo_endpoint || fallback.userinfoEndpoint
        };
    } catch (error) {
        logger.warn(`[${MODULE_NAME}] discovery failed (${error.message}), using fallback endpoints`);
        return fallback;
    }
}

function createOidcClient(options = {}) {
    const issuer = options.issuer;
    const clientId = options.clientId;
    const clientSecret = options.clientSecret;
    const redirectUri = options.redirectUri;
    const scope = options.scope || DEFAULT_SCOPE;
    const fetchFn = options.fetchFn || globalThis.fetch;
    const logger = options.logger || console;

    if (!issuer) {
        throw new Error('issuer is required');
    }
    if (!clientId) {
        throw new Error('clientId is required');
    }
    if (!redirectUri) {
        throw new Error('redirectUri is required');
    }
    if (issuer.startsWith('http://')) {
        logger.warn(`[${MODULE_NAME}] Using insecure HTTP issuer: ${issuer}`);
    }

    // Discovery кешируется с TTL, чтобы подхватывать ротацию endpoints IdP
    // и не залипать навсегда на fallback, если IdP был недоступен при старте.
    let endpoints = null;
    let endpointsAt = 0;
    const ENDPOINTS_TTL_MS = 3600_000; // 1 час

    async function getEndpoints() {
        if (!endpoints || Date.now() - endpointsAt > ENDPOINTS_TTL_MS) {
            endpoints = await discoverEndpoints(issuer, fetchFn, logger);
            endpointsAt = Date.now();
        }
        return endpoints;
    }

    // Построить URL авторизации для redirect браузера на IdP.
    // state и codeVerifier генерируются caller'ом (auth-routes) и сохраняются
    // в short-lived cookie для последующей проверки в callback.
    async function getAuthorizationUrl({ state, codeVerifier }) {
        if (!state) {
            throw new Error('state is required for authorization URL');
        }
        if (!codeVerifier) {
            throw new Error('codeVerifier is required for authorization URL');
        }
        const codeChallenge = base64url(
            crypto.createHash('sha256').update(codeVerifier).digest()
        );
        const ep = await getEndpoints();

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });
        return `${ep.authorizationEndpoint}?${params.toString()}`;
    }

    // Обменять authorization code на токены. POST form-urlencoded на token endpoint.
    // client_secret_basic auth (Basic client_id:client_secret).
    async function callback({ code, codeVerifier }) {
        if (!code) {
            throw new Error('code is required for token exchange');
        }
        if (!codeVerifier) {
            throw new Error('codeVerifier is required for token exchange');
        }
        const ep = await getEndpoints();

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: codeVerifier
        });

        // RFC 6749 §2.3.1: confidential-клиент аутентифицируется ровно одним
        // методом. Используем client_secret_basic (Basic header). client_secret
        // в body НЕ дублируем — иначе строгие IdP (Keycloak strict mode) отклоняют.
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        if (clientSecret) {
            const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            headers.Authorization = `Basic ${basic}`;
        }

        const response = await fetchFn(ep.tokenEndpoint, {
            method: 'POST',
            headers,
            body: body.toString()
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`token endpoint returned ${response.status}: ${text.slice(0, 200)}`);
        }

        const tokenResponse = await response.json();
        return {
            accessToken: tokenResponse.access_token || null,
            idToken: tokenResponse.id_token || null,
            refreshToken: tokenResponse.refresh_token || null,
            tokenType: tokenResponse.token_type || 'Bearer',
            expiresIn: tokenResponse.expires_in || null
        };
    }

    // Получить profile пользователя через userinfo endpoint.
    async function getUserInfo(accessToken) {
        if (!accessToken) {
            throw new Error('accessToken is required for userinfo');
        }
        const ep = await getEndpoints();

        const response = await fetchFn(ep.userinfoEndpoint, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`userinfo endpoint returned ${response.status}: ${text.slice(0, 200)}`);
        }

        const profile = await response.json();
        // Нормализуем обязательные поля.
        return {
            sub: profile.sub || null,
            name: profile.name || null,
            email: profile.email || null,
            preferredUsername: profile.preferred_username || null,
            raw: profile
        };
    }

    return {
        issuer,
        clientId,
        redirectUri,
        getAuthorizationUrl,
        callback,
        getUserInfo,
        // Экспорт для тестов / сценариев предзагрузки:
        _getEndpoints: getEndpoints
    };
}

module.exports = {
    MODULE_NAME,
    DEFAULT_SCOPE,
    createOidcClient,
    generatePkce,
    generateState,
    base64url,
    discoverEndpoints
};
