// SPDX-License-Identifier: Apache-2.0
'use strict';

// Sprint 23 / M2: rate limiting для /api/auth/* (ADR-0034/0035).
// Комбинирует две защиты:
//   (1) M2-A: глобальный sliding window на запросы к /api/auth/*
//       (переиспользует алгоритм ADR-0030, но non-blocking — только
//       tryAcquire, без acquire с await sleep, который повесил бы event
//       loop под нагрузкой вместо fail-fast 429).
//   (2) M2-C: cap на число одновременно идущих callback'ов. Callback
//       делает исходящие запросы к IdP (token + userinfo) и может висеть;
//       без cap атакующий открывает сотни параллельных соединений.
//
// Sliding window зеркалит src/bot-platform/core/rate-limiter.js,
// но упрощён до одного bucket'а (глобальный, не per-recipient):
// для auth-эндпоинтов в MVP (1 оператор) per-IP избыточен.

const MODULE_NAME = 'queue-monitor-auth-rate-limit';
const DEFAULT_MAX_AUTH_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_CONCURRENT_CALLBACKS = 5;

function createAuthRateLimiter(options = {}) {
    const maxAuthRequests = typeof options.maxAuthRequests === 'number' && options.maxAuthRequests > 0
        ? options.maxAuthRequests
        : DEFAULT_MAX_AUTH_REQUESTS;
    const windowMs = typeof options.windowMs === 'number' && options.windowMs > 0
        ? options.windowMs
        : DEFAULT_WINDOW_MS;
    const maxConcurrentCallbacks = typeof options.maxConcurrentCallbacks === 'number' && options.maxConcurrentCallbacks > 0
        ? options.maxConcurrentCallbacks
        : DEFAULT_MAX_CONCURRENT_CALLBACKS;
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();

    // M2-A: sliding window на timestamp'ах запросов к /api/auth/*.
    const authTimestamps = [];

    // M2-C: счётчик in-flight callback'ов (тех, что делают исходящий fetch к IdP).
    let inFlightCallbacks = 0;

    function evictOld(timestamps, windowStart) {
        while (timestamps.length > 0 && timestamps[0] <= windowStart) {
            timestamps.shift();
        }
    }

    // Проверить, разрешён ли запрос к /api/auth/* (login или callback).
    // Синхронно, non-blocking. При отказе — caller вернёт 429.
    function tryAcquireAuthRequest() {
        const now = nowFn();
        const windowStart = now - windowMs;

        evictOld(authTimestamps, windowStart);

        if (authTimestamps.length >= maxAuthRequests) {
            const waitMs = authTimestamps[0] + windowMs - now;
            return { allowed: false, reason: 'rate-limit', waitMs: Math.max(0, waitMs) };
        }

        authTimestamps.push(now);
        return { allowed: true, reason: null, waitMs: 0 };
    }

    // Проверить, можно ли начать callback (дорогой — исходящий fetch к IdP).
    // Возвращает { allowed }. Caller обязан вызвать releaseCallback() в finally.
    function tryAcquireCallback() {
        if (inFlightCallbacks >= maxConcurrentCallbacks) {
            return { allowed: false, reason: 'concurrency' };
        }
        inFlightCallbacks += 1;
        return { allowed: true, reason: null };
    }

    // Освободить слот callback'а. Вызывать в finally — даже при ошибке IdP,
    // иначе слот зависнет и заблокирует легитимные callback'и.
    function releaseCallback() {
        if (inFlightCallbacks > 0) {
            inFlightCallbacks -= 1;
        }
    }

    // Снимок состояния для /readyz/метрик/логов. Без secrets.
    function stats() {
        evictOld(authTimestamps, nowFn() - windowMs);
        return {
            authRequests: authTimestamps.length,
            authRequestsLimit: maxAuthRequests,
            inFlightCallbacks,
            maxConcurrentCallbacks,
            windowMs
        };
    }

    function reset() {
        authTimestamps.length = 0;
        inFlightCallbacks = 0;
    }

    return {
        tryAcquireAuthRequest,
        tryAcquireCallback,
        releaseCallback,
        stats,
        reset
    };
}

module.exports = {
    MODULE_NAME,
    DEFAULT_MAX_AUTH_REQUESTS,
    DEFAULT_WINDOW_MS,
    DEFAULT_MAX_CONCURRENT_CALLBACKS,
    createAuthRateLimiter
};
