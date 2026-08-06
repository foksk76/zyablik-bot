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
  buildMonitorFlat,
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
  const pluginLoader = createPluginLoader(path.join(__dirname, 'plugins'));
  const core = createCore(environment, {
    logger: options.logger || options.coreLogger || console,
    plugins: pluginLoader.plugins
  });
  const transportMode = core.config.maxTransportMode;

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

// ADR-0045: снятие pending-маркера по готовности процесса (ready). Вызывается
// в main() ПОСЛЕ успешного старта всех сервисов (включая live-бот), чтобы окно
// авто-отката (pending→lkg) не терялось при падении boot'а до реального
// подъёма. Повторный вызов — no-op (маркер уже снят).
function confirmConfigIfPending(configPath, logger) {
    if (!configPath) {
        return false;
    }
    const { confirmConfigApplied } = require('./core/config-store');
    return confirmConfigApplied(configPath, { logger: logger || console });
}

// ADR-0046 (M2): подтверждение конфига после готовности процесса. Через
// configApi monitor'а — снимает pending-маркер И фиксирует состояние
// 'confirmed' (след apply→confirmed в /api/config/status). Если монитор
// не поднят (monitorEnabled=false) — fallback на confirmConfigIfPending.
function confirmConfig(configPath, shutdownHandle, logger) {
    if (shutdownHandle && typeof shutdownHandle.confirmConfig === 'function') {
        if (shutdownHandle.confirmConfig()) {
            return true;
        }
    }
    return confirmConfigIfPending(configPath, logger);
}

function startBotPlatformService(environment = process.env, options = {}) {
  // M2 (review PR #23): созданный app/конфиг можно передать через options.app.
  // main() уже создал app (createBotPlatformApp) для config и детектора —
  // повторный createBotPlatformApp здесь запускал runStartupConfigDetector
  // второй раз за boot (двойной инкремент boots: crash-loop откат после 3
  // boot вместо 5). С переданным app детектор выполняется ровно один раз.
  const app = options.app || createBotPlatformApp(environment);

  if (app.core.config.maxTransportMode !== 'long_polling') {
    throw new Error('Safe test bot service requires MAX_TRANSPORT_MODE=long_polling');
  }

  return createLongPollingService({
    ...options,
    pollUpdates: options.pollUpdates || createSyntheticLongPollingSource(),
    logger: options.logger || options.coreLogger || console
  });
}

