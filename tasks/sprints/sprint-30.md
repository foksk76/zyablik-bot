# Sprint 30: Глобальный фильтр времени — UI Components + Drag-to-Pan

**Цель:** реализовать TimeRangeBar, TimeRangeDropdown, рефактор
DashboardPage и TimeseriesChart (drag-to-pan).

**ADR:** [ADR-0041](../../docs/decisions/ADR-0041-global-time-filter.md)

**Контекст:** Sprint 29 завершён — backend поддерживает `window`/`from/to`,
хуки `useTimeRange` и `useMetrics` обновлены. Все тесты passing.

**Границы:** Только `src/queue-monitor/ui/src/`. Не затрагивает backend.

## Tasks

### Phase 4: UI Components

#### Task 7: TimeRangeDropdown

**Status:** Pending

**Description:** Выпадающий список с предустановленными диапазонами
времени. Заменяет локальные кнопки окна в TimeseriesChart.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/components/TimeRangeDropdown.jsx`
- [ ] Опции: 1ч, 6ч, 12ч, 24ч, 3 дня, 7 дней, 30 дней
- [ ] Текущее значение отображается в trigger-кнопке
- [ ] Выбор опции вызывает `onSelect(seconds)`
- [ ] Использует `Select` из shadcn/ui (`components/ui/select.jsx`)
- [ ] Доступность: `aria-label="Выбор временного диапазона"`
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/components/TimeRangeDropdown.jsx` (новый)

**Estimated scope:** S

---

#### Task 8: AbsoluteRangePicker

**Status:** Pending

**Description:** Два datetime-local input для выбора абсолютного
диапазона + кнопки Apply/Cancel.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/components/AbsoluteRangePicker.jsx`
- [ ] Два `<input type="datetime-local">` — from и to
- [ ] Кнопка "Применить" — вызывает `onApply(fromTimestamp, toTimestamp)`
- [ ] Кнопка "Отмена" — вызывает `onCancel()`
- [ ] Валидация: `from < to`, `from > 0`
- [ ] Доступность: `aria-label` на input
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/components/AbsoluteRangePicker.jsx` (новый)

**Estimated scope:** S

---

#### Task 9: TimeRangeBar

**Status:** Pending

**Description:** Объединённый компонент: TimeRangeDropdown + кнопка
календаря (toggle absolute mode). Отображается над графиков.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/components/TimeRangeBar.jsx`
- [ ] Содержит `TimeRangeDropdown` + `Button` (календарь иконка)
- [ ] Кнопка календаря toggles `isAbsolute` state
- [ ] При `isAbsolute === true` — показывает `AbsoluteRangePicker`
- [ ] Пропсы: `{ timeRange, onTimeRangeChange }`
- [ ] `onTimeRangeChange(mode, value)` — вызывает `setRelative` или `setAbsolute`
  из `useTimeRange`
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/components/TimeRangeBar.jsx` (новый)

**Dependencies:** Tasks 7, 8

**Estimated scope:** S

---

### Checkpoint: UI Components

- [ ] `TimeRangeDropdown` работает
- [ ] `AbsoluteRangePicker` работает
- [ ] `TimeRangeBar` объединяет оба компонента
- [ ] `npm run build` — сборка без ошибок

---

### Phase 5: DashboardPage + TimeseriesChart

#### Task 10: Рефактор DashboardPage

**Status:** Pending

**Description:** Заменить `windowSeconds` state на `useTimeRange` хук.
Добавить `TimeRangeBar` в layout.

