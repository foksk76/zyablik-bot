// SPDX-License-Identifier: Apache-2.0
'use strict';

const { spawn } = require('node:child_process');

const { createSafeLogger } = require('../core');
const { createLongPollingService } = require('./long-polling');
const { formatRuntimeLogLine } = require('./log-format');
const { createLiveRuntimeConfig } = require('../core/config');
const { createIdentityUpdateProcessor } = require('../core/live-pipeline');
const { createMaxInboundUpdatesClient, createMaxOutboundClient } = require('../transports/max');

const moduleName = 'live-service';
const DEFAULT_HTTP_TIMEOUT_MS = 90000;
// M1 (review): лимит ожидания первого успешного long-polling цикла (firstTick).
// firstTick резолвится только после успешного poll; при устойчивом сетевом
// сбое (неверный token/URL) он не резолвится вовсе. Без лимита start()
// висел бесконечно: main() не доходил до confirm(), процесс оставался жив
// (зомби), boots не рос, авто-откат к lkg не срабатывал. 60s > StartupWait
// (30s), поэтому на следующем boot'е после таймаута pending устаревает и
// конфиг откатывается к lkg.
const DEFAULT_FIRST_TICK_TIMEOUT_MS = 60_000;

function createLiveBotPlatformService(environment = process.env, options = {}) {
  // H1 (review): runtimeConfig может быть передан из main() (результат
  // loadConfig() — defaults → файл → .env) как options.runtimeConfig или
  // options.config (effective flat-конфиг). Без них — env-based обратная
  // совместимость.
  const runtimeConfig = options.runtimeConfig
    || createLiveRuntimeConfig(environment, { config: options.config });

  if (runtimeConfig.mode === 'webhook') {
    throw runtimeConfig.error;
  }

  const logger = createLiveLogger(options.logger, runtimeConfig);
  const httpClient = options.httpClient || createNativeFetchHttpClient({
    fetchBinary: options.fetchBinary,
    timeoutMs: options.httpTimeoutMs
  });
  const outboundApiUrl = buildLiveMessagesApiUrl(runtimeConfig.maxApiUrl);
  const inboundClient = options.inboundClient || createMaxInboundUpdatesClient({
    apiUrl: runtimeConfig.maxApiUrl,
    token: runtimeConfig.maxBotToken,
    httpClient,
    networkEnabled: true,
    limit: runtimeConfig.maxPollLimit,
    timeoutSeconds: runtimeConfig.maxPollTimeoutSeconds,
    types: runtimeConfig.maxPollTypes,
    logger
  });
  let pendingMarker = null;
  const outboundClient = options.outboundClient || createMaxOutboundClient({
    apiUrl: outboundApiUrl,
    token: runtimeConfig.maxBotToken,
    httpClient,
    networkEnabled: true,
    logger
  });
  const processUpdate = typeof options.processUpdate === 'function'
    ? options.processUpdate
    : createIdentityUpdateProcessor({ outboundClient, identityHandler: options.identityHandler });
  // ADR-0033: handle для coordinated shutdown ingress/worker/queue-store.
  // Live-service — единственный компонент с signal handlers, поэтому через
  // него прокидывается остановка всех ресурсов app.startIngressAndQueue.
  const shutdownHandle = options.shutdownHandle || null;
  const pollUpdates = typeof options.pollUpdates === 'function'
    ? options.pollUpdates
    : async () => {
        const result = await inboundClient.poll();
        pendingMarker = result.marker;
        return result.updates;
      };
  const service = createLongPollingService({
    autoStart: false,
    pollUpdates,
    processUpdate,
    intervalMs: options.intervalMs,
    maxCycles: options.maxCycles,
    sleep: options.sleep,
    onCycleSuccess() {
      if (pendingMarker !== null && inboundClient && typeof inboundClient.ack === 'function') {
        inboundClient.ack(pendingMarker);
        pendingMarker = null;
      }
    },
    logger
  });
  const liveService = {
    moduleName,
    status: 'available',
    mode: 'long_polling',
    runtimeMode: 'live',
    networkEnabled: true,
    runtimeConfig,
    inboundClient,
    outboundClient,
    service,
    async start() {
      logger.info('live MAX Identity Bot service starting', {
        mode: 'long_polling',
        networkEnabled: true
      });
      service.start();
      // M6 (review): дождаться первого реального long-polling цикла, а не
      // возвращаться сразу после синхронного start(). Так confirm() по
      // готовности в main() срабатывает после фактического старта сети.
      //
      // M1 (review): firstTick резолвится только после успешного poll. При
      // устойчивом сетевом сбое он не резолвится вовсе — прежний бесконечный
      // await держал процесс зомби (main() не доходил до confirm(), boots не
      // росли, авто-откат к lkg не срабатывал). Ограничиваем ожидание
      // таймаутом: останавливаем сервис (loop + coordinated shutdown) и
      // бросаем ошибку — main() вернёт exit != 0, systemd-рестарт поднимет
      // счётчик boots, и следующий boot откатит конфиг к lkg.
      try {
        await waitForFirstTick(service, resolveFirstTickTimeoutMs(options.firstTickTimeoutMs));
      } catch (error) {
        if (error && error.code === 'LIVE_FIRST_TICK_TIMEOUT') {
          logger.error('live MAX Identity Bot service did not start within timeout', {
            error: error.message,
            polls: service.state.polls,
            updates: service.state.updates
          });
          // Остановить loop и поднятые сервисы (ingress/worker/queue-store),
          // иначе они держат event loop и процесс не завершится с ненулевым
          // кодом (зомби сохранится, авто-откат не сработает).
          await stopLiveService(liveService, shutdownHandle, logger);
        }
        throw error;
      }
      logger.info('live MAX Identity Bot service started', {
        mode: 'long_polling',
        networkEnabled: true,
        intervalMs: service.intervalMs
      });
      return liveService;
    },
    async stop() {
      const state = service.stop();
      logger.info('live MAX Identity Bot service stopped', {
        mode: 'long_polling',
        polls: state.polls,
        updates: state.updates,
        results: state.results.length
      });
      // ADR-0033: coordinated shutdown ingress/worker/queue-store.
      if (shutdownHandle) {
        try {
          await shutdownHandle.stop();
        } catch (error) {
          logger.error('coordinated shutdown failed', {
            error: error && error.message ? error.message : 'unknown error'
          });
        }
      }
      return state;
    },
    get loopPromise() {
      return service.loopPromise;
    },
    get state() {
      return service.state;
    }
  };

  return liveService;
}

