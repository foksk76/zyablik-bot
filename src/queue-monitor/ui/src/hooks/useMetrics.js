import { useState, useEffect, useRef, useCallback } from 'react';

// ADR-0034: загрузка метрик с /api/metrics/* с автообновлением.
// metricsApiKey — Bearer token для metrics endpoints (вводится оператором в UI,
// т.к. metrics API не входит в session-auth domain).
//
// Возвращает { summary, timeseries, top, errors, loading, error, refresh, lastUpdated }.
export function useMetrics({ apiKey, windowSeconds = 3600, refreshMs = 30000 }) {
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
        if (!apiKey) {
            setError('METRICS_API_KEY не задан');
            setLoading(false);
            return;
        }
        // headers конструируется ВНУТРИ refresh, а не на каждом render — иначе
        // новый объект в deps useCallback делал бы refresh нестабильным и
        // вызывал бесконечный re-fetch цикл (H1 из PR review).
        const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
        try {
            const [sumRes, tsRes, topRes, errRes] = await Promise.all([
                fetch('/api/metrics/summary', { headers }).then((r) => r.json()),
                fetch(`/api/metrics/timeseries?window=${windowSeconds}`, { headers }).then((r) => r.json()),
                fetch(`/api/metrics/top?by=${topBy}&limit=5`, { headers }).then((r) => r.json()),
                fetch('/api/metrics/errors?limit=20', { headers }).then((r) => r.json())
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
    }, [apiKey, windowSeconds, topBy]);

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
