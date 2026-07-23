// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useRef, useCallback } from 'react';

// ADR-0034/ADR-0035: загрузка метрик с /api/metrics/* с автообновлением.
// Session-авторизация (ADR-0035) — session cookie отправляется автоматически
// (credentials: 'same-origin'), Bearer token не нужен для UI.
//
// Возвращает { summary, timeseries, top, errors, loading, error, refresh, lastUpdated }.
export function useMetrics({ windowSeconds = 3600, refreshMs = 30000 }) {
    const [summary, setSummary] = useState(null);
    const [timeseries, setTimeseries] = useState(null);
    const [top, setTop] = useState(null);
    const [topBy, setTopBy] = useState('source');
    const [errors, setErrors] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const refreshRef = useRef(null);

    const refresh = useCallback(async () => {
        try {
            const fetchJson = async (url) => {
                const r = await fetch(url, { credentials: 'same-origin' });
                if (r.status === 401) {
                    throw new Error('SESSION_EXPIRED');
                }
                if (!r.ok) {
                    throw new Error(`HTTP ${r.status}`);
                }
                return r.json();
            };
            const [sumRes, tsRes, topRes, errRes] = await Promise.all([
                fetchJson('/api/metrics/summary'),
                fetchJson(`/api/metrics/timeseries?window=${windowSeconds}`),
                fetchJson(`/api/metrics/top?by=${topBy}&limit=5`),
                fetchJson('/api/metrics/errors?limit=20')
            ]);
            setSummary(sumRes);
            setTimeseries(tsRes);
            setTop(topRes);
            setErrors(errRes);
            setError(null);
            setLastUpdated(new Date());
        } catch (err) {
            if (err.message === 'SESSION_EXPIRED') {
                setError('Сессия истекла. Войдите заново.');
            } else {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    }, [windowSeconds, topBy]);

    useEffect(() => {
        refresh();
        if (refreshRef.current) {
            clearInterval(refreshRef.current);
        }
        refreshRef.current = setInterval(refresh, refreshMs);
        return () => {
            if (refreshRef.current) {
                clearInterval(refreshRef.current);
            }
        };
    }, [refresh, refreshMs]);

    return {
        summary,
        timeseries,
        top,
        errors,
        topBy,
        setTopBy,
        loading,
        error,
        refresh,
        lastUpdated
    };
}
