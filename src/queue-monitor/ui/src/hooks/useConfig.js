// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useRef, useCallback } from 'react';

// ADR-0046: работа с /api/config/* — загрузка effective-конфига, схемы и
// статуса apply/rollback. Session-авторизация (ADR-0035) — credentials.
//
// Возвращает:
//   config    — { version, fileExists, sections }
//   schema    — merged-схема (для рендера форм)
//   status    — { state, reason, appliedAt, appliedHash, pendingRemainingMs }
//   loading, error, refresh, statusRefreshMs (период опроса status)
export function useConfig({ refreshMs = 30000, statusPollMs = 3000 } = {}) {
    const [config, setConfig] = useState(null);
    const [schema, setSchema] = useState(null);
    const [status, setStatus] = useState({ state: 'idle' });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const statusRef = useRef(null);

    const fetchJson = useCallback(async (url, options = {}) => {
        const res = await fetch(url, { credentials: 'same-origin', ...options });
        if (res.status === 401) {
            throw new Error('SESSION_EXPIRED');
        }
        if (res.status === 429) {
            throw new Error('RATE_LIMITED');
        }
        if (!res.ok) {
            const json = await res.json().catch(() => null);
            const err = new Error(json && json.error ? json.error : `HTTP ${res.status}`);
            err.status = res.status;
            err.body = json;
            throw err;
        }
        return res.json();
    }, []);

    const refresh = useCallback(async () => {
        try {
            const [configRes, schemaRes] = await Promise.all([
                fetchJson('/api/config'),
                fetchJson('/api/config/schema')
            ]);
            setConfig(configRes.data);
            setSchema(schemaRes.data.schema);
            setError(null);
        } catch (err) {
            if (err.message === 'SESSION_EXPIRED') {
                window.location.href = '/api/auth/login';
                return;
            }
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [fetchJson]);

    const refreshStatus = useCallback(async () => {
        try {
            const res = await fetchJson('/api/config/status');
            setStatus(res.data);
        } catch (err) {
            if (err.message === 'SESSION_EXPIRED') {
                window.location.href = '/api/auth/login';
            }
        }
    }, [fetchJson]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, refreshMs);
        return () => clearInterval(interval);
    }, [refresh, refreshMs]);

    // Опрос status чаще (для banner'а pending/rolled_back).
    useEffect(() => {
        refreshStatus();
        statusRef.current = setInterval(refreshStatus, statusPollMs);
        return () => clearInterval(statusRef.current);
    }, [refreshStatus, statusPollMs]);

    // Mutation-операции: stage/apply/rollback/import.
    // Возвращает { ok, message }.
    const mutate = useCallback(async (method, url, body) => {
        try {
            const res = await fetch(url, {
                method,
                credentials: 'same-origin',
                headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
            if (res.status === 401) {
                window.location.href = '/api/auth/login';
                return { ok: false, message: 'Сессия истекла' };
            }
            const json = await res.json().catch(() => null);
            if (!res.ok) {
                if (res.status === 409) {
                    return { ok: false, message: json && json.error ? json.error : 'Другая операция уже выполняется' };
                }
                if (res.status === 429) {
                    return { ok: false, message: 'Слишком много операций — подождите' };
                }
                const errors = json && json.errors && json.errors.length
                    ? json.errors.map((e) => `${e.section || ''}${e.field ? '.' + e.field : ''}: ${e.reason}`).join('; ')
                    : (json && json.error ? json.error : `HTTP ${res.status}`);
                return { ok: false, message: errors };
            }
            return { ok: true, message: json && json.data ? json.data : json };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    }, []);

    return {
        config,
        schema,
        status,
        loading,
        error,
        refresh,
        refreshStatus,
        mutate
    };
}