function resolveFirstTickTimeoutMs(value) {
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  return DEFAULT_FIRST_TICK_TIMEOUT_MS;
}

function waitForFirstTick(service, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return service.firstTick;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`Live MAX Identity Bot service did not start within ${timeoutMs}ms (no successful long-polling cycle)`);
      error.code = 'LIVE_FIRST_TICK_TIMEOUT';
      reject(error);
    }, timeoutMs);
    // unref: таймаут не должен сам удерживать event loop после штатного старта.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    service.firstTick.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function stopLiveService(liveService, shutdownHandle, logger) {
  try {
    await liveService.stop();
  } catch (error) {
    logger.error('failed to stop live service after failed start', {
      error: error && error.message ? error.message : 'unknown error'
    });
  }
}

function createLiveLogger(logger, runtimeConfig) {
  return createSafeLogger({
    config: runtimeConfig,
    write(entry) {
      const target = logger && typeof logger === 'object' ? logger : console;
      const method = typeof target[entry.level] === 'function'
        ? entry.level
        : 'log';

      if (target === console) {
        target[method](formatRuntimeLogLine(entry.message, entry.context));
        return;
      }

      target[method](entry.message, entry.context);
    }
  });
}

function createNativeFetchHttpClient(options = {}) {
  const fetchBinary = typeof options.fetchBinary === 'string' && options.fetchBinary.trim()
    ? options.fetchBinary.trim()
    : process.execPath;
  const timeoutMs = resolveHttpTimeoutMs(options.timeoutMs);

  return {
    get(request) {
      return runFetchRequest(fetchBinary, request, timeoutMs);
    },
    post(request) {
      return runFetchRequest(fetchBinary, request, timeoutMs);
    }
  };
}

