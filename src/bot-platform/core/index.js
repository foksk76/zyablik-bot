// SPDX-License-Identifier: Apache-2.0
'use strict';

const fs = require('node:fs');

const { runMaxIdentityDryRun } = require('./dry-run-pipeline');
const { createIdentityUpdateProcessor } = require('./live-pipeline');
const { createBotPlatformConfig, createLiveRuntimeConfig, loadConfig, resolveConfigPath } = require('./config');
const { runStartupConfigDetector } = require('./config-store');
const { createSafeLogger } = require('./logger');
const { createPluginLoader } = require('./plugin-loader');

const moduleName = 'core';

function createCore(environment = process.env, options = {}) {
  const configPath = resolveConfigPath(environment, options);
  const recovery = {};
  let loaded;

  if (fs.existsSync(configPath)) {
    const detector = runStartupConfigDetector(configPath, {
      environment,
      logger: options.logger
    });
    Object.assign(recovery, {
      recoveryState: detector.state,
      recoveryReason: detector.reason || null,
      restoredFrom: detector.restoredFrom || null,
      quarantinePath: detector.quarantinePath || null
    });
    if (detector.state === 'refused') {
      const error = new Error(detector.reason);
      error.code = 'CONFIG_STARTUP_REFUSED';
      throw error;
    }
  }

  loaded = loadConfig({ environment, configPath });

  return {
    moduleName,
    status: 'scaffold',
    config: loaded.config,
    sections: loaded.sections,
    configPath: loaded.configPath,
    configFileExists: loaded.fileExists,
    configWarnings: loaded.warnings,
    ...recovery,
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
  loadConfig,
  createIdentityUpdateProcessor,
  createSafeLogger,
  createPluginLoader,
  runMaxIdentityDryRun
};
