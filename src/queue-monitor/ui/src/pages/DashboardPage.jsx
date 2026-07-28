// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect } from 'react';
import SummaryCards from '../components/SummaryCards.jsx';
import TimeseriesChart from '../components/TimeseriesChart.jsx';
import TopTable from '../components/TopTable.jsx';
import ErrorsTable from '../components/ErrorsTable.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { useMetrics } from '../hooks/useMetrics.js';
import { useTimeRange } from '../hooks/useTimeRange.js';
import { useLogout } from '../hooks/useLogout.js';
import TimeRangeBar from '../components/TimeRangeBar.jsx';
import RefreshButton from '../components/RefreshButton.jsx';
import { Button } from '../components/ui/button.jsx';
import { Activity } from 'lucide-react';

export default function DashboardPage({ user, csrf }) {
    const { timeRange, setRelative, setAbsolute } = useTimeRange();
    const { logout, logoutError, dismissLogoutError } = useLogout(csrf);
    const [topLimit, setTopLimit] = useState(5);
    const [errorsLimit, setErrorsLimit] = useState(20);
    const [refreshMs, setRefreshMs] = useState(30000);
    const [countdown, setCountdown] = useState(refreshMs / 1000);

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

    function handleRefresh() {
        metrics.refreshNow();
        setCountdown(refreshMs / 1000);
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

    return (
        <div className="space-y-4">
            {logoutError && (
                <div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3 flex items-center justify-between">
                    <span>{logoutError}</span>
                    <Button variant="ghost" size="sm" onClick={dismissLogoutError}>×</Button>
                </div>
            )}

            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <RefreshButton
                        refreshMs={refreshMs}
                        countdown={countdown}
                        onRefresh={handleRefresh}
                        onIntervalChange={setRefreshMs}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <TimeRangeBar
                        timeRange={timeRange}
                        onTimeRangeChange={handleTimeRangeChange}
                    />
                </div>
            </div>

            {metrics.error && (
                <div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3">
                    Ошибка загрузки метрик: {metrics.error}
                </div>
            )}

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
        </div>
    );
}
