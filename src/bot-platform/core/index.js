'use strict';

const { createEventRouter } = require('./event-router');
const { runMaxIdentityDryRun } = require('./dry-run-pipeline');

const moduleName = 'core';

function createCore() {
  return {
    moduleName,
    status: 'scaffold',
    components: {
      config: 'pending',
      logger: 'pending',
      eventRouter: 'available',
      pluginLoader: 'pending',
      dryRunPipeline: 'available'
    }
  };
}

module.exports = {
  moduleName,
  createCore,
  createEventRouter,
  runMaxIdentityDryRun
};
