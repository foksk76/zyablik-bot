// SPDX-License-Identifier: Apache-2.0
'use strict';

const path = require('node:path');

const { createQueueMonitorConfig } = require('./config');
const { createQueueReader } = require('./db/reader');
const { createMonitorHttpServer } = require('./http-server');
const { createBearerAuth } = require('./api/auth');
const { createMetricsRoutes } = require('./api/metrics');
const { createReadyzRoute } = require('./api/readyz');
const { createAuthRoutes } = require('./api/auth-routes');
const { createAuthRateLimiter } = require('./api/auth-rate-limit');
const { createOidcClient } = require('./auth/oidc');
const { createSessionStore } = require('./auth/session');

const MODULE_NAME = 'queue-monitor';

// По умолчанию UI-сборка лежит рядом с этим модулем: src/queue-monitor/ui/dist.
// В проде путь может быть переопределён через options.staticDir.
const DEFAULT_STATIC_DIR = path.join(__dirname, 'ui', 'dist');

function createQueueMonitor(options = {}) {
    const environment = options.environment || process.env;
    const config = options.config || createQueueMonitorConfig(environment);
    const logger = options.logger || console;

    if (!config.monitorEnabled) {
        return {
            start: async () => {},
            stop: async () => {},
            ready: () => true
        };
    }

    if (!config.metricsApiKey) {
        throw new Error('MONITOR_ENABLED=true requires METRICS_API_KEY to be set');
    }

    const dbPath = options.dbPath || 'delivery-queue.db';
    const reader = options.reader || createQueueReader({ dbPath, logger });

    const metrics = createMetricsRoutes({ reader });
    const readyz = createReadyzRoute({ reader });

    // OAuth2/OIDC auth layer — опционален. Если IDP_ISSUER не задан, монитор
    // работает в bearer-only режиме (без UI login, только metrics API + static).
    const authEnabled = Boolean(
        config.idpIssuer && config.idpClientId && config.idpRedirectUri && config.sessionSecret
    );

    let sessionStore = null;
    let authRoutes = null;
    if (authEnabled) {
        const oidcClient = options.oidcClient || createOidcClient({
            issuer: config.idpIssuer,
            clientId: config.idpClientId,
            clientSecret: config.idpClientSecret,
            redirectUri: config.idpRedirectUri,
            requireDiscovery: config.idpRequireDiscovery,
            logger
        });
        sessionStore = options.sessionStore || createSessionStore({
            secret: config.sessionSecret,
            logger
        });
        // Secure-флаг cookie: true если redirect URI на https://
        const secure = config.idpRedirectUri.startsWith('https://');
        // Sprint 23 / M2: rate limiter для /api/auth/*. Только при authEnabled
        // (без OAuth2 auth-маршруты не регистрируются). Опционально через AUTH_RATE_LIMIT.
        const rateLimiter = config.authRateLimit
            ? (options.rateLimiter || createAuthRateLimiter({
                maxAuthRequests: config.authRateLimitMax,
                windowMs: config.authRateLimitWindowMs,
                maxConcurrentCallbacks: config.authRateConcurrency
            }))
            : null;
        authRoutes = createAuthRoutes({
            oidcClient,
            sessionStore,
            secure,
            rateLimiter,
            logger
        });
    } else if (config.idpIssuer || config.idpClientId) {
        logger.warn(
            `[${MODULE_NAME}] Partial IDP config — OAuth2 UI auth disabled. ` +
            'Set IDP_ISSUER + IDP_CLIENT_ID + IDP_REDIRECT_URI + SESSION_SECRET to enable.'
        );
    }

    // ADR-0035: session-авторизация как fallback для Bearer token.
    // Если sessionStore доступен (OAuth2 включён), protectRoute проверяет
    // cookie-сессию после неудачной Bearer-попытки.
    const auth = createBearerAuth({
        apiKey: config.metricsApiKey,
        sessionStore
    });

    // staticDir для SPA. options.staticDir=null отключает static serving.
    const staticDir = options.staticDir !== undefined ? options.staticDir : DEFAULT_STATIC_DIR;

    const httpServer = options.httpServer || createMonitorHttpServer({
        port: config.monitorPort,
        logger,
        staticDir
    });

    // Публичные маршруты (без auth).
    httpServer.registerRoute('GET', '/readyz', readyz.readyz);

    // Metrics: Bearer token auth (для внешних систем мониторинга).
    httpServer.registerRoute('GET', '/api/metrics/summary', auth.protectRoute(metrics.summary));
    httpServer.registerRoute('GET', '/api/metrics/discovery', auth.protectRoute(metrics.discovery));
    httpServer.registerRoute('GET', '/api/metrics/timeseries', auth.protectRoute(metrics.timeseries));
    httpServer.registerRoute('GET', '/api/metrics/top', auth.protectRoute(metrics.top));
    httpServer.registerRoute('GET', '/api/metrics/errors', auth.protectRoute(metrics.errors));

    // Auth routes: OAuth2 login/callback/logout/session (если auth layer включён).
    if (authRoutes) {
        httpServer.registerRoute('GET', '/api/auth/login', authRoutes.login);
        httpServer.registerRoute('GET', '/api/auth/callback', authRoutes.callback);
        httpServer.registerRoute('POST', '/api/auth/logout', authRoutes.logout);
        httpServer.registerRoute('GET', '/api/auth/session', authRoutes.session);
    }

    async function start() {
        await httpServer.start();
        logger.info(`[${MODULE_NAME}] Dashboard server started on port ${config.monitorPort}`);
        if (authEnabled) {
            logger.info(`[${MODULE_NAME}] OAuth2 UI auth enabled (IdP: ${config.idpIssuer})`);
        }
        if (staticDir) {
            logger.info(`[${MODULE_NAME}] Static UI serving from ${staticDir}`);
        }
    }

    async function stop() {
        await httpServer.stop();
        reader.close();
        logger.info(`[${MODULE_NAME}] Dashboard server stopped`);
    }

    function ready() {
        return reader.ready();
    }

    return {
        start,
        stop,
        ready
    };
}

module.exports = {
    MODULE_NAME,
    createQueueMonitor,
    DEFAULT_STATIC_DIR
};
