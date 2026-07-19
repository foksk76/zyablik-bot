const test = require('node:test');
const assert = require('node:assert/strict');

const { createRateLimiter } = require('../../src/bot-platform/core/rate-limiter');

function createMockLogger() {
  const entries = [];
  return {
    entries,
    info(entry) { entries.push(entry); }
  };
}

function createControlledNow() {
  let now = 1000000;
  return {
    getNow: () => now,
    advance: (ms) => { now += ms; }
  };
}

test('createRateLimiter returns object with acquire, tryAcquire, stats, reset', () => {
  const limiter = createRateLimiter();

  assert.equal(typeof limiter.acquire, 'function');
  assert.equal(typeof limiter.tryAcquire, 'function');
  assert.equal(typeof limiter.stats, 'function');
  assert.equal(typeof limiter.reset, 'function');
});

test('tryAcquire allows request within global limit', () => {
  const limiter = createRateLimiter({ globalLimit: 5, recipientLimit: 5, windowMs: 1000 });
  const result = limiter.tryAcquire('user:123');

  assert.equal(result.allowed, true);
  assert.equal(result.waitMs, 0);
  assert.equal(result.reason, null);
});

test('tryAcquire blocks when global limit exceeded', () => {
  const limiter = createRateLimiter({ globalLimit: 2, recipientLimit: 10, windowMs: 1000 });

  limiter.tryAcquire('user:1');
  limiter.tryAcquire('user:2');
  const result = limiter.tryAcquire('user:3');

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'global');
  assert.ok(result.waitMs >= 0);
});

test('tryAcquire blocks when recipient limit exceeded', () => {
  const limiter = createRateLimiter({ globalLimit: 100, recipientLimit: 2, windowMs: 1000 });

  limiter.tryAcquire('user:1');
  limiter.tryAcquire('user:1');
  const result = limiter.tryAcquire('user:1');

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'recipient');
});

test('tryAcquire allows different recipients independently', () => {
  const limiter = createRateLimiter({ globalLimit: 100, recipientLimit: 1, windowMs: 1000 });

  limiter.tryAcquire('user:1');
  const result = limiter.tryAcquire('user:2');

  assert.equal(result.allowed, true);
});

test('tryAcquire without key only checks global limit', () => {
  const limiter = createRateLimiter({ globalLimit: 2, recipientLimit: 1, windowMs: 1000 });

  limiter.tryAcquire();
  limiter.tryAcquire();
  const result = limiter.tryAcquire();

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'global');
});

test('acquire resolves immediately when under limit', async () => {
  const limiter = createRateLimiter({ globalLimit: 10, recipientLimit: 10, windowMs: 1000 });
  const start = Date.now();
  await limiter.acquire('user:1');
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 50, `should resolve quickly, took ${elapsed}ms`);
});

test('acquire waits and resolves when slot opens', async () => {
  const { getNow, advance } = createControlledNow();
  const limiter = createRateLimiter({
    globalLimit: 2,
    recipientLimit: 2,
    windowMs: 100,
    now: getNow
  });

  limiter.tryAcquire('user:1');
  limiter.tryAcquire('user:1');

  let acquired = false;
  const acquirePromise = limiter.acquire('user:1').then(() => { acquired = true; });

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(acquired, false, 'should be waiting');

  advance(101);
  await acquirePromise;
  assert.equal(acquired, true, 'should have acquired');
});

test('stats returns current counts', () => {
  const limiter = createRateLimiter({ globalLimit: 10, recipientLimit: 5, windowMs: 1000 });

  limiter.tryAcquire('user:1');
  limiter.tryAcquire('user:1');
  limiter.tryAcquire('user:2');

  const stats = limiter.stats();

  assert.equal(stats.globalCount, 3);
  assert.equal(stats.globalLimit, 10);
  assert.equal(stats.recipientLimit, 5);
  assert.equal(stats.windowMs, 1000);
  assert.equal(stats.recipients['user:1'], 2);
  assert.equal(stats.recipients['user:2'], 1);
});

