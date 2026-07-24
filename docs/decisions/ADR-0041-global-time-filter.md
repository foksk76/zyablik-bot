# ADR-0041: Глобальный фильтр времени для Queue Monitor Dashboard

## Статус

Принято.

## Дата

2026-07-24

## Контекст

ADR-0034 вводит Queue Monitor Dashboard. Текущий UI имеет разрозненные
механизмы управления временем:

1. **TimeseriesChart** — локальный переключатель окна 1ч/6ч/12ч/24ч
   (строки 98-110 в `TimeseriesChart.jsx`)
2. **DashboardPage** — кнопка «обновить (Nс)» с countdown (строки 115-126)
3. **TopTable / ErrorsTable** — не привязаны к временному окну вообще

Оператор не знает, за какой период смотрит топы и ошибки. Переключение
между «последний час» и «неделя» требует двух действий: клик на кнопку
окна + ручной поиск. Абсолютный диапазон (дата+время) отсутствует —
невозможно расследовать инциденты: «что было 15 июля с 14:00 до 18:00?»

### Pain points

| # | Проблема | Evidence |
|---|---------|----------|
| T1 | Переключатель окна привязан к графику | Оператор меняет окно на графике — топы и ошибки остаются за старый период |
| T2 | Нет абсолютного диапазона | Расследование инцидентов требует ручных SQL-запросов |
| T3 | Кнопка обновления отдельно от фильтра | Два элемента управления в разных местах — когнитивная нагрузка |
| T4 | Нет drag-to-pan | Оператор хочет сдвинуть время на 5 минут — это пресет «6ч» не покрывает |

## Решение

Ввести глобальный фильтр времени — единый компонент `TimeRangeBar` в верхней
панели дашборда, управляющий временным окном для всех компонентов: временные
ряды, summary, топы, ошибки.

### 1. Компонент `TimeRangeBar`

Единая панель в шапке дашборда, содержащая:

```
┌──────────────────────────────────────────────────────────────────┐
│ Зяблик — очередь доставки        │ Последние 6ч ▾ │ ⟳ 30с ▾ │
│                                  │                │         │
│                                  │ Обновить       │         │
└──────────────────────────────────────────────────────────────────┘
```

- **TimeRangeButton** — текст «Последние Nч/д/мес» или «ДД.ММ HH:MM —
  ДД.ММ HH:MM», иконка Clock, клик открывает dropdown
- **RefreshButton** — иконка RefreshCw, текст «обновить (Nс)», dropdown
  для выбора интервала автообновления

Почему единая панель:
- Один фокус внимания оператора — верхняя часть дашборда
- Заменяет 2 существующих элемента (кнопку обновления + переключатель
  окна в TimeseriesChart)
- Компактно: одна строка вместо рассеянных по компонентам контролов

### 2. Предустановки (relative presets)

| Label | Значение (секунды) |
|-------|-------------------|
| Последний час | 3600 |
| Последние 6 часов | 21600 |
| Последние 12 часов | 43200 |
| Последние 24 часа | 86400 |
| Последние 3 дня | 259200 |
| Последние 7 дней | 604800 |
| Последние 30 дней | 2592000 |

Почему 7 пресетов, а не 4 текущих:
- 3 дня и 7 дней — недельный обзор (текущий максимум 24ч не покрывает)
- 30 дней — месячный тренд для оценки динамики очереди

### 3. Абсолютный диапазон (Custom Range)

Внизу dropdown — секция «Произвольный диапазон»:

```html
От: <input type="datetime-local" />
До: <input type="datetime-local" />
<button>Применить</button>
```

- Формат: ISO 8601 (стандартный HTML5, все браузеры)
- Валидация: кнопка «Применить» disabled если `from >= to`
- Максимальный диапазон: 30 дней (ограничение SQLite query performance)
- Текст на кнопке: `ДД.ММ HH:MM — ДД.ММ HH:MM` (locale: ru-RU)

Почему `datetime-local`, а не кастомный пикер:
- Нулевые зависимости (ADR-0015)
- Стандартный HTML5 — работает везде
- Для 1 оператора достаточно

### 4. Интервал автообновления

