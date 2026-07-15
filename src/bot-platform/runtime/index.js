'use strict';

const {
  createSyntheticLongPollingSource,
  createLongPollingService,
  runLongPollingCycle
} = require('./long-polling');
const {
  createLiveBotPlatformService,
  createLiveServiceShutdownHandlers,
  createNativeFetchHttpClient,
  runFetchRequest,
  DEFAULT_HTTP_TIMEOUT_MS
} = require('./live-service');
const {
  createConsoleRuntimeLogger,
  formatRuntimeLogLine
} = require('./log-format');

module.exports = {
  createSyntheticLongPollingSource,
  createLongPollingService,
  runLongPollingCycle,
  createLiveBotPlatformService,
  createLiveServiceShutdownHandlers,
  createNativeFetchHttpClient,
  runFetchRequest,
  DEFAULT_HTTP_TIMEOUT_MS,
  createConsoleRuntimeLogger,
  formatRuntimeLogLine
};
