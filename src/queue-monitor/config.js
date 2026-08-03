// SPDX-License-Identifier: Apache-2.0
'use strict';

// ADR-0045: queue-monitor читает свою monitor-секцию из общего результата
// loadConfig (src/bot-platform/core/config.js). createQueueMonitorConfig
// сохранён как тонкий враппер для обратной совместимости (env-only), а
// createQueueMonitorConfigFromConfig принимает уже загруженный результат
// loadConfig и возвращает плоскую monitor-секцию.

const { loadConfig } = require('../bot-platform/core/config');

const MODULE_NAME = 'queue-monitor-config';
const DEFAULT_MONITOR_PORT = 9000;

// Обратная совместимость: env-based конфиг (без файла).
function createQueueMonitorConfig(environment = process.env) {
    const result = loadConfig({ environment });
    return result.monitor;
}

// Плоская monitor-секция из уже загруженного результата loadConfig.
function createQueueMonitorConfigFromConfig(loadedConfig) {
    if (loadedConfig && loadedConfig.monitor) {
        return loadedConfig.monitor;
    }

    if (loadedConfig && typeof loadedConfig === 'object') {
        // На вход может прийти плоский config (например, из app.js).
        const flat = loadedConfig;
        return {
            moduleName: MODULE_NAME,
            monitorEnabled: flat.monitorEnabled,
            monitorPort: flat.monitorPort,
            metricsApiKey: flat.metricsApiKey,
            idpIssuer: flat.idpIssuer,
            idpClientId: flat.idpClientId,
            idpClientSecret: flat.idpClientSecret,
            idpRedirectUri: flat.idpRedirectUri,
            sessionSecret: flat.sessionSecret,
            authRateLimit: flat.authRateLimit,
            authRateLimitMax: flat.authRateLimitMax,
            authRateLimitWindowMs: flat.authRateLimitWindowMs,
            authRateConcurrency: flat.authRateConcurrency,
            idpRequireDiscovery: flat.idpRequireDiscovery,
            idpRelaxSsrf: flat.idpRelaxSsrf
        };
    }

    return createQueueMonitorConfig({});
}

module.exports = {
    MODULE_NAME,
    DEFAULT_MONITOR_PORT,
    createQueueMonitorConfig,
    createQueueMonitorConfigFromConfig
};
