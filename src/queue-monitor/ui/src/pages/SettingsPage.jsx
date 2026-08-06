// SPDX-License-Identifier: Apache-2.0
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Save, Play, RotateCcw, Download, Upload } from 'lucide-react';
import { useConfig } from '../hooks/useConfig.js';
import ConfigForm from '../components/ConfigForm.jsx';
import ConfigDiff from '../components/ConfigDiff.jsx';
import ConfigBanner from '../components/ConfigBanner.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { showToast } from '../lib/showToast.js';
import { buildStagedConfig, validateSectionValues, coerceValue, fileConfigToValues } from '../lib/configSchemaModel.js';

// ADR-0046: SettingsPage — schema-driven управление конфигурацией.
// Просмотр effective → правка (staged) → diff → Apply → статус (pending/
// confirmed/rolled_back); Export/Import; banner авто-отката.
export default function SettingsPage() {
    const { config, schema, status, loading, error, refresh, mutate } = useConfig();
    const [values, setValues] = useState({});
    const [errors, setErrors] = useState({});
    const [hasStaged, setHasStaged] = useState(false);
    const [showDiff, setShowDiff] = useState(false);
    const [busy, setBusy] = useState(false);
    const fileInputRef = useRef(null);
    // M2 (review R5): staged-конфиг, существующий на диске до загрузки
    // страницы (другая сессия/оператор). Без этого reload оставлял его
    // невидимым (hasStaged=false, «Применить» выключена), а «Сохранить
    // (staged)» молча перезаписывал бы серверный staged старыми values.
    const [stagedFile, setStagedFile] = useState(null);
    const [stageLoaded, setStageLoaded] = useState(false);
    // Инициализация формы выполняется один раз, по первому загруженному
    // конфигу. Повторные refresh() (30-сек poll, «Обновить», после
    // apply/rollback) НЕ перезаписывают values — иначе несохранённая правка
    // пользователя стиралась бы при каждом опросе.
    const valuesInitializedRef = useRef(false);

    // M2 (review R5): при mount — проверяем существующий staged и
    // синхронизируем форму с ним (иначе diff/Save вводят в заблуждение).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/config/stage', { credentials: 'same-origin' });
                if (res.status === 401) {
                    window.location.href = '/api/auth/login';
                    return;
                }
                const json = await res.json().catch(() => null);
                if (cancelled || !res.ok || !json || !json.data) {
                    return;
                }
                if (json.data.exists) {
                    setHasStaged(true);
                    setStagedFile(json.data.staged && typeof json.data.staged === 'object' ? json.data.staged : null);
                }
            } catch (err) {
                // Сетевой сбой — не фатально: форма живёт на effective.
            } finally {
                if (!cancelled) {
                    setStageLoaded(true);
                }
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // При первой загрузке — инициализация значений для правки. Если на диске
    // есть staged (M2) — из него; иначе из effective. Ждём и config, и
    // результат /stage, чтобы staged не терялся при гонке с effective.
    useEffect(() => {
        if (valuesInitializedRef.current || !config || !config.sections || !stageLoaded) {
            return;
        }
        if (stagedFile) {
            setValues(fileConfigToValues(stagedFile));
        } else {
            const next = {};
            for (const [sectionName, sectionValues] of Object.entries(config.sections)) {
                next[sectionName] = { ...(sectionValues || {}) };
            }
            setValues(next);
        }
        valuesInitializedRef.current = true;
    }, [config, stagedFile, stageLoaded]);

    const staged = useMemo(() => (schema ? buildStagedConfig(values, schema) : null), [values, schema]);

    const handleChange = useCallback((sectionName, key, raw) => {
        setValues((prev) => {
            const section = { ...(prev[sectionName] || {}) };
            if (sectionName === 'plugins') {
                // Плагин: ConfigForm уже присылает цельный объект ветки
                // plugins.<name> (с coerce по каждому полю). Здесь схемой
                // является весь configSchema плагина, а не одно поле, поэтому
                // coerceValue неприменим — принимаем объект как есть.
                section[key] = raw;
                return { ...prev, [sectionName]: section };
            }
            const field = schema && schema[sectionName] ? schema[sectionName][key] : null;
            const coerced = coerceValue(raw, field);
            section[key] = coerced.ok ? coerced.value : raw;
            return { ...prev, [sectionName]: section };
        });
        setErrors((prev) => {
            // Ошибки неймспейсятся ('bot.maxPollLimit', 'identity.syncMode');
            // для плагина снимаем все ошибки его под-полей (plugins.<name>.*).
            if (sectionName === 'plugins') {
                const next = {};
                for (const [errorKey, reason] of Object.entries(prev)) {
                    if (!errorKey.startsWith(`${key}.`)) {
                        next[errorKey] = reason;
                    }
                }
                return next;
            }
            return { ...prev, [`${sectionName}.${key}`]: undefined };
        });
    }, [schema]);

    const handleSaveStage = useCallback(async () => {
        if (!staged) return;
        const sectionErrors = {};
        for (const sectionName of Object.keys(values)) {
            Object.assign(sectionErrors, validateSectionValues(values[sectionName], schema, sectionName));
        }
        setErrors(sectionErrors);
        if (Object.keys(sectionErrors).length > 0) {
            showToast('Исправьте ошибки формы', 'error');
            return;
        }
        setBusy(true);
        const result = await mutate('PUT', '/api/config/stage', staged);
        setBusy(false);
        if (result.ok) {
            setHasStaged(true);
            setShowDiff(true);
            showToast('Изменения сохранены (staged)', 'success');
        } else {
            showToast(`Ошибка: ${result.message}`, 'error');
        }
    }, [staged, values, schema, mutate]);

    const handleApply = useCallback(async () => {
        setBusy(true);
        const result = await mutate('POST', '/api/config/apply');
        setBusy(false);
        if (result.ok) {
            setShowDiff(false);
            showToast('Применение запущено — ожидается перезапуск', 'success');
            setTimeout(() => refresh(), 1500);
        } else {
            showToast(`Ошибка: ${result.message}`, 'error');
        }
    }, [mutate, refresh]);

    const handleRollback = useCallback(async () => {
        if (!window.confirm('Откатить конфигурацию к последней рабочей версии?')) {
            return;
        }
        setBusy(true);
        const result = await mutate('POST', '/api/config/rollback');
        setBusy(false);
        if (result.ok) {
            showToast('Откат запущен', 'success');
            setTimeout(() => refresh(), 1500);
        } else {
            showToast(`Ошибка: ${result.message}`, 'error');
        }
    }, [mutate, refresh]);

    const handleExport = useCallback(async () => {
        try {
            const res = await fetch('/api/config/export', { credentials: 'same-origin' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const now = new Date();
            const ts = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
            a.href = url;
            a.download = `zyablik.config_${ts}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Экспорт завершён', 'success');
        } catch (err) {
            showToast(`Ошибка экспорта: ${err.message}`, 'error');
        }
    }, []);

    const handleImportFile = useCallback(async (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            setBusy(true);
            const result = await mutate('POST', '/api/config/import', parsed);
            setBusy(false);
            if (result.ok) {
                // M2 (review R4): синхронизируем форму с импортированным staged,
                // иначе values остаётся устаревшим — diff показывает «изменений
                // нет», а «Сохранить (staged)» затирает staged старыми values.
                const stagedFile = result.message && result.message.staged;
                if (stagedFile && typeof stagedFile === 'object') {
                    setValues(fileConfigToValues(stagedFile));
                }
                setHasStaged(true);
                setShowDiff(true);
                showToast('Файл импортирован в staged', 'success');
                // F10-L1 (review R10): необъявленные ключи, которые форма не
                // отредактирует и «Сохранить (staged)» может молча потерять.
                const warnings = result.message && result.message.warnings;
                if (Array.isArray(warnings) && warnings.length > 0) {
                    showToast(
                        `Необъявленные ключи не редактируются в форме и будут потеряны при «Сохранить»: ${warnings.join(', ')}`,
                        'warning'
                    );
                }
                setTimeout(() => refresh(), 800);
            } else {
                showToast(`Ошибка импорта: ${result.message}`, 'error');
            }
        } catch (err) {
            setBusy(false);
            showToast(`Ошибка чтения файла: ${err.message}`, 'error');
        }
    }, [mutate, refresh]);

    if (loading) {
        return <p className="text-muted-foreground">Загрузка конфигурации…</p>;
    }

    if (error && !config) {
        return (
            <div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3">
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Настройки</h2>
                    <p className="text-sm text-muted-foreground">
                        Конфигурация zyablik.config.json · схема v{config ? config.version : '—'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                        <Upload className="w-4 h-4 mr-1" />
                        Импорт
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download className="w-4 h-4 mr-1" />
                        Экспорт
                    </Button>
                    <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                        Обновить
                    </Button>
                </div>
            </div>

            <ConfigBanner status={status} />

            {/* R11-L3 (review PR #23): предупреждения loadConfig (неопознанные
                ключи, устаревшие $VAR) доезжают из createCore через
                /api/config — баннер вместо поиска по логам процесса. */}
            {config && Array.isArray(config.warnings) && config.warnings.length > 0 && (
                <div className="bg-warning-light border border-warning/20 text-warning-dark text-sm rounded-lg p-3" data-testid="banner-config-warnings">
                    <p className="font-semibold mb-1">Предупреждения при загрузке конфигурации</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        {config.warnings.map((warning, index) => {
                            const text = typeof warning === 'object' && warning !== null
                                ? (warning.key ? `${warning.key}: ${warning.reason}` : warning.reason)
                                : warning;
                            return <li key={index}>{text}</li>;
                        })}
                    </ul>
                </div>
            )}

            {error && (
                <div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3">
                    Ошибка: {error}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Эффективная конфигурация</CardTitle>
                </CardHeader>
                <CardContent>
                    <ConfigForm schema={schema} sections={values} errors={errors} onChange={handleChange} />
                </CardContent>
            </Card>

            {showDiff && (
                <Card>
                    <CardHeader>
                        <CardTitle>Изменения к применению</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ConfigDiff activeSections={config ? config.sections : null} stagedSections={values} schema={schema} />
                    </CardContent>
                </Card>
            )}

            <div className="flex items-center gap-2 flex-wrap">
                <Button variant="default" size="sm" onClick={handleSaveStage} disabled={busy}>
                    <Save className="w-4 h-4 mr-1" />
                    Сохранить (staged)
                </Button>
                <Button variant="secondary" size="sm" onClick={handleApply} disabled={busy || !hasStaged}>
                    <Play className="w-4 h-4 mr-1" />
                    Применить (рестарт)
                </Button>
                <Button variant="destructive" size="sm" onClick={handleRollback} disabled={busy}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Откатить
                </Button>
            </div>
        </div>
    );
}