| Label | Значение (ms) |
|-------|---------------|
| 30 сек | 30000 |
| 1 мин | 60000 |
| 5 мин | 300000 |
| 10 мин | 600000 |
| 30 мин | 1800000 |
| Выкл | null |

Dropdown рядом с кнопкой «обновить». При выборе «Выкл» — кнопка
«обновить» становится ручным триггером без автообновления.

### 5. Drag-to-pan на графике

Оператор может перетаскивать график мышью влево/вправо для сдвига
временного диапазона — по аналогии с Grafana.

**Реализация через Recharts API:**

```jsx
// TimeseriesChart.jsx
const [dragState, setDragState] = useState(null);

const onMouseDown = (e) => {
    if (!e?.activeLabel) return;
    setDragState({ startLabel: e.activeLabel });
};

const onMouseMove = (e) => {
    if (!dragState || !e?.activeLabel) return;
    const deltaT = e.activeLabel - dragState.startLabel;
    onTimeShift(deltaT);
};

const onMouseUp = () => {
    setDragState(null);
    onTimeShiftCommit();
};
```

**Ghost-оверлей:**

```jsx
{dragState && dragDeltaT !== 0 && (
    <ReferenceArea
        x1={dragState.startLabel}
        x2={dragState.startLabel + dragDeltaT}
        strokeOpacity={0.3}
        fill="var(--primary)"
        fillOpacity={0.1}
    />
)}
```

**Подход конвертации:** через `activeLabel` (рекомендовано) — Recharts
даёт X-значение при `onMouseMove`, дельта = `endLabel - startLabel`
(секунды Unix). Не зависит от DOM, работает с `ResponsiveContainer`.

**Ограничения:**

- `relative` режим: правая граница фиксирована (now), сдвиг только влево
- `absolute` режим: сдвиг обеих границ, правая может уйти за now

**Cursor:** `grab` → `grabbing` при drag (Tailwind: `cursor-grab`)

### 6. Интеграция с API

**Frontend — `useMetrics` хук:**

```js
// Было:
useMetrics({ windowSeconds, refreshMs, topLimit, errorsLimit })

// Стало:
useMetrics({ timeRange, refreshMs, topLimit, errorsLimit })
// timeRange = { mode: 'relative', seconds: 21600 }
//          или { mode: 'absolute', from: 1721020800, to: 1721056800 }
```

- При `relative`: `?window=21600` (текущий формат)
- При `absolute`: `?from=1721020800&to=1721056800`

**Backend — API эндпоинты:**

| Endpoint | Текущий | Обновлённый |
|----------|---------|-------------|
| `GET /api/metrics/timeseries` | `?window=1h` | `?window=21600` или `?from=&to=` |
| `GET /api/metrics/summary` | нет параметра | `?window=21600` или `?from=&to=` |
| `GET /api/metrics/top` | `?by=&limit=` | `?by=&limit=&window=` или `?from=&to=` |
| `GET /api/metrics/errors` | `?limit=` | `?limit=&window=` или `?from=&to=` |

**Backend — `reader.js`:**

```js
function buildTimeFilter(windowSeconds, from, to) {
    if (from && to) {
        return { clause: 'created_at >= ? AND created_at <= ?', params: [from, to] };
    }
    if (windowSeconds) {
        const since = Math.floor(Date.now() / 1000) - windowSeconds;
        return { clause: 'created_at >= ?', params: [since] };
    }
    return { clause: '1=1', params: [] };
}
```

### 7. Refactoring `TimeseriesChart`

- Удаляем локальный переключатель окна (строки 98-110)
- Удаляем `WINDOWS` константу (строки 10-15)
- Удаляем пропы `windowSeconds` и `onWindowChange`
- Добавляем пропы `onTimeShift` и `onTimeShiftCommit` для drag-to-pan
- Компонент принимает только данные — без управления окном

### 8. Refactoring `DashboardPage`

- Удаляем текущую кнопку обновления (строки 115-126)
- Добавляем `TimeRangeBar` в шапку (после навбара, перед main)
- Стейт `windowSeconds` → `timeRange` (объект с `mode`)
- Стейт `countdown` + `refreshMs` — переносятся в `TimeRangeBar`
- Добавляем `onTimeShift` / `onTimeShiftCommit` для drag-to-pan

