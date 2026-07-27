// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useRef, useCallback } from 'react';

function useDebounce(value, delay) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
}

export function useArchive({ page = 1, limit = 20, status, source, search, from, to, sort } = {}) {
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const abortRef = useRef(null);
    const searchDebounced = useDebounce(search, 300);

    const fetchArchive = useCallback(async (signal) => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', String(limit));
            params.set('sort', sort || 'created_at:desc');
            if (status) params.set('status', status);
            if (source) params.set('source', source);
            if (searchDebounced) params.set('search', searchDebounced);
            if (from && to) {
                params.set('from', String(from));
                params.set('to', String(to));
            }

            const res = await fetch(`/api/archive/messages?${params}`, {
                credentials: 'same-origin',
                signal
            });

            if (res.status === 401) {
                throw new Error('SESSION_EXPIRED');
            }
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const json = await res.json();
            setData(json.data || []);
            setTotal(json.total || 0);
            setPages(json.pages || 1);
        } catch (err) {
            if (err.name === 'AbortError') return;
            if (err.message === 'SESSION_EXPIRED') {
                window.location.href = '/api/auth/login';
                return;
            }
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [page, limit, status, source, searchDebounced, from, to, sort]);

    useEffect(() => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;
        fetchArchive(controller.signal);
        return () => controller.abort();
    }, [fetchArchive]);

    const refresh = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;
        fetchArchive(controller.signal);
    }, [fetchArchive]);

    return { data, total, pages, loading, error, refresh };
}
