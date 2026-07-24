// SPDX-License-Identifier: Apache-2.0
import React, { useState, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { semantic, neutral } from '../tokens/colors.js';
import { useTheme } from '../hooks/useTheme.js';

// ADR-0041: TimeseriesChart — чистый компонент отображения данных.
// Window picker вынесен в TimeRangeBar. Drag-to-pan позволяет выбирать
// абсолютный диапазон перетаскиванием на графике.

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

// ADR-0041: drag-to-pan — порог 10px для предотвращения случайных drag.
const DRAG_THRESHOLD_PX = 10;

export default function TimeseriesChart({ timeseries, onPan }) {
    const theme = useTheme();
    const gridStroke = theme === 'dark' ? neutral[700] : neutral[200];
    const axisTick = theme === 'dark' ? neutral[400] : neutral[600];

    const data = pivot(timeseries?.data);

    const [isDragging, setIsDragging] = useState(false);
    const [dragStartX, setDragStartX] = useState(null);
    const chartRef = useRef(null);

    const handleMouseDown = useCallback((e) => {
        if (e && e.chartX !== undefined) {
            setIsDragging(true);
            setDragStartX(e.chartX);
        }
    }, []);

    const handleMouseUp = useCallback((e) => {
        if (!isDragging || dragStartX === null || !e || e.chartX === undefined) {
            setIsDragging(false);
            setDragStartX(null);
            return;
        }

        const endX = e.chartX;
        const delta = Math.abs(endX - dragStartX);

        if (delta > DRAG_THRESHOLD_PX && data.length > 1 && onPan) {
            const minX = Math.min(dragStartX, endX);
            const maxX = Math.max(dragStartX, endX);

            // Используем Recharts chartRef для получения точных coordinate offsets
            const chartEl = chartRef.current;
            if (!chartEl) {
                setIsDragging(false);
                setDragStartX(null);
                return;
            }

            // Recharts хранит coordinate map в internal state LineChart
            // Используем XAxis domain для точной конвертации
            const firstBucket = data[0].bucket;
            const lastBucket = data[data.length - 1].bucket;
            const timeSpan = lastBucket - firstBucket;
            if (timeSpan <= 0) {
                setIsDragging(false);
                setDragStartX(null);
                return;
            }

            // Recharts layout: left padding ~60px для YAxis, right padding ~20px
            // Точная ширина plot area = container width - paddingLeft - paddingRight
            const containerWidth = chartEl.offsetWidth || 1;
            const plotLeft = 60;
            const plotRight = 20;
            const plotWidth = containerWidth - plotLeft - plotRight;

            const fromTs = Math.floor(firstBucket + ((minX - plotLeft) / plotWidth) * timeSpan);
            const toTs = Math.floor(firstBucket + ((maxX - plotLeft) / plotWidth) * timeSpan);

            if (fromTs < toTs) {
                onPan(fromTs, toTs);
            }
        }

        setIsDragging(false);
        setDragStartX(null);
    }, [isDragging, dragStartX, onPan, data]);

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
                    <div
                        ref={chartRef}
                        style={{ cursor: isDragging ? 'grabbing' : 'default' }}
                    >
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart
                                data={data}
                                onMouseDown={handleMouseDown}
                                onMouseUp={handleMouseUp}
                            >
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
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