function resolveHttpTimeoutMs(value) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  const fromEnv = Number.parseInt(process.env.MAX_HTTP_TIMEOUT_MS, 10);

  if (Number.isInteger(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  return DEFAULT_HTTP_TIMEOUT_MS;
}

function buildLiveMessagesApiUrl(apiUrl) {
  const baseUrl = typeof apiUrl === 'string' && apiUrl.trim()
    ? apiUrl.trim()
    : 'https://platform-api2.max.ru';

  return new URL('/messages', ensureTrailingSlash(baseUrl)).toString();
}

function runFetchRequest(fetchBinary, request, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS, childScriptOverride) {
  // Async (non-blocking) variant: HTTP runs in a child process and the parent
  // event loop stays free. Replaces the prior spawnSync implementation that
  // blocked the event loop for the whole long-poll window (~30s).
  // Source: https://nodejs.org/api/child_process.html — spawn() is async;
  // `timeout` > 0 sends `killSignal` (default SIGTERM) after N ms.
  // `childScriptOverride` is a test-only hook to inject a deterministic
  // (e.g. hanging) child script without network.
  const childScript = typeof childScriptOverride === 'string' && childScriptOverride
    ? childScriptOverride
    : buildFetchChildScript();

  return runChildScript(fetchBinary, request, childScript, timeoutMs);
}

function buildFetchChildScript() {
  return [
    "const fs = require('node:fs');",
    '(async () => {',
    "  const request = JSON.parse(fs.readFileSync(0, 'utf8'));",
    '  const response = await fetch(request.url, {',
    '    method: request.method,',
    '    headers: request.headers,',
    '    body: request.body === undefined ? undefined : JSON.stringify(request.body)',
    '  });',
    '  const rawBody = await response.text();',
    '  let body = null;',
    '  if (rawBody) {',
    '    try {',
    '      body = JSON.parse(rawBody);',
    '    } catch (error) {',
    '      body = rawBody;',
    '    }',
    '  }',
    '  process.stdout.write(JSON.stringify({',
    '    statusCode: response.status,',
    '    body',
    '  }));',
    '})().catch((error) => {',
    '  const payload = {',
    "    message: error && error.message ? error.message : 'fetch failure'",
    '  };',
    "  if (error && error.cause && typeof error.cause === 'object') {",
    '    payload.cause = {',
    "      code: typeof error.cause.code === 'string' ? error.cause.code : undefined,",
    "      message: typeof error.cause.message === 'string' ? error.cause.message : undefined,",
    "      hostname: typeof error.cause.hostname === 'string' ? error.cause.hostname : undefined",
    '    };',
    '  }',
    '  process.stderr.write(JSON.stringify(payload));',
    '  process.exit(1);',
    '});'
  ].join('\n');
}

function runChildScript(fetchBinary, request, childScript, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(fetchBinary, ['-e', childScript], {
      timeout: timeoutMs,
      killSignal: 'SIGTERM'
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    child.stdin.on('error', () => {});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('timeout', () => {
      // Emitted when the child is killed after exceeding `timeout`.
      timedOut = true;
    });

    child.on('error', (spawnError) => {
      if (settled) {
        return;
      }

      settled = true;
      const error = new Error(`Live HTTP request failed: ${spawnError.message}`);
      error.cause = {
        code: spawnError.code,
        message: spawnError.message
      };
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (settled) {
        return;
      }

      settled = true;

      if (timedOut || signal === 'SIGTERM') {
        const error = new Error('Live HTTP request timed out');
        error.cause = { code: 'HTTP_TIMEOUT', message: `exceeded ${timeoutMs}ms` };
        reject(error);
        return;
      }

      if (code !== 0) {
        reject(createFetchTransportError(stderr));
        return;
      }

      if (typeof stdout !== 'string' || stdout.trim() === '') {
        reject(new Error('Live HTTP request returned an empty response'));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error('Live HTTP request returned invalid JSON'));
      }
    });

    child.stdin.end(JSON.stringify(request));
  });
}

function createFetchTransportError(stderr) {
  const raw = typeof stderr === 'string' && stderr.trim()
    ? stderr.trim()
    : '';

  if (!raw) {
    return new Error('Live HTTP request failed');
  }

  try {
    const payload = JSON.parse(raw);
    const error = new Error(typeof payload.message === 'string' && payload.message.trim()
      ? payload.message.trim()
      : 'Live HTTP request failed');

    if (payload.cause && typeof payload.cause === 'object') {
      error.cause = {
        code: typeof payload.cause.code === 'string' ? payload.cause.code : undefined,
        message: typeof payload.cause.message === 'string' ? payload.cause.message : undefined,
        hostname: typeof payload.cause.hostname === 'string' ? payload.cause.hostname : undefined
      };
    }

    return error;
  } catch (error) {
    return new Error(raw);
  }
}

function ensureTrailingSlash(apiUrl) {
  return apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
}

function createLiveServiceShutdownHandlers(liveService, io = { stdout: process.stdout }, hooks = {}) {
  // ADR-0033: coordinated shutdown останавливает worker/ingress/queue-store
  // (через shutdownHandle внутри liveService.stop()) перед завершением процесса.
  // process.exit нужен, чтобы закрыть HTTP listen-сокет ingress, который иначе
  // удерживает event loop. exitFn инжектируется для тестируемости.
  const exitFn = typeof hooks.exitFn === 'function' ? hooks.exitFn : (code) => process.exit(code);

  const stop = async (signal) => {
    io.stdout.write(`Coordinated shutdown after ${signal}: live-service + ingress + worker + queue-store\n`);
    try {
      await liveService.stop();
    } catch (error) {
      io.stdout.write(`Coordinated shutdown error: ${error && error.message ? error.message : 'unknown error'}\n`);
    }
    exitFn(0);
  };

  const handlers = {
    SIGINT() {
      io.stdout.write('Stopping live MAX Identity Bot after SIGINT\n');
      stop('SIGINT');
    },
    SIGTERM() {
      io.stdout.write('Stopping live MAX Identity Bot after SIGTERM\n');
      stop('SIGTERM');
    }
  };

  process.once('SIGINT', handlers.SIGINT);
  process.once('SIGTERM', handlers.SIGTERM);

  return handlers;
}

module.exports = {
  moduleName,
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_FIRST_TICK_TIMEOUT_MS,
  createLiveBotPlatformService,
  createLiveServiceShutdownHandlers,
  createNativeFetchHttpClient,
  runFetchRequest,
  buildLiveMessagesApiUrl
};
