// SPDX-License-Identifier: Apache-2.0
'use strict';

const { createQueueMonitorConfig } = require('./config');
const { createQueueReader } = require('./db/reader');
const { createMonitorHttpServer } = require('./http-server');
const { createBearerAuth } = require('./api/auth');
const { createMetricsRoutes } = require('./api/metrics');
const { createReadyzRoute } = require('./api/readyz');

const MODULE_NAME = 'queue-monitor';

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

  const dbPath = options.dbPath || 'delivery-queue.db';
  const reader = options.reader || createQueueReader({ dbPath, logger });

  const auth = createBearerAuth({ apiKey: config.metricsApiKey });
  const metrics = createMetricsRoutes({ reader });
  const readyz = createReadyzRoute({ reader });

  const httpServer = options.httpServer || createMonitorHttpServer({
    port: config.monitorPort,
    logger
  });

  httpServer.registerRoute('GET', '/readyz', readyz.readyz);
  httpServer.registerRoute('GET', '/api/metrics/summary', auth.protectRoute(metrics.summary));
  httpServer.registerRoute('GET', '/api/metrics/discovery', auth.protectRoute(metrics.discovery));
  httpServer.registerRoute('GET', '/api/metrics/timeseries', auth.protectRoute(metrics.timeseries));
  httpServer.registerRoute('GET', '/api/metrics/top', auth.protectRoute(metrics.top));
  httpServer.registerRoute('GET', '/api/metrics/errors', auth.protectRoute(metrics.errors));

  async function start() {
    await httpServer.start();
    logger.info(`[${MODULE_NAME}] Dashboard server started on port ${config.monitorPort}`);
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
  createQueueMonitor
};
