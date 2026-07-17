'use strict';

const { runMaxIdentityDryRun } = require('./dry-run-pipeline');
const { createIdentityUpdateProcessor } = require('./live-pipeline');
const { createBotPlatformConfig, createLiveRuntimeConfig } = require('./config');
const { createSafeLogger } = require('./logger');
const { createPluginLoader } = require('./plugin-loader');

const moduleName = 'core';

function createCore(environment = process.env) {
  return {
    moduleName,
    status: 'scaffold',
    config: createBotPlatformConfig(environment),
    components: {
      config: 'available',
      logger: 'available',
      pluginLoader: 'available',
      dryRunPipeline: 'available'
    }
  };
}

module.exports = {
  moduleName,
  createCore,
  createBotPlatformConfig,
  createLiveRuntimeConfig,
  createIdentityUpdateProcessor,
  createSafeLogger,
  createPluginLoader,
  runMaxIdentityDryRun
};
