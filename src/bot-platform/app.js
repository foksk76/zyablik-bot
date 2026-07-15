#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createCore, runMaxIdentityDryRun } = require('./core');
const { createMaxTransport } = require('./transports/max');
const { createIdentityPlugin } = require('./plugins/identity');
const {
  createSyntheticLongPollingSource,
  createLongPollingService,
  runLongPollingCycle,
  createLiveBotPlatformService,
  createLiveServiceShutdownHandlers
} = require('./runtime');

function createBotPlatformApp(environment = process.env) {
  const core = createCore(environment);
  const transportMode = core.config.maxTransportMode;

  return {
    name: 'max-identity-bot-platform',
    status: 'scaffold',
    core,
    transports: {
      max: createMaxTransport({ transportMode })
    },
    plugins: {
      identity: createIdentityPlugin()
    },
    pipeline: {
      dryRun: 'available',
      transportMode
    }
  };
}

function startBotPlatformService(environment = process.env, options = {}) {
  const app = createBotPlatformApp(environment);

  if (app.core.config.maxTransportMode !== 'long_polling') {
    throw new Error('Safe test bot service requires MAX_TRANSPORT_MODE=long_polling');
  }

  return createLongPollingService({
    pollUpdates: options.pollUpdates || createSyntheticLongPollingSource(),
    ...options,
    logger: options.logger || options.coreLogger || console
  });
}

function startLiveBotPlatformService(environment = process.env, options = {}) {
  const liveService = createLiveBotPlatformService(environment, options);

  if (options.installSignalHandlers !== false) {
    createLiveServiceShutdownHandlers(liveService, options.io);
  }

  liveService.start();

  return liveService;
}

async function runBotPlatformDryRun(fixturePath) {
  if (typeof fixturePath !== 'string' || fixturePath.length === 0) {
    throw new Error('Fixture path is required');
  }

  const resolvedPath = path.resolve(process.cwd(), fixturePath);
  const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  return runMaxIdentityDryRun(payload);
}

function runBotPlatformLongPollingOnce(environment = process.env, options = {}) {
  const app = createBotPlatformApp(environment);

  if (app.core.config.maxTransportMode !== 'long_polling') {
    throw new Error('Safe test bot service requires MAX_TRANSPORT_MODE=long_polling');
  }

  return runLongPollingCycle({
    ...options,
    pollUpdates: options.pollUpdates || createSyntheticLongPollingSource(),
    logger: options.logger || options.coreLogger || console
  });
}

async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }, options = {}) {
  const environment = options.environment || process.env;
  const app = createBotPlatformApp(environment);

  if (argv.length === 0) {
    if (app.core.config.maxTransportMode === 'long_polling') {
      startBotPlatformService(environment);
      io.stdout.write('MAX bot-platform safe test service started in long_polling mode with synthetic updates\n');
      return 0;
    }

    io.stderr.write('Не реализовано: transport mode webhook\n');
    return 1;
  }

  if (isLiveCommand(argv)) {
    try {
      const startLiveService = typeof options.startLiveBotPlatformService === 'function'
        ? options.startLiveBotPlatformService
        : startLiveBotPlatformService;

      startLiveService(environment, {
        ...options.liveOptions,
        io
      });
      io.stdout.write('MAX bot-platform live service started in long_polling mode\n');
      return 0;
    } catch (error) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }
  }

  if (argv.length !== 1) {
    io.stderr.write('Usage: node src/bot-platform/app.js <fixture-path>\n');
    return 1;
  }

  try {
    const result = await runBotPlatformDryRun(argv[0]);
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

function isLiveCommand(argv) {
  return argv.length === 1 && (argv[0] === '--live' || argv[0] === 'live');
}

module.exports = {
  createBotPlatformApp,
  runBotPlatformLongPollingOnce,
  startBotPlatformService,
  startLiveBotPlatformService,
  runMaxIdentityDryRun,
  runBotPlatformDryRun,
  main
};
