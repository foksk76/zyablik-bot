// SPDX-License-Identifier: Apache-2.0
'use strict';

const { formatLogLine } = require('./logger');

const MODULE_NAME = 'rate-limiter';
const DEFAULT_GLOBAL_LIMIT = 25;
const DEFAULT_RECIPIENT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 1000;

function createRateLimiter(options = {}) {
  const globalLimit = typeof options.globalLimit === 'number' && options.globalLimit > 0
    ? options.globalLimit
    : DEFAULT_GLOBAL_LIMIT;
  const recipientLimit = typeof options.recipientLimit === 'number' && options.recipientLimit > 0
    ? options.recipientLimit
    : DEFAULT_RECIPIENT_LIMIT;
  const windowMs = typeof options.windowMs === 'number' && options.windowMs > 0
    ? options.windowMs
    : DEFAULT_WINDOW_MS;
  const maxWaitMs = typeof options.maxWaitMs === 'number' && options.maxWaitMs > 0
    ? options.maxWaitMs
    : windowMs * 5;
  const logger = options.logger || { info() {} };
  const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();

  const globalTimestamps = [];
  const recipientTimestamps = new Map();

  function evictOld(timestamps, windowStart) {
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift();
    }
  }

  function tryAcquire(key) {
    const now = nowFn();
    const windowStart = now - windowMs;

    evictOld(globalTimestamps, windowStart);

    if (globalTimestamps.length >= globalLimit) {
      const waitMs = globalTimestamps[0] + windowMs - now;
      return { allowed: false, waitMs: Math.max(0, waitMs), reason: 'global' };
    }

    if (key) {
      let bucket = recipientTimestamps.get(key);
      if (!bucket) {
        bucket = [];
        recipientTimestamps.set(key, bucket);
      }

      evictOld(bucket, windowStart);

      if (bucket.length >= recipientLimit) {
        const waitMs = bucket[0] + windowMs - now;
        return { allowed: false, waitMs: Math.max(0, waitMs), reason: 'recipient' };
      }

      bucket.push(now);
    }

    globalTimestamps.push(now);

    return { allowed: true, waitMs: 0, reason: null };
  }

  async function acquire(key) {
    const deadline = nowFn() + maxWaitMs;

    while (true) {
      const result = tryAcquire(key);

      if (result.allowed) {
        return result;
      }

      if (nowFn() + result.waitMs > deadline) {
        const error = new Error('Rate limiter wait timeout exceeded');
        error.code = 'RATE_LIMIT_TIMEOUT';
        error.details = { key: key || 'global', reason: result.reason, wait_ms: result.waitMs, max_wait_ms: maxWaitMs };
        throw error;
      }

      logger.info(formatLogLine({
        level: 'info',
        module: MODULE_NAME,
        action: 'throttled',
        context: { key: key || 'global', reason: result.reason, wait_ms: result.waitMs }
      }));

      await sleep(result.waitMs);
    }
  }

  function stats() {
    const now = nowFn();
    const windowStart = now - windowMs;

    evictOld(globalTimestamps, windowStart);

    const recipientStats = {};
    const emptyKeys = [];
    for (const [key, bucket] of recipientTimestamps) {
      evictOld(bucket, windowStart);
      if (bucket.length === 0) {
        emptyKeys.push(key);
      } else {
        recipientStats[key] = bucket.length;
      }
    }
    for (const key of emptyKeys) {
      recipientTimestamps.delete(key);
    }

    return {
      globalCount: globalTimestamps.length,
      globalLimit,
      recipientLimit,
      windowMs,
      recipients: recipientStats
    };
  }

  function reset() {
    globalTimestamps.length = 0;
    recipientTimestamps.clear();
  }

  return {
    acquire,
    tryAcquire,
    stats,
    reset
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  MODULE_NAME,
  DEFAULT_GLOBAL_LIMIT,
  DEFAULT_RECIPIENT_LIMIT,
  DEFAULT_WINDOW_MS,
  createRateLimiter
};