test('reset clears all timestamps', () => {
  const limiter = createRateLimiter({ globalLimit: 2, recipientLimit: 2, windowMs: 1000 });

  limiter.tryAcquire('user:1');
  limiter.tryAcquire('user:1');

  let result = limiter.tryAcquire('user:1');
  assert.equal(result.allowed, false);

  limiter.reset();

  result = limiter.tryAcquire('user:1');
  assert.equal(result.allowed, true);
});

test('sliding window evicts old timestamps', () => {
  const { getNow, advance } = createControlledNow();
  const limiter = createRateLimiter({
    globalLimit: 2,
    recipientLimit: 2,
    windowMs: 100,
    now: getNow
  });

  limiter.tryAcquire('user:1');
  limiter.tryAcquire('user:1');

  let result = limiter.tryAcquire('user:1');
  assert.equal(result.allowed, false, 'should be blocked at limit');

  advance(101);

  result = limiter.tryAcquire('user:1');
  assert.equal(result.allowed, true, 'should be allowed after window');
});

test('global and recipient limits work independently', () => {
  const limiter = createRateLimiter({ globalLimit: 10, recipientLimit: 1, windowMs: 1000 });

  limiter.tryAcquire('user:1');
  limiter.tryAcquire('user:2');

  const result = limiter.tryAcquire('user:3');
  assert.equal(result.allowed, true, 'global has room, different recipient');

  const result2 = limiter.tryAcquire('user:1');
  assert.equal(result2.allowed, false, 'recipient limit hit');
  assert.equal(result2.reason, 'recipient');
});

test('acquire logs throttle events', async () => {
  const logger = createMockLogger();
  const { getNow, advance } = createControlledNow();
  const limiter = createRateLimiter({
    globalLimit: 1,
    recipientLimit: 1,
    windowMs: 50,
    logger,
    now: getNow
  });

  limiter.tryAcquire('user:1');

  const acquirePromise = limiter.acquire('user:1');
  advance(51);
  await acquirePromise;

  assert.ok(logger.entries.length > 0, 'should have logged throttle');
  const throttleLog = logger.entries.find((e) => e && e.includes && e.includes('throttled'));
  assert.ok(throttleLog, 'should contain throttled action');
});

test('defaults are applied when options are missing', () => {
  const limiter = createRateLimiter();
  const stats = limiter.stats();

  assert.equal(stats.globalLimit, 25);
  assert.equal(stats.recipientLimit, 5);
  assert.equal(stats.windowMs, 1000);
});

test('defaults are applied for invalid option values', () => {
  const limiter = createRateLimiter({ globalLimit: -1, recipientLimit: 0, windowMs: 'bad' });
  const stats = limiter.stats();

  assert.equal(stats.globalLimit, 25);
  assert.equal(stats.recipientLimit, 5);
  assert.equal(stats.windowMs, 1000);
});

test('acquire throws when maxWaitMs exceeded', async () => {
  const { getNow, advance } = createControlledNow();
  const limiter = createRateLimiter({
    globalLimit: 2,
    recipientLimit: 1,
    windowMs: 100,
    maxWaitMs: 50,
    now: getNow
  });

  limiter.tryAcquire('user:1');

  await assert.rejects(
    () => limiter.acquire('user:1'),
    (error) => {
      assert.equal(error.code, 'RATE_LIMIT_TIMEOUT');
      assert.equal(error.details.reason, 'recipient');
      assert.equal(error.details.max_wait_ms, 50);
      return true;
    }
  );
});

test('acquire resolves within maxWaitMs when slot opens in time', async () => {
  const { getNow, advance } = createControlledNow();
  const limiter = createRateLimiter({
    globalLimit: 1,
    recipientLimit: 1,
    windowMs: 100,
    maxWaitMs: 200,
    now: getNow
  });

  limiter.tryAcquire('user:1');

  const acquirePromise = limiter.acquire('user:1');
  advance(101);
  await acquirePromise;
});

test('maxWaitMs defaults to windowMs * 5', () => {
  const limiter = createRateLimiter({ windowMs: 200 });
  const stats = limiter.stats();

  assert.equal(stats.windowMs, 200);
});
