// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table.jsx';
import { Badge } from './ui/badge.jsx';

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

export default function ErrorsTable({ errors }) {
    if (errors === null) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Последние ошибки</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="animate-pulse space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-10 bg-neutral-100 rounded" />
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
                <CardTitle>Последние ошибки</CardTitle>
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
                                <TableRow key={row.id} className="align-top">
                                    <TableCell className="text-neutral-400 font-mono text-xs">{row.id}</TableCell>
                                    <TableCell>{row.source || '—'}</TableCell>
                                    <TableCell className="break-all">{parseRecipient(row.payload)}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="error">{row.attempts}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">{formatTime(row.updatedAt)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
