// SPDX-License-Identifier: Apache-2.0
'use strict';

// ADR-0034 / ADR-0023: standalone session store для queue-monitor.
// НЕ Express middleware — совместим со stdlib `http.createServer`.
// Cookie подписан HMAC-SHA256 (без JWT — не тащим JWT-библиотеку).
// In-memory Map<sessionId, session> для MVP (1 оператор).

const crypto = require('node:crypto');
const { base64url } = require('./base64url');

const MODULE_NAME = 'queue-monitor-session';
const DEFAULT_MAX_AGE_SECONDS = 86400; // 24 часа
const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10 минут на OAuth2 roundtrip
const COOKIE_NAME = 'session';
const STATE_COOKIE_NAME = 'oauth_state';
const MIN_SECRET_LENGTH = 32;

function base64urlDecode(str) {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return Buffer.from(padded, 'base64');
}

function hmac(secret, value) {
    return base64url(crypto.createHmac('sha256', secret).update(value).digest());
}

// timing-safe сравнение двух строк произвольной длины.
// Паддим короткий буфер нулями до длины длинного, чтобы не утекала длина токена.
function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    const maxLen = Math.max(bufA.length, bufB.length);
    const paddedA = Buffer.alloc(maxLen, 0);
    const paddedB = Buffer.alloc(maxLen, 0);
    bufA.copy(paddedA);
    bufB.copy(paddedB);
    return crypto.timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
}

// Создать signed cookie-значение: payload.hmac
// payload = base64url(JSON({ sessionId, csrf, expiresAt }))
function signSessionCookie(secret, sessionId, csrfToken, expiresAt) {
    const payload = base64url(Buffer.from(JSON.stringify({ sessionId, csrf: csrfToken, expiresAt })));
    return `${payload}.${hmac(secret, payload)}`;
}

// Универсальный signed cookie для произвольного объекта + TTL.
// Используется для short-lived oauth_state cookie (CSRF-echo).
function signCookieValue(secret, name, data, expiresAt) {
    const payload = base64url(Buffer.from(JSON.stringify({ name, data, expiresAt })));
    return `${payload}.${hmac(secret, payload)}`;
}

// Проверить подпись и срок годности универсального signed cookie.
// Возвращает data или null (нет/битый/просрочен/имя не совпадает).
function verifyCookieValue(secret, name, cookieValue) {
    if (!cookieValue || typeof cookieValue !== 'string') {
        return null;
    }
    const dot = cookieValue.lastIndexOf('.');
    if (dot === -1) {
        return null;
    }
    const payload = cookieValue.slice(0, dot);
    const signature = cookieValue.slice(dot + 1);

    const expected = hmac(secret, payload);
    if (!safeEqual(signature, expected)) {
        return null;
    }

    let parsed;
    try {
        parsed = JSON.parse(base64urlDecode(payload).toString('utf8'));
    } catch {
        return null;
    }
    if (!parsed || parsed.name !== name) {
        return null;
    }
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Math.floor(Date.now() / 1000)) {
        return null;
    }
    return parsed.data;
}

// Разобрать и проверить подпись signed cookie-значения.
// Возвращает { sessionId, csrf, expiresAt } или null (нет/битый/просрочен).
function verifySessionCookie(secret, cookieValue) {
    if (!cookieValue || typeof cookieValue !== 'string') {
        return null;
    }
    const dot = cookieValue.lastIndexOf('.');
    if (dot === -1) {
        return null;
    }
    const payload = cookieValue.slice(0, dot);
    const signature = cookieValue.slice(dot + 1);

    // Вычисляем ожидаемый HMAC и сравниваем timing-safe.
    const expected = hmac(secret, payload);
    if (!safeEqual(signature, expected)) {
        return null;
    }

    let parsed;
    try {
        parsed = JSON.parse(base64urlDecode(payload).toString('utf8'));
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }
    if (typeof parsed.sessionId !== 'string' || typeof parsed.csrf !== 'string') {
        return null;
    }
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Math.floor(Date.now() / 1000)) {
        return null;
    }
    return parsed;
}

// Простой in-memory session store. session = { user, csrf, expiresAt }.
function createSessionStore(options = {}) {
    const secret = options.secret;
    const maxAgeSeconds = options.maxAgeSeconds || DEFAULT_MAX_AGE_SECONDS;

    if (!secret) {
        throw new Error('session secret is required');
    }
    if (typeof secret !== 'string' && !Buffer.isBuffer(secret)) {
        throw new Error('session secret must be string or Buffer');
    }
    if (String(secret).length < MIN_SECRET_LENGTH) {
        throw new Error(`session secret must be at least ${MIN_SECRET_LENGTH} chars`);
    }

    const sessions = new Map();

    function purgeIfExpired(sessionId) {
        const s = sessions.get(sessionId);
        if (s && s.expiresAt < Math.floor(Date.now() / 1000)) {
            sessions.delete(sessionId);
            return null;
        }
        return s || null;
    }

    // Создать новую сессию для user. Возвращает { sessionId, csrf, expiresAt }.
    function create(user) {
        const sessionId = base64url(crypto.randomBytes(32));
        const csrfToken = base64url(crypto.randomBytes(16));
        const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
        const session = { user, csrf: csrfToken, expiresAt };
        sessions.set(sessionId, session);
        return { sessionId, csrf: csrfToken, expiresAt };
    }

    function get(sessionId) {
        if (!sessionId) {
            return null;
        }
        return purgeIfExpired(sessionId);
    }

    function destroy(sessionId) {
        sessions.delete(sessionId);
    }

    return {
        secret,
        maxAgeSeconds,
        create,
        get,
        destroy,
        _size: () => sessions.size
    };
}

