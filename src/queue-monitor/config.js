// SPDX-License-Identifier: Apache-2.0
'use strict';

// ADR-0045: queue-monitor читает свою monitor-секцию из общего результата
// loadConfig (src/bot-platform/core/config.js). createQueueMonitorConfig
// сохранён как тонкий враппер для обратной совместимости (env-only), а
// app.js передаёт file-derived flat (buildMonitorFlat) напрямую через
// options.config (M3, review R13).

const { loadConfig } = require('../bot-platform/core/config');

const MODULE_NAME = 'queue-monitor-config';
const DEFAULT_MONITOR_PORT = 9000;

// Обратная совместимость: env-based конфиг (без файла).
function createQueueMonitorConfig(environment = process.env) {
    const result = loadConfig({ environment });
    return result.monitor;
}

module.exports = {
    MODULE_NAME,
    DEFAULT_MONITOR_PORT,
    createQueueMonitorConfig
};
