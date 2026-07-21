// SPDX-License-Identifier: Apache-2.0
'use strict';

const { formatLogLine } = require('../core/logger');

const MODULE_NAME = 'queue-worker';
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_INTERVAL_MS = 5000;

function createQueueWorker(options = {}) {
  const queueStore = options.queueStore;
  const outboundClient = options.outboundClient;
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
  const logger = options.logger || console;
  const logAudit = options.logAudit !== false;
  const logTrace = options.logTrace !== false;

  let intervalId = null;
  let busy = false;
  let stopped = false;
  let pollInProgress = null;

  async function poll() {
    if (stopped || !queueStore || !outboundClient) {
      return { processed: 0 };
    }

    if (busy) {
      return { processed: 0 };
    }

    busy = true;
    const p = (async () => {

    try {
      const batch = queueStore.dequeue(batchSize);

      if (batch.length === 0) {
        return { processed: 0 };
      }

      let processed = 0;

      for (const item of batch) {
        if (logTrace) {
          logger.info(formatLogLine({
            level: 'info',
            module: MODULE_NAME,
            reqId: item.reqId,
            action: 'dequeued',
            context: { id: item.id, attempt: item.attempts }
          }));
        }

        const startMs = Date.now();

        try {
          await outboundClient.send(item.payload);
          const durationMs = Date.now() - startMs;
          queueStore.ack(item.id);

          if (logAudit || logTrace) {
            const action = logTrace ? 'delivered' : 'message delivered';
            const entry = {
              level: 'info',
              module: MODULE_NAME,
              action,
              context: { id: item.id, duration_ms: durationMs }
            };
            if (logTrace) entry.reqId = item.reqId;
            logger.info(formatLogLine(entry));
          }

          processed++;
        } catch (error) {
          const attempts = (item.attempts || 0) + 1;
          const maxAttempts = options.maxAttempts || 5;

          if (logAudit || logTrace) {
            const action = logTrace ? 'failed' : 'message failed';
            const entry = {
              level: 'info',
              module: MODULE_NAME,
              action,
              context: { ...error.details, id: item.id, attempts, reason: error.message }
            };
            if (logTrace) entry.reqId = item.reqId;
            logger.info(formatLogLine(entry));
          }

          try {
            queueStore.nack(item.id, attempts, maxAttempts);
          } catch (nackError) {
            logger.error(formatLogLine({
              level: 'error',
              module: MODULE_NAME,
              reqId: item.reqId,
              action: 'nack failed',
              context: { id: item.id, reason: nackError.message }
            }));
          }

          logger.error(formatLogLine({
            level: 'error',
            module: MODULE_NAME,
            reqId: item.reqId,
            action: 'send failed',
            context: { ...error.details, id: item.id, reason: error.message }
          }));
        }
      }

      return { processed };
    } finally {
      busy = false;
      pollInProgress = null;
    }
    })();

    pollInProgress = p;
    return p;
  }

  function start() {
    if (intervalId !== null) {
      return;
    }

    function scheduleNext() {
      if (stopped) {
        return;
      }
      intervalId = setTimeout(async () => {
        try {
          await poll();
        } catch (error) {
          logger.error(formatLogLine({
            level: 'error',
            module: MODULE_NAME,
            action: 'poll error',
            context: { reason: error.message }
          }));
        }
        scheduleNext();
      }, intervalMs);
    }

    scheduleNext();
  }

  function stop() {
    stopped = true;
    if (intervalId !== null) {
      clearTimeout(intervalId);
      intervalId = null;
    }
    return pollInProgress || Promise.resolve();
  }

  return {
    start,
    stop,
    poll
  };
}

module.exports = {
  MODULE_NAME,
  DEFAULT_BATCH_SIZE,
  DEFAULT_INTERVAL_MS,
  createQueueWorker
};