// Распарсить Cookie header в объект key->value.
function parseCookieHeader(cookieHeader) {
    const result = {};
    if (!cookieHeader || typeof cookieHeader !== 'string') {
        return result;
    }
    for (const pair of cookieHeader.split(';')) {
        const eq = pair.indexOf('=');
        if (eq === -1) {
            continue;
        }
        const key = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (key) {
            result[key] = value;
        }
    }
    return result;
}

// Извлечь проверенную сессию из запроса. Возвращает { sessionId, user, csrf } или null.
// Проверяет подпись cookie (secret) И наличие sessionId в store.
function readSession(req, store) {
    const cookies = parseCookieHeader(req.headers.cookie);
    const verified = verifySessionCookie(store.secret, cookies[COOKIE_NAME]);
    if (!verified) {
        return null;
    }
    const session = store.get(verified.sessionId);
    if (!session) {
        return null;
    }
    // csrf из cookie должен совпадать с csrf в store (защита от подделки cookie).
    // timing-safe сравнение — как и для HMAC-подписей, иначе plain !== утечёт токен по timing.
    if (!safeEqual(session.csrf, verified.csrf)) {
        return null;
    }
    return { sessionId: verified.sessionId, user: session.user, csrf: session.csrf };
}

// Сериализовать Set-Cookie header value для session cookie.
// secure = true для HTTPS (определяется caller'ом по redirectUri/среде).
function buildSessionCookieHeader(cookieValue, maxAgeSeconds, { secure = false } = {}) {
    const parts = [
        `${COOKIE_NAME}=${cookieValue}`,
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAgeSeconds}`,
        'Path=/'
    ];
    if (secure) {
        parts.push('Secure');
    }
    return parts.join('; ');
}

// Set-Cookie для удаления сессии (истощение Max-Age=0).
function buildExpiredCookieHeader({ secure = false } = {}) {
    const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Path=/'];
    if (secure) {
        parts.push('Secure');
    }
    return parts.join('; ');
}

// Установить session cookie в ответ (подписанное значение).
function setSessionCookie(res, store, sessionId, csrfToken, expiresAt, { secure = false } = {}) {
    const cookieValue = signSessionCookie(store.secret, sessionId, csrfToken, expiresAt);
    res.setHeader('Set-Cookie', buildSessionCookieHeader(cookieValue, store.maxAgeSeconds, { secure }));
}

// Очистить session cookie в ответе (logout).
function clearSessionCookie(res, { secure = false } = {}) {
    res.setHeader('Set-Cookie', buildExpiredCookieHeader({ secure }));
}

// Установить подписанный short-lived oauth_state cookie (CSRF-echo для OAuth2 flow).
// data — объект { state, codeVerifier } из auth-routes.
function setStateCookie(res, secret, data, { secure = false } = {}) {
    const expiresAt = Math.floor(Date.now() / 1000) + STATE_COOKIE_MAX_AGE_SECONDS;
    const value = signCookieValue(secret, STATE_COOKIE_NAME, data, expiresAt);
    const parts = [
        `${STATE_COOKIE_NAME}=${value}`,
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${STATE_COOKIE_MAX_AGE_SECONDS}`,
        'Path=/'
    ];
    if (secure) {
        parts.push('Secure');
    }
    res.setHeader('Set-Cookie', parts.join('; '));
}

// Прочитать подписанный oauth_state cookie. Возвращает data или null.
function readStateCookie(req, secret) {
    const cookies = parseCookieHeader(req.headers.cookie);
    return verifyCookieValue(secret, STATE_COOKIE_NAME, cookies[STATE_COOKIE_NAME]);
}

// Очистить oauth_state cookie в ответе (после callback).
function clearStateCookie(res, { secure = false } = {}) {
    const parts = [`${STATE_COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Path=/'];
    if (secure) {
        parts.push('Secure');
    }
    res.setHeader('Set-Cookie', parts.join('; '));
}

module.exports = {
    MODULE_NAME,
    COOKIE_NAME,
    STATE_COOKIE_NAME,
    DEFAULT_MAX_AGE_SECONDS,
    STATE_COOKIE_MAX_AGE_SECONDS,
    MIN_SECRET_LENGTH,
    createSessionStore,
    signSessionCookie,
    verifySessionCookie,
    signCookieValue,
    verifyCookieValue,
    parseCookieHeader,
    readSession,
    setSessionCookie,
    clearSessionCookie,
    setStateCookie,
    readStateCookie,
    clearStateCookie,
    buildSessionCookieHeader,
    buildExpiredCookieHeader,
    base64url,
    safeEqual
};
