// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table.jsx';
import { Button } from './ui/button.jsx';
import { ArrowUpRight, Users } from 'lucide-react';

export default function TopTable({ top, topBy, onByChange, limit, onLimitChange }) {
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
                            <div key={i} className="h-10 bg-muted rounded" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    const rows = top?.data || [];
    const labelKey = topBy === 'recipient' ? 'recipient' : 'source';

    return (
        <Card className="overflow-hidden">
            <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle>Топ отправителей/получателей</CardTitle>
                    <div className="flex gap-1 flex-wrap">
                        <Button
                            variant={topBy === 'source' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => onByChange('source')}
                        >
                            <ArrowUpRight className="w-3.5 h-3.5 mr-1 shrink-0" />
                            по источнику
                        </Button>
                        <Button
                            variant={topBy === 'recipient' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => onByChange('recipient')}
                        >
                            <Users className="w-3.5 h-3.5 mr-1 shrink-0" />
                            по получателю
                        </Button>
                        {[5, 10, 20].map((v) => (
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
            <CardContent className="max-h-[500px] overflow-auto">
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        Нет данных за выбранный период
                    </p>
                ) : (
                    <Table className="table-fixed">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">#</TableHead>
                                <TableHead>{topBy === 'recipient' ? 'Получатель' : 'Источник'}</TableHead>
                                <TableHead className="text-right w-24">Сообщений</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row, i) => {
                                const maxCount = rows[0]?.count || 1;
                                const barPct = Math.round((row.count / maxCount) * 100);
                                return (
                                    <TableRow key={`${row[labelKey]}-${i}`}>
                                        <TableCell className="text-muted-foreground text-xs font-mono">{i + 1}</TableCell>
                                        <TableCell>
                                            <div className="truncate">{row[labelKey] || '—'}</div>
                                            <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-primary/60"
                                                    style={{ width: `${barPct}%` }}
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">{row.count}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
