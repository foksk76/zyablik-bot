// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Card, CardContent } from './ui/card.jsx';
import { Badge } from './ui/badge.jsx';

const CARDS = [
    { key: 'pending', label: 'Ожидают', variant: 'warning' },
    { key: 'processing', label: 'В обработке', variant: 'info' },
    { key: 'delivered', label: 'Доставлено', variant: 'success' },
    { key: 'failed', label: 'Ошибки', variant: 'error' }
];

export default function SummaryCards({ summary }) {
    if (!summary) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="animate-pulse h-24" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {CARDS.map((card) => (
                <Card key={card.key}>
                    <CardContent>
                        <div className="text-2xl font-semibold">{summary[card.key] ?? 0}</div>
                        <Badge variant={card.variant} className="mt-1">{card.label}</Badge>
                    </CardContent>
                </Card>
            ))}
            <Card>
                <CardContent>
                    <div className="text-2xl font-semibold text-neutral-800">{summary.total ?? 0}</div>
                    <div className="text-sm text-neutral-500">Всего</div>
                    <div className="text-xs text-neutral-400 mt-1">
                        попыток: {summary.totalAttempts ?? 0}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
