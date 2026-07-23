# Brand Book: Зяблик

## Логотип

Файл: `docs/assets/zyablik-logo.png`

Логотип — стилизованное изображение птицы (зяблик) в синей палитре.
Использование: dashboard UI, документация, README, systemd unit-файлы.
Минимальный размер: 24px высота. Отступ от краёв: ≥ logo height.

## Цвета

### Primary Palette (бренд)

Цвета из логотипа. Используются для: кнопки, ссылки, акценты,
branding-элементы (icon backgrounds, active states).

| Token | Hex | Tailwind | Назначение |
|-------|-----|----------|------------|
| primary-50 | `#f0f9ff` | `bg-brand-50` | Light background |
| primary-500 | `#0ea5e9` | `bg-brand-500` | Primary actions, active states |
| primary-600 | `#0284c7` | `bg-brand-600` | Hover state |
| primary-700 | `#0369a1` | `bg-brand-700` | Pressed state |

### Neutral Palette (text, borders, backgrounds)

Серая палитра для текста, рамок, фонов. Основа — Tailwind neutral (tokens).

| Token | Hex | Tailwind | Назначение |
|-------|-----|----------|------------|
| neutral-50 | `#f8fafc` | `bg-neutral-50` | Page background |
| neutral-100 | `#f1f5f9` | `bg-neutral-100` | Card background (hover) |
| neutral-200 | `#e2e8f0` | `border-neutral-200` | Borders, dividers |
| neutral-400 | `#94a3b8` | `text-neutral-400` | Placeholder, muted text |
| neutral-500 | `#64748b` | `text-neutral-500` | Secondary text |
| neutral-600 | `#475569` | `text-neutral-600` | Body text |
| neutral-700 | `#334155` | `text-neutral-700` | Headings |
| neutral-800 | `#1e293b` | `text-neutral-800` | Primary text |

### Semantic Palette (status)

| Статус | Light | Dark | Hex | Tailwind |
|--------|-------|------|-----|----------|
| Delivered (success) | `success-light` | `success-dark` | `#10b981` | `bg-success-light text-success-dark` |
| Failed (error) | `error-light` | `error-dark` | `#f43f5e` | `bg-error-light text-error-dark` |
| Pending (warning) | `warning-light` | `warning-dark` | `#f59e0b` | `bg-warning-light text-warning-dark` |
| Processing (info) | `info-light` | `info-dark` | `#3b82f6` | `bg-info-light text-info-dark` |

## Типографика

### Font Family

```css
font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
```

Системный шрифт — maximum performance, zero network requests.
Не загружать Google Fonts или кастомные шрифты.

### Type Scale

| Token | Size | Line-height | Weight | Назначение |
|-------|------|-------------|--------|------------|
| xs | 12px / 0.75rem | 16px / 1rem | 400 | Timestamps, metadata |
| sm | 14px / 0.875rem | 20px / 1.25rem | 400 | Secondary text, labels |
| base | 16px / 1rem | 24px / 1.5rem | 400 | Body text |
| lg | 18px / 1.125rem | 28px / 1.75rem | 500 | Subheadings |
| xl | 20px / 1.25rem | 28px / 1.75rem | 600 | Section headings |
| 2xl | 24px / 1.5rem | 32px / 2rem | 600 | Page title |

### Font Weights

| Token | Value | Tailwind | Назначение |
|-------|-------|----------|------------|
| normal | 400 | `font-normal` | Body text |
| medium | 500 | `font-medium` | Labels, subheadings |
| semibold | 600 | `font-semibold` | Headings, emphasis |

## Отступы (Spacing)

4px grid. Все отступы — кратны 4px.

| Token | Value | Tailwind | Назначение |
|-------|-------|----------|------------|
| 1 | 4px | `p-1` / `m-1` | Micro padding |
| 2 | 8px | `p-2` / `m-2` | Compact padding |
| 3 | 12px | `p-3` / `m-3` | Default padding |
| 4 | 16px | `p-4` / `m-4` | Card padding |
| 6 | 24px | `p-6` / `m-6` | Section spacing |
| 8 | 32px | `p-8` / `m-8` | Page padding |

## Границы (Radii)

| Token | Value | Tailwind | Назначение |
|-------|-------|----------|------------|
| sm | 4px | `rounded-sm` | Small elements (badges) |
| md | 8px | `rounded` | Cards, buttons |
| lg | 12px | `rounded-lg` | Modals, large cards |
| full | 9999px | `rounded-full` | Avatars, pills |

## Тени (Shadows)

| Token | Tailwind | Назначение |
|-------|----------|------------|
| sm | `shadow-sm` | Cards (resting) |
| md | `shadow` | Dropdowns, popovers |
| lg | `shadow-lg` | Modals |

## Тон

Технический, лаконичный. Без маркетинговых формулировок.

- Писать по-русски (код, документация, UI-строки)
- Без emoji в UI (допустимы в README)
- Конкретные формулировки: «Очередь доставки», не «Мониторинг в реальном времени»
- Статусы: «Доставлено», «Ошибки», «Ожидают», «В обработке»

## Применение

| Контекст | Использование |
|----------|---------------|
| Dashboard UI | primary-500 для кнопок, semantic для статусов, neutral для текста |
| README | Логотип, badge лицензии, primary-500 для ссылок |
| systemd unit-файлы | Описание через `#` комментарии, без визуальных элементов |
| Документация | Markdown, code blocks, таблицы — без цветов |
