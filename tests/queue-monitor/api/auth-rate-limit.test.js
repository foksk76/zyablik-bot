// SPDX-License-Identifier: Apache-2.0
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createAuthRateLimiter,
    DEFAULT_MAX_AUTH_REQUESTS,
    DEFAULT_WINDOW_MS,
    DEFAULT_MAX_CONCURRENT_CALLBACKS
} = require('../../../src/queue-monitor/api/auth-rate-limit');

// Инжектируемый clock: возвращает управляемое «сейчас» в мс.
function makeClock(start = 1000) {
    let t = start;
    return {
        advance(ms) { t += ms; },
        now() { return t; }
    };
}

test('createAuthRateLimiter uses safe defaults', () => {
    const limiter = createAuthRateLimiter();
    const stats = limiter.stats();

    assert.equal(stats.authRequestsLimit, DEFAULT_MAX_AUTH_REQUESTS);
    assert.equal(stats.maxConcurrentCallbacks, DEFAULT_MAX_CONCURRENT_CALLBACKS);
    assert.equal(stats.windowMs, DEFAULT_WINDOW_MS);
});

test('createAuthRateLimiter applies provided options over defaults', () => {
    const limiter = createAuthRateLimiter({
        maxAuthRequests: 3,
        windowMs: 1000,
        maxConcurrentCallbacks: 2
    });
    const stats = limiter.stats();

    assert.equal(stats.authRequestsLimit, 3);
    assert.equal(stats.maxConcurrentCallbacks, 2);
    assert.equal(stats.windowMs, 1000);
});

test('createAuthRateLimiter ignores non-positive options, falls back to defaults', () => {
    const limiter = createAuthRateLimiter({
        maxAuthRequests: 0,
        windowMs: -5,
        maxConcurrentCallbacks: -1
    });
    const stats = limiter.stats();

    assert.equal(stats.authRequestsLimit, DEFAULT_MAX_AUTH_REQUESTS);
    assert.equal(stats.maxConcurrentCallbacks, DEFAULT_MAX_CONCURRENT_CALLBACKS);
    assert.equal(stats.windowMs, DEFAULT_WINDOW_MS);
});

// --- tryAcquireAuthRequest (M2-A sliding window) ---

test('tryAcquireAuthRequest allows up to maxAuthRequests then denies', () => {
    const limiter = createAuthRateLimiter({ maxAuthRequests: 3, windowMs: 1000 });

    assert.deepEqual(limiter.tryAcquireAuthRequest(), { allowed: true, reason: null, waitMs: 0 });
    assert.deepEqual(limiter.tryAcquireAuthRequest(), { allowed: true, reason: null, waitMs: 0 });
    assert.deepEqual(limiter.tryAcquireAuthRequest(), { allowed: true, reason: null, waitMs: 0 });

    const denied = limiter.tryAcquireAuthRequest();
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'rate-limit');
    assert.ok(denied.waitMs >= 0, 'waitMs is non-negative');
});

test('tryAcquireAuthRequest evicts old timestamps after window passes', () => {
    const clock = makeClock(0);
    const limiter = createAuthRateLimiter({
        maxAuthRequests: 2,
        windowMs: 1000,
        now: clock.now
    });

    // Два запроса в момент 0 — оба разрешены.
    assert.equal(limiter.tryAcquireAuthRequest().allowed, true);
    assert.equal(limiter.tryAcquireAuthRequest().allowed, true);
    // Третий — отказ.
    assert.equal(limiter.tryAcquireAuthRequest().allowed, false);

    // Продвигаем время за пределы окна — старые timestamp'ы evict'ятся.
    clock.advance(1001);
    // Теперь снова есть место.
    assert.equal(limiter.tryAcquireAuthRequest().allowed, true);
});

test('tryAcquireAuthRequest waitMs reflects time until oldest slot frees', () => {
    const clock = makeClock(0);
    const limiter = createAuthRateLimiter({
        maxAuthRequests: 1,
        windowMs: 1000,
        now: clock.now
    });

    limiter.tryAcquireAuthRequest(); // timestamp at t=0
    clock.advance(400); // t=400

    const denied = limiter.tryAcquireAuthRequest();
    assert.equal(denied.allowed, false);
    // Слот освободится, когда timestamp(0) выйдет за пределы окна (0 + 1000 = 1000),
    // сейчас 400 → ждать 600.
    assert.equal(denied.waitMs, 600);
});

