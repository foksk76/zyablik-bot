// SPDX-License-Identifier: Apache-2.0
import React, { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Download, RotateCcw, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import { useArchive } from '../hooks/useArchive.js';
import { showToast } from '../lib/showToast.js';

const STATUS_VARIANTS = {
    delivered: 'bg-success-light text-success-dark border border-success/20',
    failed: 'bg-error-light text-error-dark border border-error/20',
    pending: 'bg-warning-light text-warning-dark border border-warning/20',
    processing: 'bg-info-light text-info-dark border border-info/20'
};

const STATUS_LABELS = {
    delivered: 'Delivered',
    failed: 'Failed',
    pending: 'Pending',
    processing: 'Processing'
};

const LIMIT_OPTIONS = [20, 50, 100];

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

function parseRecipient(payload) {
    try {
        const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
        return obj?.recipient?.value || '—';
    } catch {
        return '—';
    }
}

function SkeletonRow() {
    return (
        <tr className="border-b border-border animate-pulse">
            <td className="px-4 py-3"><div className="h-4 bg-muted rounded w-8" /></td>
            <td className="px-4 py-3"><div className="h-4 bg-muted rounded w-32" /></td>
            <td className="px-4 py-3"><div className="h-5 bg-muted rounded w-16" /></td>
            <td className="px-4 py-3"><div className="h-4 bg-muted rounded w-20" /></td>
            <td className="px-4 py-3"><div className="h-4 bg-muted rounded w-24" /></td>
            <td className="px-4 py-3"><div className="h-4 bg-muted rounded w-6" /></td>
            <td className="px-4 py-3"><div className="h-4 bg-muted rounded w-10" /></td>
        </tr>
    );
}

function SortIndicator({ column, sort }) {
    const [field, dir] = sort.split(':');
    if (field !== column) {
        return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    }
    return dir === 'asc'
        ? <ArrowUp className="w-3 h-3 ml-1" />
        : <ArrowDown className="w-3 h-3 ml-1" />;
}

function DatePresets({ onPreset, activePreset }) {
    const presets = [
        { key: 'today', label: 'Сегодня' },
        { key: 'yesterday', label: 'Вчера' },
        { key: 'week', label: 'Неделя' },
        { key: 'month', label: 'Месяц' }
    ];

    return (
        <div className="flex gap-1">
            {presets.map((p) => (
                <button
                    key={p.key}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                        activePreset === p.key
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:bg-accent'
                    }`}
                    onClick={() => onPreset(p.key)}
                >
                    {p.label}
                </button>
            ))}
        </div>
    );
}

function ExportDropdown({ onExport, disabled }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => setOpen(!open)}
            >
                <Download className="w-4 h-4 mr-1 shrink-0" />
                Экспорт
            </Button>
            {open && (
                <div className="absolute top-full right-0 mt-1 bg-background border rounded-md shadow-md z-50 min-w-[100px]">
                    <button
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
                        onClick={() => { onExport('csv'); setOpen(false); }}
                    >
                        CSV
                    </button>
                    <button
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
                        onClick={() => { onExport('json'); setOpen(false); }}
                    >
                        JSON
                    </button>
                </div>
            )}
        </div>
    );
}

function Pagination({ page, pages, onPageChange }) {
    const pageNumbers = useMemo(() => {
        const nums = [];
        const delta = 2;
        const left = Math.max(2, page - delta);
        const right = Math.min(pages - 1, page + delta);

        nums.push(1);
        if (left > 2) nums.push('...');
        for (let i = left; i <= right; i++) nums.push(i);
        if (right < pages - 1) nums.push('...');
        if (pages > 1) nums.push(pages);

        return nums;
    }, [page, pages]);

    if (pages <= 1) return null;

    return (
        <div className="flex items-center justify-center gap-1 text-sm">
            <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
            >
                <ChevronLeft className="w-4 h-4" />
            </Button>
            {pageNumbers.map((n, i) =>
                n === '...' ? (
                    <span key={`dots-${i}`} className="px-1 text-muted-foreground">…</span>
                ) : (
                    <Button
                        key={n}
                        variant={n === page ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => onPageChange(n)}
                    >
                        {n}
                    </Button>
                )
            )}
            <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => onPageChange(page + 1)}
            >
                <ChevronRight className="w-4 h-4" />
            </Button>
        </div>
    );
}

export default function ArchivePage() {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [sort, setSort] = useState('created_at:desc');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [source, setSource] = useState('');
    const [datePreset, setDatePreset] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const fromTs = useMemo(() => {
        if (datePreset) return getPresetTs(datePreset).from;
        if (dateFrom && dateTo) {
            return Math.floor(new Date(dateFrom).getTime() / 1000);
        }
        return null;
    }, [datePreset, dateFrom, dateTo]);

    const toTs = useMemo(() => {
        if (datePreset) return getPresetTs(datePreset).to;
        if (dateFrom && dateTo) {
            return Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000);
        }
        return null;
    }, [datePreset, dateFrom, dateTo]);

    const { data, total, pages, loading, error, refresh } = useArchive({
        page, limit, status, source, search, from: fromTs, to: toTs, sort
    });

    const handleSort = useCallback((col) => {
        setSort((prev) => {
            const [field, dir] = prev.split(':');
            if (field === col) {
                return `${col}:${dir === 'asc' ? 'desc' : 'asc'}`;
            }
            return `${col}:asc`;
        });
    }, []);

    const handlePageChange = useCallback((p) => {
        setPage(p);
    }, []);

    const handleFilterChange = useCallback((setter) => (e) => {
        setter(e.target.value);
        setPage(1);
    }, []);

    const handlePreset = useCallback((key) => {
        setDatePreset((prev) => prev === key ? '' : key);
        setDateFrom('');
        setDateTo('');
        setPage(1);
    }, []);

    const handleReset = useCallback(() => {
        setSearch('');
        setStatus('');
        setSource('');
        setDatePreset('');
        setDateFrom('');
        setDateTo('');
        setPage(1);
    }, []);

    const handleExport = useCallback(async (format) => {
        try {
            const params = new URLSearchParams();
            params.set('format', format);
            if (status) params.set('status', status);
            if (source) params.set('source', source);
            if (search) params.set('search', search);
            if (fromTs && toTs) {
                params.set('from', String(fromTs));
                params.set('to', String(toTs));
            }

            const res = await fetch(`/api/archive/export?${params}`, { credentials: 'same-origin' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const now = new Date();
            const ts = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}_${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
            a.href = url;
            a.download = `archive_${ts}.${format}`;
            a.click();
            URL.revokeObjectURL(url);
            showToast(`Экспорт ${format.toUpperCase()} завершён`, 'success');
        } catch (err) {
            showToast(`Ошибка экспорта: ${err.message}`, 'error');
        }
    }, [status, source, search, fromTs, toTs]);

    const handleRetry = useCallback(async (id) => {
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
        }
    }, []);

    return (
        <div className="space-y-4">
            {/* Filter panel */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Поиск по payload..."
                            value={search}
                            onChange={handleFilterChange(setSearch)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-md bg-background"
                        />
                    </div>
                    <select
                        value={status}
                        onChange={handleFilterChange(setStatus)}
                        className="px-3 py-1.5 text-sm border border-border rounded-md bg-background"
                    >
                        <option value="">Все статусы</option>
                        <option value="delivered">Delivered</option>
                        <option value="failed">Failed</option>
                        <option value="pending">Pending</option>
                        <option value="processing">Processing</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Источник"
                        value={source}
                        onChange={handleFilterChange(setSource)}
                        className="px-3 py-1.5 text-sm border border-border rounded-md bg-background w-32"
                    />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <DatePresets onPreset={handlePreset} activePreset={datePreset} />
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); setDatePreset(''); setPage(1); }}
                        className="px-2 py-1 text-xs border border-border rounded-md bg-background"
                    />
                    <span className="text-xs text-muted-foreground">—</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); setDatePreset(''); setPage(1); }}
                        className="px-2 py-1 text-xs border border-border rounded-md bg-background"
                    />
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Сбросить
                    </Button>
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                        Обновить
                    </Button>
                    <ExportDropdown onExport={handleExport} disabled={loading} />
                </div>
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                {[
                                    { key: 'id', label: 'ID' },
                                    { key: 'created_at', label: 'Дата' },
                                    { key: 'status', label: 'Статус' },
                                    { key: 'source', label: 'Источник' },
                                    { key: null, label: 'Получатель' },
                                    { key: 'attempts', label: 'Попытки' },
                                    { key: null, label: '' }
                                ].map((col, i) => (
                                    <th
                                        key={i}
                                        className={`px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide ${
                                            col.key ? 'cursor-pointer hover:text-foreground select-none' : ''
                                        }`}
                                        onClick={col.key ? () => handleSort(col.key) : undefined}
                                    >
                                        <span className="inline-flex items-center">
                                            {col.label}
                                            {col.key && <SortIndicator column={col.key} sort={sort} />}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                            ) : error ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                                        <p className="text-sm">{error}</p>
                                        <Button variant="outline" size="sm" className="mt-2" onClick={refresh}>
                                            Повторить
                                        </Button>
                                    </td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                                        <p className="text-sm font-medium">Сообщений не найдено</p>
                                        <p className="text-xs mt-1">Попробуйте изменить фильтры</p>
                                    </td>
                                </tr>
                            ) : (
                                data.map((msg) => (
                                    <tr
                                        key={msg.id}
                                        className="border-b border-border hover:bg-muted/50 cursor-pointer"
                                        onClick={() => { window.location.hash = `#/archive/${msg.id}`; }}
                                    >
                                        <td className="px-4 py-3 text-muted-foreground">{msg.id}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(msg.createdAt)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_VARIANTS[msg.status] || ''}`}>
                                                {STATUS_LABELS[msg.status] || msg.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{msg.source || '—'}</td>
                                        <td className="px-4 py-3">{parseRecipient(msg.payload)}</td>
                                        <td className="px-4 py-3 text-center">{msg.attempts}</td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRetry(msg.id)}
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination + limit */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted-foreground">
                    {total > 0 ? `Всего: ${total} · Стр. ${page} из ${pages}` : ''}
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={limit}
                        onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                        className="px-2 py-1 text-xs border border-border rounded-md bg-background"
                    >
                        {LIMIT_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n} / стр.</option>
                        ))}
                    </select>
                    <Pagination page={page} pages={pages} onPageChange={handlePageChange} />
                </div>
            </div>
        </div>
    );
}

function getPresetTs(key) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    switch (key) {
        case 'today':
            return { from: Math.floor(start.getTime() / 1000), to: Math.floor(now.getTime() / 1000) };
        case 'yesterday': {
            const prev = new Date(start);
            prev.setDate(prev.getDate() - 1);
            return { from: Math.floor(prev.getTime() / 1000), to: Math.floor(start.getTime() / 1000) };
        }
        case 'week': {
            const week = new Date(start);
            week.setDate(week.getDate() - 7);
            return { from: Math.floor(week.getTime() / 1000), to: Math.floor(now.getTime() / 1000) };
        }
        case 'month': {
            const month = new Date(start);
            month.setDate(month.getDate() - 30);
            return { from: Math.floor(month.getTime() / 1000), to: Math.floor(now.getTime() / 1000) };
        }
        default:
            return { from: null, to: null };
    }
}