## Рассмотренные альтернативы

### Несколько локальных фильтров (per-component)

Каждый компонент (график, топы, ошибки) имеет свой фильтр времени.

Минус: оператор управляет 3-4 фильтрами. Когнитивная нагрузка.
Несогласованность — один фильтр «6ч», другой «24ч». Отклонено.

### Стрелки навигации (← →) вместо drag-to-pan

Кнопки-стрелки для сдвига временного окна на 1 шаг.

Минус: drag мышью более естественен для оператора. Стрелки добавляют
edge cases (snap to window boundaries, что считать «шагом»).
Drag-to-pan заменяет стрелки полностью. Отклонено.

### Зум на графике (колесо мыши / выделение области)

Масштабирование поддиапазона через scroll wheel или drag-to-select.

Минус: Recharts не поддерживает нативно. Требует кастомного DOM overlay
или замены библиотеки. Drag-to-pan покрывает 80% use-cases без этой
сложности. Отдельная фича позже. Отклонено.

### localStorage для persistence последнего диапазона

Сохранять выбранный диапазон в localStorage, восстанавливать при перезагрузке.

Минус: оператор мониторит в реальном времени, перезагрузка = всегда «от now».
Persistence не критична для 1 оператора. Позже. Отклонено.

## Граница решения

### Изменяемые слои:

- `src/queue-monitor/ui/` — frontend (TimeRangeBar, TimeseriesChart, DashboardPage, useMetrics)
- `src/queue-monitor/api/metrics.js` — backend API (парсинг from/to параметров)
- `src/queue-monitor/db/reader.js` — SQL-запросы (buildTimeFilter)

### Не затрагивается:

- `src/bot-platform/` — без изменений
- `src/zabbix-media-type/` — без изменений
- Auth flow — без изменений
- ADR-0015 policy-test (root) — без изменений
- Очередь доставки (ADR-0028) — без изменений

## Последствия

### Новые файлы

```text
src/queue-monitor/ui/src/components/TimeRangeBar.jsx     — единая панель фильтра времени
src/queue-monitor/ui/src/components/TimeRangeDropdown.jsx — dropdown с пресетами и custom range
src/queue-monitor/ui/src/hooks/useTimeRange.js           — стейт-менеджер для timeRange
```

### Изменённые файлы

```text
src/queue-monitor/ui/src/components/TimeseriesChart.jsx  — удаление локального переключателя, drag-to-pan
src/queue-monitor/ui/src/pages/DashboardPage.jsx         — TimeRangeBar, timeRange state, onTimeShift
src/queue-monitor/ui/src/hooks/useMetrics.js             — timeRange вместо windowSeconds
src/queue-monitor/api/metrics.js                         — парсинг from/to параметров
src/queue-monitor/db/reader.js                           — buildTimeFilter для absolute range
```

### Не затронуто

- `src/bot-platform/` — без изменений
- `src/zabbix-media-type/` — без изменений
- Auth flow — без изменений
- Storybook stories — обновить для TimeseriesChart (новые пропы)

### Ожидаемый результат

- `npm test` проходит
- UI собирается (`npm run build` в `ui/`)
- Единый фильтр времени в шапке дашборда
- Все компоненты (график, summary, топы, ошибки) используют один timeRange
- Предустановки: 1ч, 6ч, 12ч, 24ч, 3 дня, 7 дней, 30 дней
- Абсолютный диапазон: два datetime-local пикера
- Автообновление: dropdown 30с / 1м / 5м / 10м / 30м / выкл
- Drag-to-pan: перетаскивание графика мышью для сдвига времени
- Ghost-оверлей при drag (ReferenceArea)
- Курсор grab/grabbing при drag

## Ссылки

- [ADR-0034](ADR-0034-queue-monitor-dashboard.md) — Queue Monitor Dashboard
- [ADR-0036](ADR-0036-design-system-for-queue-monitor-ui.md) — Дизайн-система
- [ADR-0040](ADR-0040-ui-improvements-for-queue-monitor.md) — Предыдущие UI-улучшения
- [docs/ideas/global-time-filter.md](../ideas/global-time-filter.md) — Pre-ADR idea document
