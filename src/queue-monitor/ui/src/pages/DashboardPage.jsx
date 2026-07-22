import React, { useState, useEffect } from 'react';
import SummaryCards from '../components/SummaryCards.jsx';
import TimeseriesChart from '../components/TimeseriesChart.jsx';
import TopTable from '../components/TopTable.jsx';
import ErrorsTable from '../components/ErrorsTable.jsx';
import { useMetrics } from '../hooks/useMetrics.js';

const API_KEY_STORAGE = 'zyablik.metricsApiKey';

// Dashboard: оператор видит метрики, если ввёл METRICS_API_KEY
// (bearer для /api/metrics/*). Ключ хранится в sessionStorage (не localStorage):
// любой XSS-скрипт может прочитать localStorage на всём origin; sessionStorage
// ограничен текущей вкладкой, что сужает поверхность атаки. Для single-operator
// дашборда повторный ввод ключа при новой вкладке приемлем.
export default function DashboardPage({ user, csrf }) {
    const [apiKey, setApiKey] = useState(() => sessionStorage.getItem(API_KEY_STORAGE) || '');
    const [apiKeyDraft, setApiKeyDraft] = useState(apiKey);
    const [windowSeconds, setWindowSeconds] = useState(3600);
    const [showKeyInput, setShowKeyInput] = useState(!apiKey);

    const metrics = useMetrics({
        apiKey,
        windowSeconds,
        refreshMs: 30000
    });

    function saveApiKey() {
        setApiKey(apiKeyDraft.trim());
        sessionStorage.setItem(API_KEY_STORAGE, apiKeyDraft.trim());
        setShowKeyInput(false);
    }

    async function logout() {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrf },
            credentials: 'same-origin'
        });
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
                {showKeyInput ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-6">
                        <h2 className="text-sm font-medium text-slate-700 mb-2">METRICS_API_KEY</h2>
                        <p className="text-xs text-slate-500 mb-3">
                            Bearer-токен для чтения метрик. Сохраняется только в этом браузере.
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                value={apiKeyDraft}
                                onChange={(e) => setApiKeyDraft(e.target.value)}
                                placeholder="metrics-api-key"
                                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                            <button
                                onClick={saveApiKey}
                                disabled={!apiKeyDraft.trim()}
                                className="bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 text-white text-sm font-medium px-4 rounded-lg transition-colors"
                            >
                                Сохранить
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => metrics.refresh()}
                                className="text-xs text-slate-500 hover:text-slate-700"
                            >
                                ↻ обновить
                            </button>
                            <button
                                onClick={() => setShowKeyInput(true)}
                                className="text-xs text-slate-400 hover:text-slate-600"
                            >
                                сменить ключ
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
                    </>
                )}
            </main>
        </div>
    );
}