**Acceptance criteria:**
- [ ] Удалить `windowSeconds` state из DashboardPage
- [ ] Добавить `const { timeRange, setRelative, setAbsolute } = useTimeRange()`
- [ ] Передать `timeRange` в `useMetrics` вместо `windowSeconds`
- [ ] Добавить `TimeRangeBar` между заголовком и графиком
- [ ] Убрать `windowSeconds` и `onWindowChange` из пропсов `TimeseriesChart`
- [ ] Countdown сбрасывается при смене `timeRange` (уже в useEffect)
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/DashboardPage.jsx`

**Dependencies:** Task 6, 9

**Estimated scope:** M

---

#### Task 11: Рефактор TimeseriesChart — удаление window picker

**Status:** Pending

**Description:** Убрать локальные кнопки окна (1ч/6ч/12ч/24ч) из
TimeseriesChart. Window picker теперь в TimeRangeBar.

**Acceptance criteria:**
- [ ] Убрать `WINDOWS` массив из TimeseriesChart
- [ ] Убрать `windowSeconds` и `onWindowChange` из пропсов
- [ ] Компонент чисто отображает данные — никаких controls
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/components/TimeseriesChart.jsx`

**Dependencies:** Task 10

**Estimated scope:** S

---

#### Task 12: Drag-to-pan на TimeseriesChart

**Status:** Pending

**Description:** Реализовать drag-to-pan на графике через Recharts
`onMouseDown`/`onMouseMove`/`onMouseUp`. При завершении drag —
вызывать `onPan(from, to)`.

**Acceptance criteria:**
- [ ] Ref: `const chartRef = useRef(null)` для доступа к DOM
- [ ] State: `isDragging`, `dragStartX`
- [ ] `onMouseDown(e)` — записывает `dragStartX = e.chartX`, `isDragging = true`
- [ ] `onMouseMove(e)` — если `isDragging`, обновляет `dragEndX = e.chartX`
- [ ] `onMouseUp(e)` — вычисляет `from` и `to` из pixel coordinates:
  - `fromPixel = min(dragStartX, e.chartX)`
  - `toPixel = max(dragStartX, e.chartX)`
  - Конвертирует через Recharts `scale` (XAxis domain)
- [ ] Если `toPixel - fromPixel > 10px` (порог) — вызывает `onPan(fromTs, toTs)`
- [ ] Визуальная обратная связь: `cursor: grabbing` при drag
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/components/TimeseriesChart.jsx`

**Dependencies:** Task 11

**Estimated scope:** M

---

### Checkpoint: DashboardPage + TimeseriesChart

- [ ] DashboardPage использует `useTimeRange` хук
- [ ] TimeRangeBar отображается в layout
- [ ] TimeseriesChart — без локального window picker
- [ ] Drag-to-pan работает
- [ ] `npm run build` — сборка без ошибок

---

## Checkpoint: Sprint 30 Complete

- [ ] TimeRangeDropdown, AbsoluteRangePicker, TimeRangeBar
- [ ] DashboardPage рефакторен
- [ ] TimeseriesChart — без локального picker + drag-to-pan
- [ ] `npm test` — все тесты passing
- [ ] `npm run build` — сборка без ошибок

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Recharts chartX не точный | Medium | Использовать `e.chartX` от Recharts events, порог 10px |
| drag-to-pan конфликт с tooltip | Low | Tooltip по `onClick`, pan по `onMouseUp` |
| AbsoluteRangePicker не интуитивный | Low | UX: placeholder в datetime-local, валидация с сообщениями |
| Break DashboardPage layout | Medium | Спринт-тест: визуально проверить все breakpoints |

## Parallelization

Tasks 7-9 (UI components) параллельны.
Task 10 (DashboardPage) зависит от Tasks 6 и 9.
Task 11 (TimeseriesChart cleanup) зависит от Task 10.
Task 12 (drag-to-pan) зависит от Task 11.

## Файлы для изменения (сводка)

```
# Phase 4: UI Components
src/queue-monitor/ui/src/components/TimeRangeDropdown.jsx      (новый файл)
src/queue-monitor/ui/src/components/AbsoluteRangePicker.jsx    (новый файл)
src/queue-monitor/ui/src/components/TimeRangeBar.jsx           (новый файл)

# Phase 5: DashboardPage + TimeseriesChart
src/queue-monitor/ui/src/pages/DashboardPage.jsx               (модификация — useTimeRange, TimeRangeBar)
src/queue-monitor/ui/src/components/TimeseriesChart.jsx        (модификация — удаление window picker, drag-to-pan)
```
