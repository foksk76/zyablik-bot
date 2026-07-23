// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table.jsx';
import { Button } from './ui/button.jsx';

export default function TopTable({ top, topBy, onByChange }) {
    if (top === null) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Топ отправителей/получателей</CardTitle>
                    </div>
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

    const rows = top?.data || [];
    const labelKey = topBy === 'recipient' ? 'recipient' : 'source';

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Топ отправителей/получателей</CardTitle>
                    <div className="flex gap-1">
                        <Button
                            variant={topBy === 'source' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => onByChange('source')}
                        >
                            по источнику
                        </Button>
                        <Button
                            variant={topBy === 'recipient' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => onByChange('recipient')}
                        >
                            по получателю
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-sm text-neutral-400 py-8 text-center">Нет данных</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{topBy === 'recipient' ? 'Получатель' : 'Источник'}</TableHead>
                                <TableHead className="text-right">Сообщений</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row, i) => (
                                <TableRow key={`${row[labelKey]}-${i}`}>
                                    <TableCell className="break-all">{row[labelKey] || '—'}</TableCell>
                                    <TableCell className="text-right font-mono">{row.count}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
