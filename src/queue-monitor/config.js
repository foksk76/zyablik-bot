// SPDX-License-Identifier: Apache-2.0
'use strict';

const MODULE_NAME = 'queue-monitor-config';
const DEFAULT_MONITOR_PORT = 9000;

function createQueueMonitorConfig(environment = process.env) {
    return {
        moduleName: MODULE_NAME,
        monitorEnabled: readBoolEnvValue(environment, 'MONITOR_ENABLED', false),
        monitorPort: readIntegerEnvValue(environment, 'MONITOR_PORT', DEFAULT_MONITOR_PORT, 1, 65535),
        metricsApiKey: readEnvValue(environment, 'METRICS_API_KEY'),
        idpIssuer: readEnvValue(environment, 'IDP_ISSUER'),
        idpClientId: readEnvValue(environment, 'IDP_CLIENT_ID'),
        idpClientSecret: readEnvValue(environment, 'IDP_CLIENT_SECRET'),
        idpRedirectUri: readEnvValue(environment, 'IDP_REDIRECT_URI'),
        sessionSecret: readEnvValue(environment, 'SESSION_SECRET'),
        // Sprint 23 / M2: rate limiting для /api/auth/* (только при включённом OAuth2).
        authRateLimit: readBoolEnvValue(environment, 'AUTH_RATE_LIMIT', true),
        authRateLimitMax: readIntegerEnvValue(environment, 'AUTH_RATE_LIMIT_MAX', 20, 1, 10000),
        authRateLimitWindowMs: readIntegerEnvValue(environment, 'AUTH_RATE_LIMIT_WINDOW_MS', 60_000, 1, 3_600_000),
        authRateConcurrency: readIntegerEnvValue(environment, 'AUTH_RATE_CONCURRENCY', 5, 1, 1000),
        // Sprint 23 / L3 (Task 6): требовать валидный OIDC discovery вместо fallback.
        idpRequireDiscovery: readBoolEnvValue(environment, 'IDP_REQUIRE_DISCOVERY', false)
    };
}

function readEnvValue(environment, key, fallback = '') {
    const value = environment && typeof environment[key] === 'string'
        ? environment[key].trim()
        : '';

    return value || fallback;
}

function readBoolEnvValue(environment, key, fallback = false) {
    const rawValue = readEnvValue(environment, key);

    if (!rawValue) {
        return fallback;
    }

    return rawValue.toLowerCase() === 'true';
}

function readIntegerEnvValue(environment, key, fallback, min, max) {
    const rawValue = readEnvValue(environment, key);

    if (!rawValue) {
        return fallback;
    }

    const value = Number(rawValue);

    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`Invalid ${key} value: ${rawValue}`);
    }

    return value;
}

module.exports = {
    MODULE_NAME,
    DEFAULT_MONITOR_PORT,
    createQueueMonitorConfig
};
