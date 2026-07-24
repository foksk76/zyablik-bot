// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useRef } from 'react';
import SummaryCards from '../components/SummaryCards.jsx';
import TimeseriesChart from '../components/TimeseriesChart.jsx';
import TopTable from '../components/TopTable.jsx';
import ErrorsTable from '../components/ErrorsTable.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { useMetrics } from '../hooks/useMetrics.js';
import { useTimeRange } from '../hooks/useTimeRange.js';
import TimeRangeBar from '../components/TimeRangeBar.jsx';
import { Button } from '../components/ui/button.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { RefreshCw, LogOut, Clock, Activity } from 'lucide-react';

// ADR-0041: интервалы автообновления (раздел 4).
const REFRESH_OPTIONS = [
    { label: '30с', ms: 30000 },
    { label: '1м', ms: 60000 },
    { label: '5м', ms: 300000 },
    { label: '10м', ms: 600000 },
    { label: '30м', ms: 1800000 },
    { label: 'выкл', ms: 0 }
];

export default function DashboardPage({ user, csrf }) {
    const { timeRange, setRelative, setAbsolute } = useTimeRange();
    const [logoutError, setLogoutError] = useState(null);
    const [topLimit, setTopLimit] = useState(5);
    const [errorsLimit, setErrorsLimit] = useState(20);
    const [refreshMs, setRefreshMs] = useState(30000);
    const [countdown, setCountdown] = useState(refreshMs / 1000);
    const logoutTimerRef = useRef(null);

    const metrics = useMetrics({
        timeRange,
        refreshMs,
        topLimit,
        errorsLimit
    });

    const sessionExpired = metrics.error && metrics.error.includes('Сессия истекла');

    useEffect(() => {
        if (sessionExpired || refreshMs === 0) {
            return;
        }
        const timer = setInterval(() => {
            setCountdown((prev) => (prev <= 1 ? refreshMs / 1000 : prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [sessionExpired, refreshMs]);

    useEffect(() => {
        if (sessionExpired) {
            return;
        }
        setCountdown(refreshMs / 1000);
    }, [topLimit, errorsLimit, metrics.topBy, timeRange, sessionExpired, refreshMs]);

    useEffect(() => {
        return () => {
            if (logoutTimerRef.current) {
                clearTimeout(logoutTimerRef.current);
            }
        };
    }, []);

    function dismissLogoutError() {
        if (logoutTimerRef.current) {
            clearTimeout(logoutTimerRef.current);
            logoutTimerRef.current = null;
        }
        setLogoutError(null);
    }

    function handleRefresh() {
        metrics.refreshNow();
        setCountdown(refreshMs / 1000);
    }

    function handleRefreshOptionChange(ms) {
        setRefreshMs(ms);
        setCountdown(ms / 1000);
    }

    function handleTimeRangeChange(mode, value) {
        if (mode === 'relative') {
            setRelative(value);
        } else {
            setAbsolute(value.from, value.to);
        }
    }

    function handlePan(fromTs, toTs) {
        setAbsolute(fromTs, toTs);
    }

    async function logout() {
        try {
            const r = await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'same-origin'
            });
            if (!r.ok) {
                setLogoutError(`Не удалось выйти (сервер: ${r.status}). Сессия может быть активна.`);
                logoutTimerRef.current = setTimeout(() => { window.location.href = '/'; }, 3000);
                return;
            }
        } catch {
            // Network error — redirect anyway (session may already be destroyed)
        }
        window.location.href = '/';
    }

    return (
        <div className="min-h-screen bg-background">
            <header className="bg-card border-b border-border">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                            <span className="text-primary-foreground font-bold text-sm">З</span>
                        </div>
                        <h1 className="text-base font-semibold text-foreground">Зяблик — очередь доставки</h1>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground hidden sm:inline">{user?.name || user?.email || user?.sub}</span>
                        <ThemeToggle />
                        <Button variant="ghost" size="sm" onClick={logout}>
                            <LogOut className="w-4 h-4 mr-1 shrink-0" />
                            Выйти
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
                {logoutError && (
                    <div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3 flex items-center justify-between">
                        <span>{logoutError}</span>
                        <Button variant="ghost" size="sm" onClick={dismissLogoutError}>×</Button>
                    </div>
                )}

                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={handleRefresh}>
                            <RefreshCw className="w-4 h-4 mr-1 shrink-0" />
                            {refreshMs > 0 ? `обновить (${countdown}с)` : 'обновить'}
                        </Button>
                        <div className="flex gap-0.5">
                            {REFRESH_OPTIONS.map((opt) => (
                                <Button
                                    key={opt.ms}
                                    variant={refreshMs === opt.ms ? 'default' : 'ghost'}
                                    size="sm"
                                    className="text-xs h-7 px-2"
                                    onClick={() => handleRefreshOptionChange(opt.ms)}
                                >
                                    {opt.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                    {metrics.lastUpdated && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                            <Clock className="w-3 h-3 inline mr-0.5" />
                            {metrics.lastUpdated.toLocaleTimeString('ru-RU')}
                        </span>
                    )}
                </div>

                {metrics.error && (
                    <div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3">
                        Ошибка загрузки метрик: {metrics.error}
                    </div>
                )}

                <TimeRangeBar
                    timeRange={timeRange}
                    onTimeRangeChange={handleTimeRangeChange}
                />

                <ErrorBoundary>
                    <SummaryCards summary={metrics.summary} />
                </ErrorBoundary>

                <ErrorBoundary>
                    <TimeseriesChart
                        timeseries={metrics.timeseries}
                        onPan={handlePan}
                    />
                </ErrorBoundary>

                <div className="grid md:grid-cols-2 gap-4 [&>*]:min-w-0">
                    <ErrorBoundary>
                        <TopTable
                            top={metrics.top}
                            topBy={metrics.topBy}
                            onByChange={metrics.setTopBy}
                            limit={topLimit}
                            onLimitChange={setTopLimit}
                        />
                    </ErrorBoundary>
                    <ErrorBoundary>
                        <ErrorsTable
                            errors={metrics.errors}
                            limit={errorsLimit}
                            onLimitChange={setErrorsLimit}
                        />
                    </ErrorBoundary>
                </div>

                {metrics.lastUpdated && (
                    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2 pb-4">
                        <span>
                            <Clock className="w-3 h-3 inline mr-0.5" />
                            обновлено: {metrics.lastUpdated.toLocaleTimeString('ru-RU')}
                        </span>
                        {!sessionExpired && refreshMs > 0 && (
                            <span>
                                <Activity className="w-3 h-3 inline mr-0.5" />
                                следующее: ~{countdown}с
                            </span>
                        )}
                        <span className={
                            metrics.error
                                ? 'text-error-dark'
                                : 'text-success-dark'
                        }>
                            {metrics.error ? '⚠ degraded' : '● healthy'}
                        </span>
                    </div>
                )}
            </main>
        </div>
    );
}
