// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { Button } from './ui/button.jsx';
import { Clock } from 'lucide-react';
import { semantic, neutral } from '../tokens/colors.js';
import { useTheme } from '../hooks/useTheme.js';

const WINDOWS = [
    { label: '1ч', seconds: 3600 },
    { label: '6ч', seconds: 21600 },
    { label: '12ч', seconds: 43200 },
    { label: '24ч', seconds: 86400 }
];

const STATUS_LABELS = {
    delivered: 'Доставлено',
    failed: 'Ошибки',
    pending: 'Ожидают',
    processing: 'В обработке'
};

const STATUS_COLORS = {
    delivered: semantic.success.DEFAULT,
    failed: semantic.error.DEFAULT,
    pending: semantic.warning.DEFAULT,
    processing: semantic.info.DEFAULT
};

function pivot(rows) {
    const byBucket = new Map();
    for (const row of rows || []) {
        if (!byBucket.has(row.bucket)) {
            byBucket.set(row.bucket, { bucket: row.bucket });
        }
        byBucket.get(row.bucket)[row.status] = (byBucket.get(row.bucket)[row.status] || 0) + row.count;
    }
    return Array.from(byBucket.values()).sort((a, b) => a.bucket - b.bucket);
}

function formatBucket(ts) {
    const d = new Date(ts * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatBucketFull(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s, p) => s + (p.value || 0), 0);
    return (
        <div className="bg-card border border-border rounded-lg shadow-md p-2 text-xs">
            <div className="font-medium text-foreground mb-1">{formatBucketFull(label)}</div>
            {payload.map((p) => (
                <div key={p.dataKey} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-muted-foreground">{p.dataKey}:</span>
                    <span className="font-mono">{p.value ?? 0}</span>
                </div>
            ))}
            <div className="border-t border-border mt-1 pt-1 font-medium text-foreground">
                итого: {total}
            </div>
        </div>
    );
}

export default function TimeseriesChart({ timeseries, windowSeconds, onWindowChange }) {
    const theme = useTheme();
    const gridStroke = theme === 'dark' ? neutral[700] : neutral[200];
    const axisTick = theme === 'dark' ? neutral[400] : neutral[600];
    if (timeseries === null) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Временные ряды по статусам</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="animate-pulse h-[260px] bg-muted rounded" />
                </CardContent>
            </Card>
        );
    }

    const data = pivot(timeseries?.data);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Временные ряды по статусам</CardTitle>
                    <div className="flex gap-1">
                        {WINDOWS.map((w) => (
                            <Button
                                key={w.seconds}
                                variant={windowSeconds === w.seconds ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => onWindowChange(w.seconds)}
                            >
                                <Clock className="w-3.5 h-3.5 mr-1 shrink-0 hidden sm:inline" />
                                {w.label}
                            </Button>
                        ))}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {data.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-12 text-center">Нет данных за период</p>
                ) : (
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                            <XAxis dataKey="bucket" tickFormatter={formatBucket} fontSize={11} tick={{ fill: axisTick }} />
                            <YAxis allowDecimals={false} fontSize={11} tick={{ fill: axisTick }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ color: axisTick }} />
                            {Object.keys(STATUS_COLORS).map((status) => (
                                <Line
                                    key={status}
                                    name={STATUS_LABELS[status] || status}
                                    type="monotone"
                                    dataKey={status}
                                    stroke={STATUS_COLORS[status]}
                                    strokeWidth={2}
                                    dot={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
