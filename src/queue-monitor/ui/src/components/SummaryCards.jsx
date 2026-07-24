// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Card, CardContent } from './ui/card.jsx';
import { Badge } from './ui/badge.jsx';
import { Clock, Loader, CheckCircle, XCircle } from 'lucide-react';

const CARDS = [
    { key: 'pending', label: 'Ожидают', variant: 'warning', Icon: Clock },
    { key: 'processing', label: 'В обработке', variant: 'info', Icon: Loader },
    { key: 'delivered', label: 'Доставлено', variant: 'success', Icon: CheckCircle },
    { key: 'failed', label: 'Ошибки', variant: 'error', Icon: XCircle }
];

const BORDER_COLORS = {
    warning: 'border-l-warning',
    info: 'border-l-info',
    success: 'border-l-success',
    error: 'border-l-error'
};

function pct(value, total) {
    if (!total) return null;
    const p = Math.round((value / total) * 100);
    if (p === 0 && value > 0) return '<1%';
    if (p === 100 && value < total) return '99%';
    return `${p}%`;
}

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

    const total = summary.total ?? 0;

    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {CARDS.map((card) => {
                const value = summary[card.key] ?? 0;
                const share = pct(value, total);
                return (
                    <Card key={card.key} className={`border-l-4 ${BORDER_COLORS[card.variant]}`}>
                        <CardContent>
                            <div className="text-2xl font-semibold">{value}</div>
                            <Badge variant={card.variant} className="mt-1">
                                <card.Icon className="w-4 h-4 mr-1 shrink-0" />
                                {card.label}
                            </Badge>
                            {share !== null && (
                                <div className="text-xs text-muted-foreground mt-1.5">{share}</div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
            <Card className="border-l-4 border-l-primary">
                <CardContent>
                    <div className="text-2xl font-semibold text-foreground">{total}</div>
                    <div className="text-sm text-muted-foreground">Всего</div>
                    <div className="text-xs text-muted-foreground mt-1.5">
                        попыток: {summary.totalAttempts ?? 0}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
