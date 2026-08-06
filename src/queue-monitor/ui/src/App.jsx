// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './hooks/useSession.js';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ArchivePage from './pages/ArchivePage.jsx';
import MessageDetail from './pages/MessageDetail.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NavBar from './components/NavBar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

export default function App() {
    const { session, loading } = useSession();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <p className="text-muted-foreground">Загрузка…</p>
            </div>
        );
    }

    if (!session || !session.authenticated) {
        return <LoginPage />;
    }

    return (
        <HashRouter>
            <div className="min-h-screen bg-background">
                <NavBar user={session.user} csrf={session.csrf} />
                <main className="max-w-7xl mx-auto px-4 py-6">
                    <Routes>
                        <Route path="/dashboard" element={<DashboardPage user={session.user} csrf={session.csrf} />} />
                        <Route path="/archive" element={<ArchivePage />} />
                        <Route path="/archive/:id" element={<MessageDetail />} />
                        <Route
                            path="/settings"
                            element={
                                <ErrorBoundary>
                                    <SettingsPage />
                                </ErrorBoundary>
                            }
                        />
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                </main>
            </div>
        </HashRouter>
    );
}
