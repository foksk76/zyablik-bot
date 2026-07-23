# UI Guidelines: Queue Monitor Dashboard

Руководство по использованию дизайн-системы для AI и людей.
Ограничен `src/queue-monitor/ui/`.

## Approved Components

Использовать только shadcn/ui компоненты из `src/components/ui/`:

| Компонент | Импорт | Назначение |
|-----------|--------|------------|
| Button | `./ui/button.jsx` | Кнопки (default, destructive, outline, ghost) |
| Card | `./ui/card.jsx` | Карточки (metric cards, panels) |
| Table | `./ui/table.jsx` | Таблицы (данные, списки) |
| Badge | `./ui/badge.jsx` | Статусы (success, warning, error, info) |
| Input | `./ui/input.jsx` | Поля ввода |

## Icons

Иконки: **только** `lucide-react` (tree-shakeable, ISC лицензия).
Никаких кастомных SVG-иконок.

### Icon Reference

| Иконка | Импорт | Где используется |
|--------|--------|------------------|
| `Clock` | `lucide-react` | SummaryCards (pending), TimeseriesChart (window buttons) |
| `Loader` | `lucide-react` | SummaryCards (processing) |
| `CheckCircle` | `lucide-react` | SummaryCards (delivered) |
| `XCircle` | `lucide-react` | SummaryCards (failed) |
| `RefreshCw` | `lucide-react` | DashboardPage (refresh button) |
| `LogOut` | `lucide-react` | DashboardPage (logout button) |
| `Bird` | `lucide-react` | LoginPage (logo) |
| `ArrowUpRight` | `lucide-react` | TopTable (source toggle) |
| `Users` | `lucide-react` | TopTable (recipient toggle) |
| `AlertTriangle` | `lucide-react` | ErrorsTable (error rows) |

### Usage Pattern

```jsx
import { RefreshCw } from 'lucide-react';

<Button variant="ghost" size="sm">
    <RefreshCw className="w-4 h-4 mr-1 shrink-0" />
    обновить
</Button>
```

Стиль иконок по умолчанию: `w-4 h-4` (16px) или `w-3.5 h-3.5` (14px).
Для кнопок: добавлять `mr-1 shrink-0` для отступа и предотвращения сжатия.

## Forbidden Patterns

### Inline styles

```jsx
// BAD
<div style={{ color: 'red' }}>

// GOOD
<div className="text-error">
```

### Hardcoded colors

```jsx
// BAD
<div className="bg-[#0ea5e9]">

// GOOD (tokens)
<div className="bg-brand-500">
```

### Raw HTML tables

```jsx
// BAD
<table className="..."><thead>...</thead></table>

// GOOD
import { Table, TableHeader, ... } from './ui/table.jsx';
<Table>...</Table>
```

### Custom button styles

```jsx
// BAD
<button className="bg-blue-500 text-white px-4 py-2 rounded">

// GOOD
import { Button } from './ui/button.jsx';
<Button variant="default">...</Button>
```

## Typical Patterns

### Metric Card

```jsx
import { Card, CardContent } from '../components/ui/card.jsx';
import { Badge } from '../components/ui/badge.jsx';

<Card>
    <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <Badge variant="success">Доставлено</Badge>
    </CardContent>
</Card>
```

### Data Table

```jsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table.jsx';

<Table>
    <TableHeader>
        <TableRow>
            <TableHead>Column</TableHead>
        </TableRow>
    </TableHeader>
    <TableBody>
        <TableRow>
            <TableCell>Value</TableCell>
        </TableRow>
    </TableBody>
</Table>
```

### Toggle Buttons (filter/tabs)

```jsx
import { Button } from '../components/ui/button.jsx';

<Button variant={active ? 'default' : 'ghost'} size="sm" onClick={...}>
    Label
</Button>
```

### Error Banner

```jsx
<div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3">
    Error message
</div>
```

## Creating a New Dashboard Panel

1. Создать файл `src/components/NewPanel.jsx`
2. Импортировать Card, Table, Badge из `./ui/`
3. Использовать tokens для цветов (`bg-brand-500`, `text-neutral-700`)
4. Добавить в `DashboardPage.jsx`
5. Создать story в `src/stories/NewPanel.stories.jsx`

## Color Reference

| Семантика | Tailwind | Hex |
|-----------|----------|-----|
| Primary | `brand-500` | `#0ea5e9` |
| Success | `success` / `success-light` / `success-dark` | `#10b981` |
| Error | `error` / `error-light` / `error-dark` | `#f43f5e` |
| Warning | `warning` / `warning-light` / `warning-dark` | `#f59e0b` |
| Info | `info` / `info-light` / `info-dark` | `#3b82f6` |
| Text | `neutral-700` | `#334155` |
| Muted | `neutral-400` | `#94a3b8` |
| Background | `neutral-50` | `#f8fafc` |
| Border | `neutral-200` | `#e2e8f0` |

## References

- [Brand Book](brand-book.md) — палитра, типографика, тон
- Storybook: `cd src/queue-monitor/ui && npm run storybook`
- [ADR-0036](decisions/ADR-0036-design-system-for-queue-monitor-ui.md) — дизайн-система
