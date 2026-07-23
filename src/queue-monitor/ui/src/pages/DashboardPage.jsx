// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect } from 'react';
import SummaryCards from '../components/SummaryCards.jsx';
import TimeseriesChart from '../components/TimeseriesChart.jsx';
import TopTable from '../components/TopTable.jsx';
import ErrorsTable from '../components/ErrorsTable.jsx';
import { useMetrics } from '../hooks/useMetrics.js';

// ADR-0035: session-авторизация — оператор залогинен через OAuth2,
// session cookie используется автоматически для /api/metrics/*.
export default function DashboardPage({ user, csrf }) {
    const [windowSeconds, setWindowSeconds] = useState(3600);

    const metrics = useMetrics({
        windowSeconds,
        refreshMs: 30000
    });

    async function logout() {
        try {
            const r = await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrf },
                credentials: 'same-origin'
            });
            // Сервер вернул ответ, но logout не прошёл (403 CSRF, 500 и т.д.) —
            // сессия может быть ещё активна. Предупредить пользователя, но
            // всё равно уйти со страницы (UI logout — best-effort).
            if (!r.ok) {
                alert(`Не удалось выйти (сервер: ${r.status}). Сессия может быть активна.`);
            }
        } catch {
            // Network error — redirect anyway (session may already be destroyed)
        }
        window.location.href = '/';
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-brand-500 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">З</span>
                        </div>
                        <h1 className="text-base font-semibold text-slate-800">Зяблик — очередь доставки</h1>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="text-slate-500 hidden sm:inline">{user?.name || user?.email || user?.sub}</span>
                        <button
                            onClick={logout}
                            className="text-slate-500 hover:text-slate-700"
                        >
                            Выйти
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => metrics.refresh()}
                        className="text-xs text-slate-500 hover:text-slate-700"
                    >
                        ↻ обновить
                    </button>
                </div>

                {metrics.error && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg p-3">
                        Ошибка загрузки метрик: {metrics.error}
                    </div>
                )}

                <SummaryCards summary={metrics.summary} />

                <TimeseriesChart
                    timeseries={metrics.timeseries}
                    windowSeconds={windowSeconds}
                    onWindowChange={setWindowSeconds}
                />

                <div className="grid md:grid-cols-2 gap-4">
                    <TopTable
                        top={metrics.top}
                        topBy={metrics.topBy}
                        onByChange={metrics.setTopBy}
                    />
                    <ErrorsTable errors={metrics.errors} />
                </div>

                {metrics.lastUpdated && (
                    <p className="text-xs text-slate-400 text-center">
                        обновлено: {metrics.lastUpdated.toLocaleTimeString('ru-RU')}
                    </p>
                )}
            </main>
        </div>
    );
}