async function startLiveBotPlatformService(environment = process.env, options = {}) {
  const liveService = createLiveBotPlatformService(environment, options);

  if (options.installSignalHandlers !== false) {
    createLiveServiceShutdownHandlers(liveService, options.io);
  }

  // M6 (review): await — main() дожидается реального старта первого
  // long-polling цикла, и confirm() по готовности не опережает сеть.
  await liveService.start();

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
  // Атомарная запись (temp + rename), как в config-store: конфиг-файл не
  // должен остаться наполовину записанным при падении процесса.
  const tempPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, output, 'utf8');
  fs.renameSync(tempPath, configPath);
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
// options: { environment, configPath, plugins, restart }.
function rollbackConfigFile(options = {}, io = { stdout: process.stdout, stderr: process.stderr }) {
  const environment = options.environment || process.env;
  const configPath = resolveConfigPath(environment, options);

  const { rollbackConfig } = require('./core/config-store');
  const result = rollbackConfig(configPath, {
    environment,
    restart: options.restart,
    // R5-L6 (review PR #23): валидация lkg по configSchema плагинов, как в
    // dashboard rollback (api/config.js) — единая поверхность валидации.
    plugins: options.plugins
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
  let monitorService = null;
  try {
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
        // ADR-0045 (M3, review R13): runtime-конфиг queue-monitor из ФАЙЛА
        // (buildMonitorFlat), а не из env — иначе dashboard и /api/config/*
        // не поднимаются в file-based схеме без дублирования MONITOR_ENABLED
        // в env (нарушало бы «файл — источник правды»).
        config: buildMonitorFlat(config),
        // ADR-0046: конфигурация для /api/config/* (configPath, плагины, рестарт).
        configPath: options.configPath,
        plugins: options.plugins || [],
        configRestart: options.configRestart,
        configRecovery: options.configRecovery,
        // R11-L3 (review PR #23): предупреждения loadConfig (неопознанные
        // ключи, устаревшие $VAR) накапливаются при createCore и здесь
        // пробрасываются в queue-monitor, чтобы /api/config отдавал их в UI.
        configWarnings: options.configWarnings || []
      });
      monitorService = monitor;

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
  } catch (error) {
    // R15 (review): ресурс не стартовал — например, `monitor.start()` бросил
    // EADDRINUSE (monitor.port совпал с ingress.port или занят). Без этой
    // очистки уже запущенный ingress остаётся слушать: его listen-сокет держит
    // event loop, main() ставит exitCode=1, но процесс не завершается — тот же
    // «зомби» с замороженными boots и неработающим авто-откатом, ради которого
    // делался M1/R13. Останавливаем запущенные сервисы (в обратном порядке) и
    // закрываем queueStore, если он создан, но ещё не зарегистрирован.
    for (let i = stopHandles.length - 1; i >= 0; i -= 1) {
      try {
        await stopHandles[i].stop();
      } catch (stopError) {
        if (io && io.stderr) {
          io.stderr.write(`shutdown step '${stopHandles[i].name}' failed during failed start: ${stopError.message}\n`);
        }
      }
    }
    if (queueStore && !stopHandles.some((handle) => handle.name === 'queue-store')) {
      try {
        queueStore.close();
      } catch (closeError) {
        if (io && io.stderr) {
          io.stderr.write(`failed to close queue store after failed start: ${closeError.message}\n`);
        }
      }
    }
    throw error;
  }

  // ADR-0033: единый shutdown handle для signal handlers. Цикл ниже
  // итерирует stopHandles forward, поэтому порядок остановки = порядок в
  // массиве: queue-worker → queue-monitor → ingress → queue-store. Любая
  // ошибка логируется, но не прерывает остальные shutdown-шаги.

  // ADR-0045: подтверждение конфига по готовности (ready) выполняется в main()
  // ПОСЛЕ старта всех сервисов (включая live-бот). Dashboard-сервер НЕ снимает
  // маркер при своём старте: он поднимается раньше live-бота, и при падении
  // boot'а после ready dashboard'а окно авто-отката (pending → lkg) терялось
  // бы. Повторный вызов confirm — no-op (маркер уже снят).

  // R15 (review): stop() идемпотентен. Двойные вызовы реальны: при
  // firstTick-таймауте stopLiveService() → liveService.stop() →
  // shutdownHandle.stop(), затем catch в main() вызывает stop() повторно.
  // Без guard второй queueStore.close() на better-sqlite3 бросал «This database
  // connection is not open» (ловился, но шумел в логах).
  let stopped = false;

  return {
    stop: async (shutdownIo) => {
      if (stopped) {
        return;
      }
      stopped = true;
      for (const handle of stopHandles) {
        try {
          await handle.stop();
        } catch (error) {
          if (shutdownIo && shutdownIo.stderr) {
            shutdownIo.stderr.write(`shutdown step '${handle.name}' failed: ${error.message}\n`);
          }
        }
      }
    },
    // ADR-0046 (M2): подтверждение конфига через configApi (след
    // apply→confirmed в /api/config/status), а не напрямую через config-store.
    // Снимает pending-маркер и фиксирует состояние; fallback на raw-функцию,
    // если монитор не поднят (monitorEnabled=false) или метод недоступен.
    confirmConfig: () => {
      if (monitorService && typeof monitorService.confirmConfig === 'function') {
        return monitorService.confirmConfig();
      }
      return false;
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
      // R5-L6 (review PR #23): CLI-rollback валидирует lkg с configSchema
      // плагинов (как dashboard rollback) — иначе ветка плагина, нарушающая
      // схему, прошла бы ручной откат, но упала бы в детекторе на следующем
      // boot. Несмотря на это rollback — аварийная операция: сбой загрузки
      // плагинов не должен блокировать восстановление (fallback без схем,
      // предупреждение в stderr).
      let rollbackPlugins = [];
      try {
        rollbackPlugins = createPluginLoader(path.join(__dirname, 'plugins')).plugins;
      } catch (pluginError) {
        io.stderr.write(`Предупреждение: не удалось загрузить плагины (lkg валидируется без configSchema): ${pluginError.message}\n`);
      }
      rollbackConfigFile({ environment, configPath, plugins: rollbackPlugins }, io);
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
    configPath: app.core.configPath,
    // ADR-0046 (M6): результат стартового детектора (rolled_back/quarantine)
    // попадает в /api/config/status, чтобы баннер отката был достижим после
    // crash-restart (in-memory состояние API сбрасывается при рестарте).
    configRecovery: {
      state: app.core.recoveryState,
      reason: app.core.recoveryReason,
      restoredFrom: app.core.restoredFrom
    },
    // R11-L3 (review PR #23): предупреждения loadConfig пробрасываются в
    // /api/config → UI (баннер на странице настроек).
    configWarnings: app.core.configWarnings || []
  };

  if (argv.length === 0) {
    if (config.maxTransportMode === 'long_polling') {
      // M2 (review PR #23): передаём уже созданный app — иначе
      // startBotPlatformService создал бы второй app и детектор
      // (runStartupConfigDetector) выполнился бы дважды за boot (двойной
      // инкремент boots в синтетическом режиме).
      startBotPlatformService(environment, { app });

      const shutdownHandle = await startIngressAndQueue(config, ingressOptions, io);

      // ADR-0045: подтверждение после старта сервисов (ready).
      confirmConfig(app.core.configPath, shutdownHandle, options.logger || options.coreLogger);

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
    let shutdownHandle = null;

    try {
      shutdownHandle = await startIngressAndQueue(config, ingressOptions, io);

      const startLiveService = typeof options.startLiveBotPlatformService === 'function'
        ? options.startLiveBotPlatformService
        : startLiveBotPlatformService;

      await startLiveService(environment, {
        ...options.liveOptions,
        // H1 (review): effective-конфиг из loadConfig() (defaults → файл → .env).
        // live-сервис строит свой runtime-config из него, а не только из env.
        config,
        identityHandler: options.liveOptions && options.liveOptions.identityHandler || app.routes.identity,
        shutdownHandle,
        io
      });
      // ADR-0045: подтверждение конфига ПОСЛЕ старта live-сервиса — падение
      // boot'а до этой точки оставляет pending-маркер для авто-отката.
      confirmConfig(app.core.configPath, shutdownHandle, options.logger || options.coreLogger);
      io.stdout.write('MAX bot-platform live service started in long_polling mode\n');
      return 0;
    } catch (error) {
      io.stderr.write(`${error.message}\n`);
      // M1 (review): boot не удался (например, live-сервис не стартовал в
      // пределах firstTick-таймаута). Останавливаем ingress/worker/queue-store,
      // иначе серверы держат event loop, процесс не выходит с ненулевым кодом,
      // boots не растут и авто-откат к lkg не срабатывает (зомби).
      if (shutdownHandle) {
        try {
          await shutdownHandle.stop(io);
        } catch (stopError) {
          io.stderr.write(`Ошибка остановки после сбоя boot: ${stopError.message}\n`);
        }
      }
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
