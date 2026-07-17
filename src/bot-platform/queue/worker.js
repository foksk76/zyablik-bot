'use strict';

const MODULE_NAME = 'queue-worker';
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_INTERVAL_MS = 5000;

function createQueueWorker(options = {}) {
  const queueStore = options.queueStore;
  const outboundClient = options.outboundClient;
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
  const logger = options.logger || console;

  let intervalId = null;
  let busy = false;

  async function poll() {
    if (!queueStore || !outboundClient) {
      return { processed: 0 };
    }

    if (busy) {
      return { processed: 0 };
    }

    busy = true;

    try {
      const batch = queueStore.dequeue(batchSize);

      if (batch.length === 0) {
        return { processed: 0 };
      }

      let processed = 0;

      for (const item of batch) {
        try {
          await outboundClient.send(item.payload);
          queueStore.ack(item.id);
          processed++;
        } catch (error) {
          const attempts = (item.attempts || 0) + 1;
          const maxAttempts = options.maxAttempts || 5;

          try {
            queueStore.nack(item.id, attempts, maxAttempts);
          } catch (nackError) {
            logger.error(`[queue-worker] nack failed for item ${item.id}: ${nackError.message}`);
          }

          logger.error(`[queue-worker] send failed for item ${item.id}: ${error.message}`);
        }
      }

      return { processed };
    } finally {
      busy = false;
    }
  }

  function start() {
    if (intervalId !== null) {
      return;
    }

    intervalId = setInterval(async () => {
      try {
        await poll();
      } catch (error) {
        logger.error(`[queue-worker] poll error: ${error.message}`);
      }
    }, intervalMs);
  }

  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
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
