// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { useSession } from './hooks/useSession.js';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';

export default function App() {
    const { session, loading } = useSession();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-50">
                <p className="text-neutral-500">Загрузка…</p>
            </div>
        );
    }

    if (!session || !session.authenticated) {
        return <LoginPage />;
    }

    return <DashboardPage user={session.user} csrf={session.csrf} />;
}
