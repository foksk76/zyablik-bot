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
            const [sumRes, tsRes, topRes, errRes] = await Promise.all([
                fetch('/api/metrics/summary', { credentials: 'same-origin' }).then((r) => r.json()),
                fetch(`/api/metrics/timeseries?window=${windowSeconds}`, { credentials: 'same-origin' }).then((r) => r.json()),
                fetch(`/api/metrics/top?by=${topBy}&limit=5`, { credentials: 'same-origin' }).then((r) => r.json()),
                fetch('/api/metrics/errors?limit=20', { credentials: 'same-origin' }).then((r) => r.json())
            ]);
            setSummary(sumRes);
            setTimeseries(tsRes);
            setTop(topRes);
            setErrors(errRes);
            setError(null);
            setLastUpdated(new Date());
        } catch (err) {
            setError(err.message);
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
