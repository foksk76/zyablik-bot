// SPDX-License-Identifier: Apache-2.0
// ADR-0046: чистая (DOM-free) модель schema-driven формы настроек.
// Позволяет тестировать логику рендера/валидации под node --test без
// jsdom/vitest (AGENTS.md: единственная команда проверки — npm test).

// Список секций в порядке отображения.
export const SECTION_ORDER = ['bot', 'queue', 'ingress', 'monitor', 'plugins'];

const LABELS = {
    bot: 'Бот',
    queue: 'Очередь доставки',
    ingress: 'Входящие (ingress)',
    monitor: 'Dashboard',
    plugins: 'Плагины'
};

export function sectionLabel(sectionName) {
    return LABELS[sectionName] || sectionName;
}

// Поля секции из merged-схемы (включая plugins.<name>).
export function sectionFields(schema, sectionName) {
    if (!schema) return {};
    if (sectionName === 'plugins') {
        return schema.plugins || {};
    }
    return schema[sectionName] || {};
}

// Имена плагинов merged-схемы (для вложенных групп ConfigForm).
export function pluginNames(schema) {
    const plugins = schema && schema.plugins;
    return plugins && typeof plugins === 'object' ? Object.keys(plugins) : [];
}

// Поля configSchema конкретного плагина (plugins.<name>.*).
export function pluginFields(schema, pluginName) {
    const plugins = schema && schema.plugins;
    const fields = plugins && plugins[pluginName];
    return fields && typeof fields === 'object' ? fields : {};
}

// Значение по умолчанию из схемы (с защитой от мутаций).
export function fieldDefault(field) {
    if (field && Array.isArray(field.default)) {
        return [...field.default];
    }
    return field && field.default !== undefined ? field.default : '';
}

// Нормализация значения файла для формы.
// - секрет → { secret: true, set: boolean } (маска, значение не редактируется);
// - undefined → дефолт схемы.
export function toFormValue(value, field) {
    if (field && field.secret) {
        return { secret: true, set: typeof value === 'string' && value !== '' };
    }
    if (value === undefined || value === null) {
        return field ? fieldDefault(field) : '';
    }
    return value;
}

// Приведение строки/сырого значения из input к типу поля.
// Возвращает { ok, value } — value корректного типа либо null при невалидном.
export function coerceValue(raw, field) {
    const type = field && field.type ? field.type : 'string';

    switch (type) {
    case 'number': {
        if (raw === '' || raw === null) {
            return { ok: true, value: raw === '' ? '' : raw };
        }
        const n = Number(raw);
        return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, value: null };
    }
    case 'boolean': {
        if (raw === null || raw === '') {
            return { ok: true, value: raw === null ? null : raw };
        }
        if (raw === true || raw === 'true') return { ok: true, value: true };
        if (raw === false || raw === 'false') return { ok: true, value: false };
        return { ok: false, value: null };
    }
    case 'enum': {
        if (field.enum && field.enum.includes(raw)) {
            return { ok: true, value: raw };
        }
        return { ok: false, value: null };
    }
    case 'list': {
        if (Array.isArray(raw)) return { ok: true, value: raw };
        if (typeof raw === 'string') {
            const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
            return { ok: true, value: items };
        }
        return { ok: false, value: null };
    }
    default: {
        // string (и type='string' с enum-ограничением, как в системной схеме)
        if (Array.isArray(field.enum) && !field.enum.includes(raw)) {
            return { ok: false, value: null };
        }
        return { ok: true, value: raw };
    }
    }
}

// Клиентская валидация значения (типы, required, min/max, enum).
// Возвращает null или строку-причину.
export function validateValue(value, field, { required = false } = {}) {
    if (!field) return null;

    const isSecret = !!field.secret;
    if (isSecret) {
        return null; // маска, не редактируется — не валидируем
    }

    const isEmpty = value === '' || value === null || value === undefined;

    if (required && isEmpty) {
        return 'обязательное поле';
    }
    if (isEmpty) {
        return null;
    }

    switch (field.type) {
    case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return 'ожидается целое число';
        }
        if (typeof field.min === 'number' && value < field.min) {
            return `меньше минимального значения ${field.min}`;
        }
        if (typeof field.max === 'number' && value > field.max) {
            return `больше максимального значения ${field.max}`;
        }
        return null;
    }
    case 'boolean': {
        return typeof value === 'boolean' ? null : 'ожидается boolean';
    }
    case 'enum':
    case 'string': {
        if (Array.isArray(field.enum) && !field.enum.includes(value)) {
            return `ожидается одно из: ${field.enum.join(', ')}`;
        }
        return null;
    }
    case 'list': {
        if (!Array.isArray(value)) {
            return 'ожидается массив строк';
        }
        if (value.some((item) => typeof item !== 'string')) {
            return 'массив должен содержать строки';
        }
        return null;
    }
    default:
        return null;
    }
}

