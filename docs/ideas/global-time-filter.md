# Глобальный фильтр времени для Queue Monitor Dashboard

## Problem Statement

Как дать оператору единый, удобный способ управления временным окном данных на всём дашборде — с предустановками, кастомным диапазоном и управлением автообновлением — в одной компактной верхней панели, вместо рассеянных по компонентам локальных переключателей?

## Recommended Direction

**Grafana-style TimePicker в верхней панели дашборда** — единый компонент `TimeRangeBar`, заменяющий текущий кнопку обновления (`DashboardPage:115-126`) и локальный переключатель окна в `TimeseriesChart`. Все компоненты дашборда (временные ряды, summary, топы, ошибки) получают данные из единого источника временного диапазона.

### Зачем

- Оператор переключается между «посмотреть за последний час» и «недельный тренд» — сейчас это 2 действия: клик на кнопку окна + ручной поиск других компонентов. С глобальным фильтром — 1 клик.
- Таблицы `TopTable` и `ErrorsTable` сегодня не привязаны к временному окну — оператор не знает, за какой период смотрит топы.
- Абсолютный диапазон (дата+время) нужен для расследования инцидентов: «что было 15 июля с 14:00 до 18:00?»

## Key Assumptions to Validate

- [ ] Все API-эндпоинты (`/api/metrics/top`, `/api/metrics/errors`, `/api/metrics/summary`) поддерживают параметр `window` или `since` — нужно проверить backend reader.js
- [ ] SQLite-запросы с фильтром `created_at >= (now - 86400*30)` для 30-дневного окна не превышают 100ms на текущем объёме (58k msg/мес)
- [ ] Абсолютный диапазон (from/to) вводит два параметра в каждый API-запрос — это совместимо с текущей архитектурой reader.js
- [ ] Текущий рефреш-таймер (30с) работает корректно при смене окна — нужно убедиться, что countdown сбрасывается
- [ ] Компонент `TimeseriesChart` корректно работает без собственного переключателя окна (только через props)
- [ ] Recharts `onMouseDown`/`onMouseMove`/`onMouseUp` на `<LineChart>` стабильно работают в v2.x — `activeLabel` возвращает bucket-timestamp (число), а не строку
- [ ] Drag-to-pan при `relative` режиме (окно от now): правая граница фиксирована — нужно ли запрещать перетаскивание вправо за now?
- [ ] При 30-дневном окне (2592000 сек) drag-сдвиг на 1px = ~3000 сек — этоAcceptable UX или нужен snap-to-bucket?

## MVP Scope

### In (MVP)

**1. Компонент `TimeRangeBar`** — единая панель в верхней части дашборда:

```
┌──────────────────────────────────────────────────────────────────┐
│ Зяблик — очередь доставки        │ Последние 6ч ▾ │ ⟳ 30с ▾ │
│                                  │                │         │
│                                  │ Обновить       │         │
└──────────────────────────────────────────────────────────────────┘
```

Содержит:
- **TimeRangeButton** — текст «Последние Nч/д/мес» или «ДД.ММ HH:MM — ДД.ММ HH:MM», иконка Clock, клик mở dropdown
- **RefreshButton** — иконка RefreshCw, текст «обновить (Nс)», dropdown для выбора интервала

**2. Выпадающий список предустановок (relative presets):**

| Label | Значение |
|-------|----------|
| Последний час | 3600 |
| Последние 6 часов | 21600 |
| Последние 12 часов | 43200 |
| Последние 24 часа | 86400 |
| Последние 3 дня | 259200 |
| Последние 7 дней | 604800 |
| Последние 30 дней | 2592000 |

**3. Абсолютный диапазон (Custom Range):**

Внизу dropdown — секция «Произвольный диапазон» с двумя `<input type="datetime-local">`:
- От: `from`
- До: `to`
- Кнопка «Применить»

При выборе абсолютного диапазона — текст на кнопке меняется на `ДД.ММ HH:MM — ДД.ММ HH:MM`.

**4. Выпадающий список интервала автообновления:**

| Label | Значение (ms) |
|-------|---------------|
| 30 сек | 30000 |
| 1 мин | 60000 |
| 5 мин | 300000 |
| 10 мин | 600000 |
| 30 мин | 1800000 |
| Выкл | null (отключает автообновление) |

**5. Интеграция с API:**

- `useMetrics` хук принимает `{ from, to }` или `{ windowSeconds }` — мутуально эксклюзивные параметры
- API эндпоинты обновляются:
  - `GET /api/metrics/timeseries?window=21600` (relative) или `?from=1721020800&to=1721056800` (absolute)
  - `GET /api/metrics/top?by=source&limit=5&window=21600` — добавить `window` параметр
  - `GET /api/metrics/errors?limit=20&window=21600` — добавить `window` параметр
  - `GET /api/metrics/summary` — добавить `window` параметр
- Backend `reader.js` обновляется: каждый query получает `since` (relative) или `from/to` (absolute)

**6. Refactoring `TimeseriesChart`:**

- Удаляем локальный переключатель окна (строки 98-110 в `TimeseriesChart.jsx`)
- Компонент принимает только `timeseries` данные — без `windowSeconds` и `onWindowChange`
- `WINDOWS` константа и `onWindowChange` проп — удаляются

**7. Refactoring `DashboardPage`:**

