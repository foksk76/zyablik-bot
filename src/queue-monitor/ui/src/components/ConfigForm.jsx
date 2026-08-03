// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Input } from '../components/ui/input.jsx';
import { sectionFields, sectionLabel, toFormValue } from '../lib/configSchemaModel.js';

// ADR-0046: динамическая форма из merged-схемы. Поля рендерятся по типу:
// string/number/enum/list/boolean; секреты — маска; nullable — три-стейт.
// onChange(sectionName, key, value) — внешний обработчик (правки staged).
export default function ConfigForm({ schema, sections, errors = {}, onChange }) {
    if (!schema) {
        return <p className="text-sm text-muted-foreground">Схема недоступна</p>;
    }

    const renderField = (sectionName, key, field, value) => {
        const inputClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

        if (field && field.secret) {
            return <SecretMask set={value && value.set} />;
        }

        if (field && Array.isArray(field.enum)) {
            return (
                <select
                    className={inputClass}
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={(e) => onChange(sectionName, key, e.target.value)}
                >
                    <option value="">—</option>
                    {field.enum.map((option) => (
                        <option key={String(option)} value={String(option)}>{String(option)}</option>
                    ))}
                </select>
            );
        }

        if (field && field.type === 'boolean') {
            const triState = field.nullable;
            return (
                <select
                    className={inputClass}
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={(e) => {
                        const raw = e.target.value;
                        onChange(sectionName, key, raw === '' ? (triState ? null : '') : raw === 'true');
                    }}
                >
                    <option value="">{triState ? '— (не задано)' : '—'}</option>
                    <option value="true">да</option>
                    <option value="false">нет</option>
                </select>
            );
        }

        if (field && field.type === 'list') {
            const text = Array.isArray(value) ? value.join(', ') : String(value || '');
            return (
                <Input
                    className={inputClass}
                    value={text}
                    placeholder="разделитель — запятая"
                    onChange={(e) => onChange(sectionName, key, e.target.value)}
                />
            );
        }

        return (
            <Input
                type={field && field.type === 'number' ? 'number' : 'text'}
                className={inputClass}
                value={value === null || value === undefined ? '' : String(value)}
                onChange={(e) => onChange(sectionName, key, e.target.value)}
            />
        );
    };

    return (
        <div className="space-y-6">
            {Object.entries(sections || {}).map(([sectionName, sectionValues]) => {
                const fields = sectionFields(schema, sectionName);
                const fieldKeys = Object.keys(fields);
                if (fieldKeys.length === 0) {
                    return null;
                }
                return (
                    <div key={sectionName} className="space-y-3">
                        <h4 className="text-sm font-semibold text-foreground">{sectionLabel(sectionName)}</h4>
                        <div className="space-y-3">
                            {fieldKeys.map((key) => {
                                const field = fields[key];
                                const value = sectionValues && sectionValues[key] !== undefined
                                    ? sectionValues[key]
                                    : toFormValue(undefined, field);
                                const fieldError = errors && errors[key];
                                return (
                                    <div key={key} className="space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <label className="text-sm text-muted-foreground">
                                                {key}
                                                {field.required ? <span className="text-error-dark"> *</span> : null}
                                            </label>
                                            {field.description ? (
                                                <span className="text-xs text-muted-foreground text-right">{field.description}</span>
                                            ) : null}
                                        </div>
                                        {renderField(sectionName, key, field, value)}
                                        {fieldError ? (
                                            <p className="text-xs text-error-dark" data-testid={`error-${key}`}>{fieldError}</p>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function SecretMask({ set }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground tracking-widest">●●●●●●●●</span>
            <span className={set ? 'text-success-dark text-xs' : 'text-warning-dark text-xs'}>
                {set ? 'задан' : 'не задан'}
            </span>
        </div>
    );
}
