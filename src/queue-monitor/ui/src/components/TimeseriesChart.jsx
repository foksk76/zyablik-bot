// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { Button } from './ui/button.jsx';
import { semantic, neutral } from '../tokens/colors.js';

const WINDOWS = [
    { label: '1ч', seconds: 3600 },
    { label: '6ч', seconds: 21600 },
    { label: '12ч', seconds: 43200 },
    { label: '24ч', seconds: 86400 }
];

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

export default function TimeseriesChart({ timeseries, windowSeconds, onWindowChange }) {
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
                                {w.label}
                            </Button>
                        ))}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {data.length === 0 ? (
                    <p className="text-sm text-neutral-400 py-12 text-center">Нет данных за период</p>
                ) : (
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke={neutral[200]} />
                            <XAxis dataKey="bucket" tickFormatter={formatBucket} fontSize={11} />
                            <YAxis allowDecimals={false} fontSize={11} />
                            <Tooltip labelFormatter={formatBucket} />
                            <Legend />
                            {Object.keys(STATUS_COLORS).map((status) => (
                                <Line
                                    key={status}
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
