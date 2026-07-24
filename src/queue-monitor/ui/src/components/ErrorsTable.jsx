// SPDX-License-Identifier: Apache-2.0
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table.jsx';
import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { AlertTriangle } from 'lucide-react';

function formatTime(ts) {
    if (!ts) {
        return '—';
    }
    const d = new Date(ts * 1000);
    return d.toLocaleString('ru-RU');
}

function parseRecipient(payload) {
    if (!payload) {
        return '—';
    }
    try {
        const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
        return obj?.recipient?.value || '—';
    } catch {
        return '—';
    }
}

function formatPayload(payload) {
    if (!payload) return '—';
    try {
        const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
        return JSON.stringify(obj, null, 2);
    } catch {
        return String(payload);
    }
}

export default function ErrorsTable({ errors, limit, onLimitChange }) {
    const [expandedId, setExpandedId] = useState(null);

    if (errors === null) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Последние ошибки</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="animate-pulse space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-10 bg-muted rounded" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    const rows = errors?.data || [];

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Последние ошибки</CardTitle>
                    <div className="flex gap-1">
                        {[20, 50, 100].map((v) => (
                            <Button
                                key={v}
                                variant={limit === v ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => onLimitChange(v)}
                            >
                                {v}
                            </Button>
                        ))}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-sm text-success-dark py-8 text-center">Ошибок нет</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Источник</TableHead>
                                <TableHead>Получатель</TableHead>
                                <TableHead className="text-center">Попыток</TableHead>
                                <TableHead>Обновлено</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <React.Fragment key={row.id}>
                                    <TableRow
                                        className="align-top cursor-pointer"
                                        onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                                    >
                                        <TableCell className="text-muted-foreground font-mono text-xs">{row.id}</TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center gap-1">
                                                <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0" />
                                                {row.source || '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="break-all">{parseRecipient(row.payload)}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="error">{row.attempts}</Badge>
                                        </TableCell>
                                        <TableCell className="text-xs">{formatTime(row.updatedAt)}</TableCell>
                                    </TableRow>
                                    {expandedId === row.id && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="p-0">
                                                <pre className="text-xs font-mono bg-muted p-3 rounded max-h-48 overflow-auto">
                                                    {formatPayload(row.payload)}
                                                </pre>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
