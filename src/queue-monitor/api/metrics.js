// SPDX-License-Identifier: Apache-2.0
'use strict';

const MODULE_NAME = 'queue-monitor-metrics';
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;
const DEFAULT_TOP_LIMIT = 5;
const DEFAULT_ERRORS_LIMIT = 20;

// Нормализовать limit из query: clamp в [MIN_LIMIT, MAX_LIMIT].
// Регрессия: parseInt('-1') === -1, а Math.min(-1, 100) === -1. В SQLite
// LIMIT -1 означает «без ограничения» — это пробивало MAX_LIMIT кап и
// позволяло вытащить все failed-записи (с payload) одним запросом.
function normalizeLimit(raw, fallback) {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, MIN_LIMIT), MAX_LIMIT);
}

// ADR-0034: window задаётся как длительность (1h, 30m, 1d) или целое число секунд.
// parseInt('1h') молча возвращает 1, поэтому duration-формат нужно парсить явно.
const DURATION_PATTERN = /^(\d+)\s*(s|m|h|d)$/i;
const DURATION_TO_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 };

function parseWindowSeconds(raw) {
    if (raw === undefined || raw === null || raw === '') {
        return 0;
    }
    const value = String(raw).trim();

    const match = DURATION_PATTERN.exec(value);
    if (match) {
        return Number(match[1]) * DURATION_TO_SECONDS[match[2].toLowerCase()];
    }

    const parsed = parseInt(value, 10);
    // Требуем, что вся строка — неотрицательное целое: parseInt('1x') === 1
    // молча отбрасывает суффикс, что маскировало ошибочный формат window.
    if (Number.isNaN(parsed) || parsed < 0 || String(parsed) !== value) {
        return 0;
    }
    return parsed;
}

// ADR-0041: абсолютный диапазон (from/to) приоритетнее window.
// from/to — unix timestamps (секунды), from < to.
function parseFromTo(ctx) {
    const rawFrom = ctx.query?.from;
    const rawTo = ctx.query?.to;
    if (rawFrom === undefined || rawTo === undefined) {
        return { from: null, to: null };
    }
    const from = Number(rawFrom);
    const to = Number(rawTo);
    if (Number.isNaN(from) || Number.isNaN(to) || from <= 0 || to <= 0 || from >= to) {
        return { from: null, to: null };
    }
    return { from, to };
}

function createMetricsRoutes(options = {}) {
    const reader = options.reader;

    if (!reader) {
        throw new Error('reader is required');
    }

    function summary(ctx) {
        const windowSeconds = parseWindowSeconds(ctx.query?.window);
        const { from, to } = parseFromTo(ctx);
        const timeFilter = reader.buildTimeFilter(windowSeconds, from, to);
        const data = reader.summary(timeFilter);
        return {
            statusCode: 200,
            body: {
                status: 'ok',
                total: data.total,
                pending: data.pending,
                processing: data.processing,
                delivered: data.delivered,
                failed: data.failed,
                totalAttempts: data.totalAttempts,
                ...(from && to ? { from, to } : { window: windowSeconds })
            }
        };
    }

    function discovery(_ctx) {
        return {
            statusCode: 200,
            body: {
                status: 'ok',
                data: [
                    {
                        '{#METRIC}': 'queue.pending',
                        '{#LABEL}': 'Ожидают отправки'
                    },
                    {
                        '{#METRIC}': 'queue.processing',
                        '{#LABEL}': 'В обработке'
                    },
                    {
                        '{#METRIC}': 'queue.delivered',
                        '{#LABEL}': 'Доставлено'
                    },
                    {
                        '{#METRIC}': 'queue.failed',
                        '{#LABEL}': 'Ошибки'
                    },
                    {
                        '{#METRIC}': 'queue.total',
                        '{#LABEL}': 'Всего сообщений'
                    },
                    {
                        '{#METRIC}': 'queue.totalAttempts',
                        '{#LABEL}': 'Всего попыток'
                    }
                ]
            }
        };
    }

    function timeseries(ctx) {
        const windowSeconds = parseWindowSeconds(ctx.query?.window);
        const { from, to } = parseFromTo(ctx);
        const effectiveWindow = (from && to) ? 0 : windowSeconds;
        const data = reader.timeseries(effectiveWindow);
        return {
            statusCode: 200,
            body: {
                status: 'ok',
                ...(from && to ? { from, to } : { window: windowSeconds }),
                data
            }
        };
    }

    function top(ctx) {
        const by = ctx.query.by || 'source';
        const limit = normalizeLimit(ctx.query.limit, DEFAULT_TOP_LIMIT);
        const windowSeconds = parseWindowSeconds(ctx.query?.window);
        const { from, to } = parseFromTo(ctx);
        const timeFilter = reader.buildTimeFilter(windowSeconds, from, to);

        if (by === 'recipient') {
            const data = reader.topRecipient(limit, timeFilter);
            return {
                statusCode: 200,
                body: {
                    status: 'ok', by, limit, data,
                    ...(from && to ? { from, to } : { window: windowSeconds })
                }
            };
        }

        const data = reader.topSource(limit, timeFilter);
        return {
            statusCode: 200,
            body: {
                status: 'ok', by, limit, data,
                ...(from && to ? { from, to } : { window: windowSeconds })
            }
        };
    }

    function errors(ctx) {
        const limit = normalizeLimit(ctx.query.limit, DEFAULT_ERRORS_LIMIT);
        const windowSeconds = parseWindowSeconds(ctx.query?.window);
        const { from, to } = parseFromTo(ctx);
        const timeFilter = reader.buildTimeFilter(windowSeconds, from, to);
        const data = reader.errors(limit, timeFilter);
        return {
            statusCode: 200,
            body: {
                status: 'ok',
                limit, data,
                ...(from && to ? { from, to } : { window: windowSeconds })
            }
        };
    }

    return {
        summary,
        discovery,
        timeseries,
        top,
        errors
    };
}

module.exports = {
    MODULE_NAME,
    MAX_LIMIT,
    MIN_LIMIT,
    DEFAULT_TOP_LIMIT,
    DEFAULT_ERRORS_LIMIT,
    normalizeLimit,
    createMetricsRoutes
};