// Валидация всех полей секции. Возвращает { [fieldKey]: reason }.
// Ключи ошибок неймспейсятся ('bot.maxPollLimit', 'identity.syncMode'), чтобы
// разные секции/плагины с одинаковыми именами полей не перетирали друг друга.
export function validateSectionValues(values, schema, sectionName) {
    const errors = {};
    if (sectionName === 'plugins') {
        for (const [pluginName, pluginValues] of Object.entries(values || {})) {
            const fields = pluginFields(schema, pluginName);
            for (const [key, field] of Object.entries(fields)) {
                const raw = pluginValues && pluginValues[key];
                const reason = validateValue(raw, field, { required: field.required });
                if (reason) {
                    errors[`${pluginName}.${key}`] = reason;
                }
            }
        }
        return errors;
    }
    const fields = sectionFields(schema, sectionName);
    for (const [key, field] of Object.entries(fields)) {
        const reason = validateValue(values[key], field, { required: field.required });
        if (reason) {
            errors[`${sectionName}.${key}`] = reason;
        }
    }
    return errors;
}

// Сборка staged-конфига для PUT /api/config/stage:
// секреты пропускаются (значения не меняются), пустые поля → ''.
export function buildStagedConfig(sections, schema) {
    const result = {};
    for (const sectionName of SECTION_ORDER) {
        const fields = sectionFields(schema, sectionName);
        const source = sections[sectionName] || {};
        if (sectionName === 'plugins') {
            // plugins.<name>.* — переносим как есть (значения уже скаляры).
            result.plugins = {};
            for (const [pluginName, pluginValues] of Object.entries(source)) {
                if (pluginValues && typeof pluginValues === 'object' && !Array.isArray(pluginValues)) {
                    result.plugins[pluginName] = { ...pluginValues };
                }
            }
            continue;
        }
        const sectionResult = {};
        for (const [key, field] of Object.entries(fields)) {
            if (field.secret) {
                continue; // секреты не отправляются
            }
            const value = source[key];
            sectionResult[key] = value === undefined ? fieldDefault(field) : value;
        }
        result[sectionName] = sectionResult;
    }
    return result;
}

// Diff между effective-конфигом и staged (для показа перед Apply).
// Возвращает [ { section, key, old, new } ].
export function buildDiff(activeSections, stagedSections) {
    const diff = [];
    for (const sectionName of SECTION_ORDER) {
        const active = activeSections && activeSections[sectionName]
            ? activeSections[sectionName] : {};
        const staged = stagedSections && stagedSections[sectionName]
            ? stagedSections[sectionName] : {};
        if (sectionName === 'plugins') {
            for (const [pluginName, activeValues] of Object.entries(active)) {
                const stagedValues = staged[pluginName] || {};
                for (const [key, oldValue] of Object.entries(activeValues)) {
                    const newValue = stagedValues[key];
                    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                        diff.push({
                            section: pluginName,
                            key,
                            old: oldValue === undefined ? null : oldValue,
                            new: newValue === undefined ? null : newValue
                        });
                    }
                }
                for (const key of Object.keys(stagedValues)) {
                    if (!(key in activeValues)) {
                        diff.push({ section: pluginName, key, old: null, new: stagedValues[key] });
                    }
                }
            }
            continue;
        }
        const keys = new Set([...Object.keys(active), ...Object.keys(staged)]);
        for (const key of keys) {
            const oldValue = active[key];
            const newValue = staged[key];
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                diff.push({
                    section: sectionName,
                    key,
                    old: oldValue === undefined ? null : oldValue,
                    new: newValue === undefined ? null : newValue
                });
            }
        }
    }
    return diff;
}
