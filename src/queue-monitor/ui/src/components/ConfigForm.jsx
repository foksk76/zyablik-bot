// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Input } from '../components/ui/input.jsx';
import {
    sectionFields,
    sectionLabel,
    pluginNames,
    pluginFields,
    toFormValue,
    coerceValue
} from '../lib/configSchemaModel.js';

// ADR-0046: динамическая форма из merged-схемы. Поля рендерятся по типу:
// string/number/enum/list/boolean; секреты — маска; nullable — три-стейт.
// Секция plugins — вложенные группы по плагину (plugins.<name>.*).
// onChange(sectionName, key, value) — внешний обработчик (правки staged);
// для плагинов value — весь объект ветки плагина.
export default function ConfigForm({ schema, sections = {}, errors = {}, onChange }) {
    if (!schema) {
        return <p className="text-sm text-muted-foreground">Схема недоступна</p>;
    }

    const inputClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

    const renderControl = (sectionName, key, field, value, emit) => {
        if (field && field.secret) {
            return <SecretMask set={value && value.set} />;
        }

        if (field && Array.isArray(field.enum)) {
            return (
                <select
                    className={inputClass}
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={(e) => emit(sectionName, key, e.target.value)}
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
                        emit(sectionName, key, raw === '' ? (triState ? null : '') : raw === 'true');
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
                    onChange={(e) => emit(sectionName, key, e.target.value)}
                />
            );
        }

        return (
            <Input
                type={field && field.type === 'number' ? 'number' : 'text'}
                className={inputClass}
                value={value === null || value === undefined ? '' : String(value)}
                onChange={(e) => emit(sectionName, key, e.target.value)}
            />
        );
    };

    const renderFieldRow = ({ sectionName, key, field, value, emit, errorKey }) => {
        const fieldError = errors && errors[errorKey];
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
                {renderControl(sectionName, key, field, value, emit)}
                {fieldError ? (
                    <p className="text-xs text-error-dark" data-testid={`error-${errorKey}`}>{fieldError}</p>
                ) : null}
            </div>
        );
    };

    const handlePluginChange = (pluginName, key, field, raw) => {
        const coerced = coerceValue(raw, field);
        const current = (sections.plugins && sections.plugins[pluginName]) || {};
        onChange('plugins', pluginName, { ...current, [key]: coerced.ok ? coerced.value : raw });
    };

    const renderPluginSection = () => {
        const plugins = pluginNames(schema);
        const pluginValues = sections.plugins || {};
        return (
            <div key="plugins" className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">{sectionLabel('plugins')}</h4>
                {plugins.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Плагины не подключены</p>
                ) : (
                    <div className="space-y-3">
                        {plugins.map((pluginName) => {
                            const fields = pluginFields(schema, pluginName);
                            const fieldKeys = Object.keys(fields);
                            if (fieldKeys.length === 0) {
                                return null;
                            }
                            const pluginState = pluginValues[pluginName];
                            return (
                                <div key={pluginName} className="rounded-md border border-border p-3 space-y-3">
                                    <h5 className="text-sm font-medium text-foreground">{pluginName}</h5>
                                    <div className="space-y-3">
                                        {fieldKeys.map((key) => {
                                            const field = fields[key];
                                            const value = pluginState && pluginState[key] !== undefined
                                                ? pluginState[key]
                                                : toFormValue(undefined, field);
                                            return renderFieldRow({
                                                sectionName: 'plugins',
                                                key,
                                                field,
                                                value,
                                                emit: (s, k, raw) => handlePluginChange(pluginName, k, field, raw),
                                                errorKey: `${pluginName}.${key}`
                                            });
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {Object.entries(sections || {}).map(([sectionName, sectionValues]) => {
                if (sectionName === 'plugins') {
                    return renderPluginSection();
                }
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
                                return renderFieldRow({
                                    sectionName,
                                    key,
                                    field,
                                    value,
                                    emit: onChange,
                                    errorKey: `${sectionName}.${key}`
                                });
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
