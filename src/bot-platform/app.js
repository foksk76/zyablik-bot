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
const { createQueueMonitor } = require('../queue-monitor');
const {
  buildConfigFileFromEnvironment,
  loadConfig,
  resolveConfigPath
} = require('./core/config');
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

function createBotPlatformApp(environment = process.env, options = {}) {
  const core = createCore(environment, {
    logger: options.logger || options.coreLogger || console
  });
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

// ADR-0045: --generate-config — миграция существующего .env-стенда в первый
// zyablik.config.json. Управляемые настройки — в файл, секреты — $VAR-ссылками.
// options: { environment, configPath, dryRun }.
function generateConfigFile(options = {}, io = { stdout: process.stdout, stderr: process.stderr }) {
  const environment = options.environment || process.env;
  const configPath = resolveConfigPath(environment, options);
  const fileConfig = buildConfigFileFromEnvironment(environment);
  const output = `${JSON.stringify(fileConfig, null, 2)}\n`;

  if (options.dryRun) {
    io.stdout.write(output);
    return { dryRun: true, configPath, config: fileConfig };
  }

  if (fs.existsSync(configPath)) {
    const error = new Error(`Конфиг-файл уже существует: ${configPath}. Не перезаписываю.`);
    error.code = 'CONFIG_FILE_EXISTS';
    throw error;
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, output, 'utf8');
  io.stdout.write(`Конфиг-файл записан: ${configPath}\n`);
  return { dryRun: false, configPath, config: fileConfig };
}

function parseGenerateConfigArgs(argv) {
  let dryRun = false;
  let configPath = null;

  for (const arg of argv.slice(1)) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    configPath = arg;
  }

  return { dryRun, configPath };
}

// ADR-0045: --rollback-config — ручной откат конфигурации к последнему
// успешному (lkg). Дополнительно снимает pending-маркер и очищает staged.
// options: { environment, configPath, restart }.
function rollbackConfigFile(options = {}, io = { stdout: process.stdout, stderr: process.stderr }) {
  const environment = options.environment || process.env;
  const configPath = resolveConfigPath(environment, options);

  const { rollbackConfig } = require('./core/config-store');
  const result = rollbackConfig(configPath, {
    environment,
    restart: options.restart
  });

  if (typeof options.restart !== 'function') {
    io.stdout.write('Конфигурация восстановлена из lkg. Требуется рестарт: systemctl restart zyablik-bot\n');
  }
  return result;
}

function isRollbackConfigCommand(argv) {
  return argv.length >= 1 && argv[0] === '--rollback-config';
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
  const environment = options.environment || process.env;
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
  // порядок остановки. Итоговый порядок остановки (после всех unshift/push):
  // queue-worker → queue-monitor → ingress → queue-store.
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

  // ADR-0034: queue monitor dashboard — readonly replica + HTTP server.
  // Запускается после queue-store (нужен dbPath), останавливается ПОСЛЕ worker.
  if (config.monitorEnabled) {
    const monitorDbPath = options.monitorDbPath || options.queueDbPath || 'delivery-queue.db';
    const monitor = options.monitor || createQueueMonitor({
      environment,
      dbPath: monitorDbPath,
      queueStore,
      logger: options.logger || console,
      // ADR-0046: конфигурация для /api/config/* (configPath, плагины, рестарт).
      configPath: options.configPath,
      plugins: options.plugins || [],
      configRestart: options.configRestart
    });

    await monitor.start();
    io.stdout.write(`Queue monitor dashboard started on port ${config.monitorPort}\n`);
    stopHandles.unshift({ name: 'queue-monitor', stop: () => monitor.stop() });
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
  // массиве: queue-worker → queue-monitor → ingress → queue-store. Любая
  // ошибка логируется, но не прерывает остальные shutdown-шаги.
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

  if (isGenerateConfigCommand(argv)) {
    const { dryRun, configPath } = parseGenerateConfigArgs(argv);
    try {
      generateConfigFile({ environment, configPath, dryRun }, io);
      return 0;
    } catch (error) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }
  }

  if (isRollbackConfigCommand(argv)) {
    const configPath = argv.length > 1 ? argv[1] : null;
    try {
      rollbackConfigFile({ environment, configPath }, io);
      return 0;
    } catch (error) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }
  }

  const app = createBotPlatformApp(environment);
  const config = app.core.config;

  // ADR-0046: плагины и configPath для /api/config/* dashboard.
  const ingressOptions = {
    ...options,
    plugins: app.plugins,
    configPath: app.core.configPath
  };

  if (argv.length === 0) {
    if (config.maxTransportMode === 'long_polling') {
      startBotPlatformService(environment);

      const shutdownHandle = await startIngressAndQueue(config, ingressOptions, io);

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
      const shutdownHandle = await startIngressAndQueue(config, ingressOptions, io);

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

function isGenerateConfigCommand(argv) {
  return argv.length >= 1 && argv[0] === '--generate-config';
}

module.exports = {
  createBotPlatformApp,
  runBotPlatformLongPollingOnce,
  startBotPlatformService,
  startLiveBotPlatformService,
  startIngressAndQueue,
  runMaxIdentityDryRun,
  runBotPlatformDryRun,
  generateConfigFile,
  parseGenerateConfigArgs,
  rollbackConfigFile,
  isRollbackConfigCommand,
  main
};
