// SPDX-License-Identifier: Apache-2.0
import React, { useState, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceArea } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { semantic, neutral } from '../tokens/colors.js';
import { useTheme } from '../hooks/useTheme.js';

// ADR-0041: TimeseriesChart — чистый компонент отображения данных.
// Window picker вынесен в TimeRangeBar. Drag-to-pan позволяет выбирать
// абсолютный диапазон перетаскиванием на графике.
// ADR-0041: Конвертация координат через activeLabel (рекомендовано ADR).

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

function formatTime(ts) {
    const d = new Date(ts * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDate(ts) {
    const d = new Date(ts * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sameDay(a, b) {
    const da = new Date(a * 1000);
    const db = new Date(b * 1000);
    return da.getFullYear() === db.getFullYear() &&
        da.getMonth() === db.getMonth() &&
        da.getDate() === db.getDate();
}

function createTickFormatter(data) {
    if (!data || data.length === 0) return formatTime;
    return sameDay(data[0].bucket, data[data.length - 1].bucket) ? formatTime : formatDate;
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
                    <span className="text-muted-foreground">{STATUS_LABELS[p.dataKey] || p.dataKey}:</span>
                    <span className="font-mono">{p.value ?? 0}</span>
                </div>
            ))}
            <div className="border-t border-border mt-1 pt-1 font-medium text-foreground">
                итого: {total}
            </div>
        </div>
    );
}

export default function TimeseriesChart({ timeseries, onPan }) {
    const theme = useTheme();
    const gridStroke = theme === 'dark' ? neutral[700] : neutral[200];
    const axisTick = theme === 'dark' ? neutral[400] : neutral[600];

    const data = pivot(timeseries?.data);
    const tickFormatter = createTickFormatter(data);

    const [isDragging, setIsDragging] = useState(false);
    const [dragStartLabel, setDragStartLabel] = useState(null);
    const [dragEndLabel, setDragEndLabel] = useState(null);

    const handleMouseDown = useCallback((e) => {
        if (e?.activeLabel !== undefined) {
            setIsDragging(true);
            setDragStartLabel(e.activeLabel);
            setDragEndLabel(null);
        }
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (isDragging && e?.activeLabel !== undefined) {
            setDragEndLabel(e.activeLabel);
        }
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        if (isDragging && dragStartLabel !== null && dragEndLabel !== null && onPan) {
            const fromTs = Math.min(dragStartLabel, dragEndLabel);
            const toTs = Math.max(dragStartLabel, dragEndLabel);
            if (fromTs < toTs) {
                onPan(fromTs, toTs);
            }
        }
        setIsDragging(false);
        setDragStartLabel(null);
        setDragEndLabel(null);
    }, [isDragging, dragStartLabel, dragEndLabel, onPan]);

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

    const refAreaLeft = isDragging && dragStartLabel !== null && dragEndLabel !== null
        ? Math.min(dragStartLabel, dragEndLabel)
        : undefined;
    const refAreaRight = isDragging && dragStartLabel !== null && dragEndLabel !== null
        ? Math.max(dragStartLabel, dragEndLabel)
        : undefined;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Временные ряды по статусам</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                {data.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-12 text-center">Нет данных за период</p>
                ) : (
                    <div style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart
                                data={data}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                                <XAxis dataKey="bucket" tickFormatter={tickFormatter} fontSize={11} tick={{ fill: axisTick }} />
                                <YAxis allowDecimals={false} fontSize={11} tick={{ fill: axisTick }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ color: axisTick }} />
                                {refAreaLeft !== undefined && refAreaRight !== undefined && (
                                    <ReferenceArea
                                        x1={refAreaLeft}
                                        x2={refAreaRight}
                                        strokeOpacity={0.3}
                                        fill="currentColor"
                                        className="text-primary"
                                    />
                                )}
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
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