// --- tryAcquireCallback / releaseCallback (M2-C concurrency cap) ---

test('tryAcquireCallback allows up to maxConcurrentCallbacks then denies', () => {
    const limiter = createAuthRateLimiter({ maxConcurrentCallbacks: 2 });

    assert.deepEqual(limiter.tryAcquireCallback(), { allowed: true, reason: null });
    assert.deepEqual(limiter.tryAcquireCallback(), { allowed: true, reason: null });

    const denied = limiter.tryAcquireCallback();
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'concurrency');
});

test('releaseCallback frees a slot for the next callback', () => {
    const limiter = createAuthRateLimiter({ maxConcurrentCallbacks: 1 });

    assert.equal(limiter.tryAcquireCallback().allowed, true);
    assert.equal(limiter.tryAcquireCallback().allowed, false, 'cap reached');

    limiter.releaseCallback();
    assert.equal(limiter.tryAcquireCallback().allowed, true, 'slot freed after release');
});

test('releaseCallback is idempotent — does not go negative', () => {
    const limiter = createAuthRateLimiter({ maxConcurrentCallbacks: 2 });

    limiter.releaseCallback(); // ни одного in-flight — не должно уйти в минус
    limiter.releaseCallback();
    assert.equal(limiter.stats().inFlightCallbacks, 0);

    limiter.tryAcquireCallback();
    limiter.releaseCallback();
    limiter.releaseCallback(); // лишний release
    assert.equal(limiter.stats().inFlightCallbacks, 0, 'clamped at 0');
});

test('releaseCallback restores full capacity after draining all slots', () => {
    const limiter = createAuthRateLimiter({ maxConcurrentCallbacks: 3 });

    limiter.tryAcquireCallback();
    limiter.tryAcquireCallback();
    limiter.tryAcquireCallback();
    assert.equal(limiter.tryAcquireCallback().allowed, false);

    limiter.releaseCallback();
    limiter.releaseCallback();
    limiter.releaseCallback();

    // Все слоты освобождены — снова полная ёмкость.
    assert.equal(limiter.tryAcquireCallback().allowed, true);
    assert.equal(limiter.tryAcquireCallback().allowed, true);
    assert.equal(limiter.tryAcquireCallback().allowed, true);
    assert.equal(limiter.tryAcquireCallback().allowed, false);
});

// --- stats / reset ---

test('stats reports authRequests count and inFlightCallbacks', () => {
    const limiter = createAuthRateLimiter({ maxAuthRequests: 10, maxConcurrentCallbacks: 5 });

    limiter.tryAcquireAuthRequest();
    limiter.tryAcquireAuthRequest();
    limiter.tryAcquireCallback();

    const stats = limiter.stats();
    assert.equal(stats.authRequests, 2);
    assert.equal(stats.inFlightCallbacks, 1);
});

test('reset clears both sliding window and concurrency counter', () => {
    const limiter = createAuthRateLimiter({ maxAuthRequests: 2, maxConcurrentCallbacks: 1 });

    limiter.tryAcquireAuthRequest();
    limiter.tryAcquireAuthRequest();
    limiter.tryAcquireCallback();

    limiter.reset();
    const stats = limiter.stats();
    assert.equal(stats.authRequests, 0);
    assert.equal(stats.inFlightCallbacks, 0);

    // После reset — снова полная ёмкость.
    assert.equal(limiter.tryAcquireAuthRequest().allowed, true);
    assert.equal(limiter.tryAcquireCallback().allowed, true);
});

// --- изоляция: auth-лимит и callback-лимит независимы ---

test('auth rate limit and callback concurrency are independent mechanisms', () => {
    const limiter = createAuthRateLimiter({
        maxAuthRequests: 5,
        maxConcurrentCallbacks: 1
    });

    // Один callback занимает слот, но это не влияет на auth-request лимит.
    assert.equal(limiter.tryAcquireCallback().allowed, true);
    assert.equal(limiter.tryAcquireAuthRequest().allowed, true, 'auth requests still allowed');
    assert.equal(limiter.tryAcquireCallback().allowed, false, 'callback cap still enforced');
});