- Удаляем текущую кнопку обновления (строки 115-126)
- Добавляем `TimeRangeBar` в шапку
- Стейт `windowSeconds` → `timeRange` (объект `{ mode: 'relative', seconds: 21600 }` или `{ mode: 'absolute', from: Date, to: Date }`)
- Стейт `countdown` + `refreshMs` — переносятся в `TimeRangeBar`

**8. Drag-to-pan на графике (мышью влево/вправо):**

Оператор может перетаскивать график мышью для сдвига временного диапазона —
по аналогии с Grafana, но без зума (колесо мыши).

**Как работает:**

```
mousedown на графике → зафиксировать startX и текущий timeRange
mousemove → вычислить deltaX (px) → конвертировать в deltaT (sec) → показать ghost-оверлей
mouseup → применить новый timeRange → рефетч данных
```

**Реализация через Recharts API:**

Recharts предоставляет `onMouseDown`, `onMouseMove`, `onMouseUp` на `<LineChart>`.
Обработчики получают `MouseHandlerDataParam` с `activeLabel` — значение X-оси
в точке курсора. Этого достаточно для вычисления сдвига:

```jsx
// TimeseriesChart.jsx — drag-to-pan
const [dragState, setDragState] = useState(null); // { startLabel, startRange }

const onMouseDown = (e) => {
    if (!e?.activeLabel) return;
    setDragState({ startLabel: e.activeLabel });
};

const onMouseMove = (e) => {
    if (!dragState || !e?.activeLabel) return;
    // activeLabel — timestamp bucket (секунды Unix)
    // deltaT = e.activeLabel - dragState.startLabel
    const deltaT = e.activeLabel - dragState.startLabel;
    onTimeShift(deltaT); // колбэк в DashboardPage — сдвигает timeRange
};

const onMouseUp = () => {
    setDragState(null);
    onTimeShiftCommit(); // финализация: рефетч данных
};
```

**Ghost-оверлей:**

Пока пользователь перетаскивает — на графике рисуется полупрозрачная область
(`ReferenceArea`), показывающая новый диапазон:

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

**Конвертация пикселей → время:**

Есть два подхода:

1. **Через `activeLabel` (рекомендовано)** — Recharts сам даёт X-значение
   при `onMouseMove`. Не нужно знать pixel-to-time ratio. Дельта =
   `endLabel - startLabel` (в секундах Unix). Просто и надёжно.

2. **Через DOM-мертки** — `chartRef.current.getBoundingClientRect()` + пропорция
   `(deltaPx / chartWidthPx) * windowSeconds`. Требует доступа к SVG-элементу.

Подход 1 предпочтительнее — не зависит от DOM и работает с `ResponsiveContainer`.

**Ограничения:**

- При `relative` режиме («Последние 6ч»): сдвиг смещает окно от now.
  `endTime = now`, `startTime = now - window`. Дrag сдвигает оба.
  Нельзя пересечь now (правая граница фиксирована).
- При `absolute` режиме: сдвигает обе границы. Правая граница может
  превысить now (нет данных в будущем — показать «нет данных»).

**UX-детали:**

- Курсор: `grab` → `grabbing` при mousedown
- При быстром свайпе — инерция (опционально, MVP без неё)
- Double-click — сброс к пресету (опционально)

### Out (MVP)

- Зум на графике (колесо мыши / выделение области) — сложнее, Recharts не
  поддерживает нативно. Отдельная фича.
- Инерция (momentum) при быстром свайпе — nice-to-have
- Double-click для сброса — nice-to-have
- Сохранение последнего выбранного диапазона в localStorage — пока нет
- Экспорт данных за выбранный период — отдельный ADR

## Not Doing (and Why)

- **Зум на графике** — требует кастомного DOM overlay поверх Recharts или
  замены библиотеки. Drag-to-pan покрывает 80% use-cases без этой сложности.
- **Стрелки навигации (← →)** — drag мышью заменяет их. Стрелки добавляют
  edge cases (snap, boundaries) без реальной пользы для 1 оператора.
- **localStorage persistence** — оператор мониторит в реальном времени,
  persistence не критична. Позже.
- **Алертинг по времени** — «уведомить если за последний час > N ошибок»
  — отдельный ADR.
- **Multi-dashboard** — сейчас один дашборд, фильтр глобален по определению.
- **Пресеты «от текущего момента» vs «от конца дня»** — Grafana-стиль
  (от now) достаточен.

## Open Questions

- [ ] Какой формат datetime-local в браузере? (ISO 8601, `2026-07-24T14:00`) — стандартный HTML5, все браузеры
- [ ] Нужно ли показывать timezone в absolute picker? (Один оператор, сервер и клиент в одном timezone) — пока нет
- [ ] Как обрабатывать «от > до»? — Валидация на клиенте: кнопка «Применить» disabled если from >= to
- [ ] Максимальный диапазон? — 30 дней (ограничение SQLite query performance, достаточно для 58k msg/мес)
- [ ] Drag-to-pan: при `relative` режиме — разрешить сдвиг только влево (в прошлое) или в обе стороны? — Рекомендация: в обе стороны, но если правая граница > now — показать «нет данных» справа
- [ ] Drag-to-pan: нужен ли throttle на mousemove? — Recharts already batches renders, но при 60fps drag — рефетч не нужен, только UI-оверлей. Рефетч — на mouseup
- [ ] Drag-to-pan: какой cursor? — CSS `cursor: grab` на chart container, `cursor: grabbing` при drag. Tailwind: `cursor-grab` / `cursor-grabbing`
