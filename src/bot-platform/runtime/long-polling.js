'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { runMaxIdentityDryRun } = require('../core/dry-run-pipeline');

const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_FIXTURE_FILES = [
  path.resolve(process.cwd(), 'examples/bot-platform/max-inbound-user.fixture.json'),
  path.resolve(process.cwd(), 'examples/bot-platform/max-inbound-chat.fixture.json')
];

function createSyntheticLongPollingSource(options = {}) {
  const payloads = Array.isArray(options.payloads) && options.payloads.length > 0
    ? options.payloads.map(clonePayload)
    : loadDefaultPayloads();

  let delivered = false;

  return async function pollUpdates() {
    if (delivered) {
      return [];
    }

    delivered = true;
    return payloads.map(clonePayload);
  };
}

function createLongPollingService(options = {}) {
  const pollUpdates = typeof options.pollUpdates === 'function'
    ? options.pollUpdates
    : createSyntheticLongPollingSource(options);
  const intervalMs = normalizeInterval(options.intervalMs);
  const sleep = typeof options.sleep === 'function' ? options.sleep : defaultSleep;
  const logger = createLogger(options.logger);
  const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : null;
  const onError = typeof options.onError === 'function' ? options.onError : null;
  const maxCycles = normalizeMaxCycles(options.maxCycles);

  const state = {
    mode: 'long_polling',
    networkEnabled: false,
    polls: 0,
    updates: 0,
    results: []
  };

  let stopped = false;
  let running = false;
  let cycles = 0;
  let loopPromise = null;

  async function tick() {
    if (stopped || running) {
      return state;
    }

    running = true;

    try {
      const updates = await pollUpdates();

      if (!Array.isArray(updates)) {
        throw new Error('Invalid long polling updates');
      }

      state.polls += 1;

      for (const update of updates) {
        const result = runMaxIdentityDryRun(update);

        state.updates += 1;
        state.results.push(result);

        if (onUpdate) {
          onUpdate(result);
        }
      }

      return state;
    } catch (error) {
      logger.error('long polling cycle failed', { error: error.message });

      if (onError) {
        onError(error);
      }

      throw error;
    } finally {
      running = false;
    }
  }

  async function loop() {
    while (!stopped && (maxCycles === null || cycles < maxCycles)) {
      cycles += 1;

      try {
        await tick();
      } catch (error) {
        logger.error('long polling loop recovered from error', {
          error: error.message
        });
      }

      if (stopped || (maxCycles !== null && cycles >= maxCycles)) {
        break;
      }

      await sleep(intervalMs);
    }
  }

  function start() {
    if (!loopPromise) {
      loopPromise = loop();
    }

    return service;
  }

  function stop() {
    stopped = true;
    return state;
  }

  const service = {
    mode: 'long_polling',
    networkEnabled: false,
    intervalMs,
    state,
    get loopPromise() {
      return loopPromise;
    },
    start,
    stop,
    tick
  };

  if (options.autoStart !== false) {
    start();
  }

  return service;
}

async function runLongPollingCycle(options = {}) {
  const service = createLongPollingService({
    ...options,
    autoStart: false
  });

  try {
    return await service.tick();
  } finally {
    service.stop();
  }
}

function loadDefaultPayloads() {
  return DEFAULT_FIXTURE_FILES.map((fixturePath) => {
    const raw = fs.readFileSync(fixturePath, 'utf8');
    return JSON.parse(raw);
  });
}

function clonePayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

function normalizeInterval(value) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return DEFAULT_INTERVAL_MS;
}

function normalizeMaxCycles(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  throw new Error('Invalid max cycles value');
}

function defaultSleep(intervalMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, intervalMs);
  });
}

function createLogger(logger) {
  if (logger && typeof logger.error === 'function') {
    return logger;
  }

  return {
    error() {}
  };
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  createSyntheticLongPollingSource,
  createLongPollingService,
  runLongPollingCycle
};
