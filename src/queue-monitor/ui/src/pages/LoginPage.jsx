// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
            <Card className="max-w-sm w-full shadow-md">
                <CardContent className="text-center py-8">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-lg bg-brand-500 flex items-center justify-center">
                        <span className="text-white text-2xl font-bold">З</span>
                    </div>
                    <h1 className="text-xl font-semibold text-neutral-800 mb-1">Зяблик</h1>
                    <p className="text-sm text-neutral-500 mb-6">Дашборд очереди доставки</p>
                    <Button asChild className="w-full">
                        <a href="/api/auth/login">Войти через IdP</a>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
