// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import { showToast } from '../lib/showToast.js';

const STATUS_VARIANTS = {
    delivered: 'bg-success-light text-success-dark border border-success/20',
    failed: 'bg-error-light text-error-dark border border-error/20',
    pending: 'bg-warning-light text-warning-dark border border-warning/20',
    processing: 'bg-info-light text-info-dark border border-info/20'
};

function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`;
}

function DetailRow({ label, value }) {
    return (
        <div className="grid grid-cols-[140px_1fr] gap-2 py-2 border-b border-border last:border-b-0">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
            <span className="text-sm">{value}</span>
        </div>
    );
}

export default function MessageDetail() {
    const { id } = useParams();
    const [msg, setMsg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retrying, setRetrying] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/archive/messages/${id}`, { credentials: 'same-origin' });
                if (res.status === 401) {
                    window.location.href = '/api/auth/login';
                    return;
                }
                if (res.status === 404) {
                    if (!cancelled) setError('Сообщение не найдено');
                    return;
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (!cancelled) setMsg(json.data);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [id]);

    async function handleRetry() {
        setRetrying(true);
        try {
            const res = await fetch(`/api/archive/retry/${id}`, {
                method: 'POST',
                credentials: 'same-origin'
            });
            const json = await res.json();
            if (!res.ok) {
                showToast(json.error || `Ошибка (${res.status})`, 'error');
                return;
            }
            showToast('Сообщение создано', 'success');
        } catch (err) {
            showToast(`Ошибка: ${err.message}`, 'error');
        } finally {
            setRetrying(false);
        }
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <Link to="/archive" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Назад к архиву
                </Link>
                <div className="bg-card border border-border rounded-lg p-6 animate-pulse space-y-4">
                    <div className="h-5 bg-muted rounded w-48" />
                    <div className="h-4 bg-muted rounded w-32" />
                    <div className="h-4 bg-muted rounded w-64" />
                    <div className="h-20 bg-muted rounded" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-4">
                <Link to="/archive" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Назад к архиву
                </Link>
                <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground">
                    <p className="text-sm">{error}</p>
                </div>
            </div>
        );
    }

    let payloadFormatted = '—';
    try {
        const obj = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
        payloadFormatted = JSON.stringify(obj, null, 2);
    } catch {
        payloadFormatted = String(msg.payload);
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Link to="/archive" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Назад к архиву
                </Link>
                <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
                    <RefreshCw className={`w-4 h-4 mr-1 ${retrying ? 'animate-spin' : ''}`} />
                    Повторить
                </Button>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Сообщение #{msg.id}</h2>

                <div className="space-y-0">
                    <DetailRow label="ID" value={msg.id} />
                    <DetailRow label="reqId" value={msg.reqId || '—'} />
                    <DetailRow label="Создано" value={formatDate(msg.createdAt)} />
                    <DetailRow label="Обновлено" value={formatDate(msg.updatedAt)} />
                    <DetailRow
                        label="Статус"
                        value={
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_VARIANTS[msg.status] || ''}`}>
                                {msg.status}
                            </span>
                        }
                    />
                    <DetailRow label="Источник" value={msg.source || '—'} />
                    <DetailRow label="Попытки" value={msg.attempts} />
                </div>

                <div className="mt-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Payload</h3>
                    <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                        {payloadFormatted}
                    </pre>
                </div>
            </div>
        </div>
    );
}
