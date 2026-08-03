// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { buildDiff } from '../lib/configSchemaModel.js';

// ADR-0046: diff staged против effective перед Apply.
// rows: [ { section, key, old, new } ]. Секреты маскируются.
export default function ConfigDiff({ activeSections, stagedSections }) {
    const rows = buildDiff(activeSections || {}, stagedSections || {});

    if (rows.length === 0) {
        return <p className="text-sm text-muted-foreground">Изменений нет</p>;
    }

    const fmt = (value) => {
        if (value === null || value === undefined) return '—';
        if (typeof value === 'boolean') return value ? 'да' : 'нет';
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
    };

    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-1">Секция</th>
                    <th className="px-2 py-1">Поле</th>
                    <th className="px-2 py-1">Было</th>
                    <th className="px-2 py-1">Стало</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/60" data-testid="diff-row">
                        <td className="px-2 py-1.5 text-muted-foreground">{row.section}</td>
                        <td className="px-2 py-1.5">{row.key}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{fmt(row.old)}</td>
                        <td className="px-2 py-1.5 font-medium">{fmt(row.new)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
