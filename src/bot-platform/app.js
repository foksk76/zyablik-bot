#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createCore, createPluginLoader, runMaxIdentityDryRun } = require('./core');
const { createMaxTransport } = require('./transports/max');
const { createIngressPipeline } = require('./ingress');
const { createOidcVerifierFactory } = require('./ingress/oidc-verifier');
const { createQueueStore } = require('./queue/store');
const { createQueueWorker } = require('./queue/worker');
const { createRateLimiter } = require('./core/rate-limiter');
const {
  createSyntheticLongPollingSource,
  createLongPollingService,
  runLongPollingCycle,
  createLiveBotPlatformService,
  createLiveServiceShutdownHandlers
} = require('./runtime');

function createIssuerVerifierFactory(issuer) {
  if (issuer && issuer.startsWith('http://')) {
    return createOidcVerifierFactory();
  }
  return null;
}

function createBotPlatformApp(environment = process.env) {
  const core = createCore(environment);
  const transportMode = core.config.maxTransportMode;
  const pluginLoader = createPluginLoader(path.join(__dirname, 'plugins'));

  return {
    name: 'zyablik-bot-platform',
    status: 'scaffold',
    core,
    transports: {
      max: createMaxTransport({ transportMode })
    },
    plugins: pluginLoader.plugins,
    routes: pluginLoader.routes,
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
    ...options,
    pollUpdates: options.pollUpdates || createSyntheticLongPollingSource(),
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

async function startIngressAndQueue(config, options, io) {
  const { createMaxOutboundClient } = require('./transports/max/outbound-client');
  const { createNativeFetchHttpClient, buildLiveMessagesApiUrl } = require('./runtime');

  const httpClient = options.httpClient || createNativeFetchHttpClient();
  const outboundApiUrl = buildLiveMessagesApiUrl(config.maxApiUrl);

  const rateLimiter = config.rateLimitEnabled
    ? (options.rateLimiter || createRateLimiter({
      globalLimit: config.rateLimitGlobal,
      recipientLimit: config.rateLimitRecipient,
      logger: options.logger || console
    }))
    : null;

  const outboundClient = options.outboundClient || createMaxOutboundClient({
    apiUrl: outboundApiUrl,
    token: config.maxBotToken,
    httpClient,
    networkEnabled: true,
    rateLimiter,
    logger: options.logger || console
  });

  // ADR-0033: ресурсы, требующие coordinated shutdown при SIGTERM/SIGINT.
  // stopHandles итерируется forward в stop() — порядок в массиве задаёт
  // порядок остановки. Worker добавляется через unshift (первым), ingress и
  // queue-store — через push. Итоговый порядок остановки: worker → ingress →
  // queue-store (сначала polling, затем HTTP listen, затем БД).
  const stopHandles = [];

  let queueStore = null;
  if (config.queueEnabled) {
    queueStore = options.queueStore || createQueueStore({
      dbPath: options.queueDbPath || 'delivery-queue.db',
      backoffBase: config.queueBackoffBase,
      backoffMax: config.queueBackoffMax,
      processingTtlSeconds: config.queueProcessingTtlSeconds
    });
  }

  let ingress = null;
  if (config.ingressEnabled) {
    ingress = createIngressPipeline({
      port: config.ingressPort,
      issuer: config.idpIssuer,
      audience: config.idpAudience,
      claimName: config.jwtClaimName,
      claimValue: config.jwtClaimValue,
      verifierFactory: createIssuerVerifierFactory(config.idpIssuer),
      outboundClient,
      queueStore,
      logAudit: config.logAudit,
      logTrace: config.logTrace,
      logger: options.logger || console
    });

    await ingress.start();
    io.stdout.write(`HTTP-ingress server started on port ${config.ingressPort}\n`);
    stopHandles.push({ name: 'ingress', stop: () => ingress.stop() });
  }

  if (config.queueEnabled) {
    stopHandles.push({ name: 'queue-store', stop: () => queueStore.close() });

    const worker = createQueueWorker({
      queueStore,
      outboundClient,
      batchSize: config.queueBatchSize,
      intervalMs: config.queueIntervalMs,
      maxAttempts: config.queueMaxAttempts,
      logAudit: config.logAudit,
      logTrace: config.logTrace,
      logger: options.logger || console
    });

    worker.start();
    io.stdout.write('Queue worker started\n');
    // Worker первым в очереди остановки (завершаем polling до закрытия ingress/БД).
    stopHandles.unshift({ name: 'queue-worker', stop: () => worker.stop() });
  }

  // ADR-0033: единый shutdown handle для signal handlers. Цикл ниже
  // итерирует stopHandles forward, поэтому порядок остановки = порядок в
  // массиве: worker → ingress → queue-store. Любая ошибка логируется,
  // но не прерывает остальные shutdown-шаги.
  return {
    stop: async (shutdownIo) => {
      for (const handle of stopHandles) {
        try {
          await handle.stop();
        } catch (error) {
          if (shutdownIo && shutdownIo.stderr) {
            shutdownIo.stderr.write(`shutdown step '${handle.name}' failed: ${error.message}\n`);
          }
        }
      }
    }
  };
}

async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }, options = {}) {
  const environment = options.environment || process.env;
  const app = createBotPlatformApp(environment);
  const config = app.core.config;

  if (argv.length === 0) {
    if (config.maxTransportMode === 'long_polling') {
      startBotPlatformService(environment);

      const shutdownHandle = await startIngressAndQueue(config, options, io);

      const shutdownIo = options.io || io;
      const onSignal = async () => {
        shutdownIo.stdout.write('Synthetic mode: coordinated shutdown\n');
        await shutdownHandle.stop(shutdownIo);
      };
      process.on('SIGTERM', onSignal);
      process.on('SIGINT', onSignal);

      io.stdout.write('MAX bot-platform safe test service started in long_polling mode with synthetic updates\n');
      return 0;
    }

    io.stderr.write('Не реализовано: transport mode webhook\n');
    return 1;
  }

  if (isLiveCommand(argv)) {
    try {
      const shutdownHandle = await startIngressAndQueue(config, options, io);

      const startLiveService = typeof options.startLiveBotPlatformService === 'function'
        ? options.startLiveBotPlatformService
        : startLiveBotPlatformService;

      startLiveService(environment, {
        ...options.liveOptions,
        identityHandler: options.liveOptions && options.liveOptions.identityHandler || app.routes.identity,
        shutdownHandle,
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
  startIngressAndQueue,
  runMaxIdentityDryRun,
  runBotPlatformDryRun,
  main
};
