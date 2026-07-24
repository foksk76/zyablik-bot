# Sprint 29: Глобальный фильтр времени — Backend + State Management

**Цель:** реализовать backend-поддержку глобального фильтра времени
(`window`/`from`/`to` параметры) и стейт-менеджмент на клиенте.

**ADR:** [ADR-0041](../../docs/decisions/ADR-0041-global-time-filter.md)

**Контекст:** Sprint 28 завершён — configurable limits, countdown,
error boundary. 624 тестов passing. ADR-0041 принят: глобальный фильтр
времени для всего дашборда с предустановками (1ч–30д), абсолютным
диапазоном и drag-to-pan.

**Границы:** Backend: `reader.js`, `metrics.js`. Frontend: `useMetrics.js`,
новый хук `useTimeRange.js`. Не затрагивает `bot-platform`, `zabbix-media-type`.

## Architecture Decisions

- **`buildTimeFilter()` в `reader.js`** — единая функция для построения
  SQL WHERE-условия. Принимает `windowSeconds` (relative) ИЛИ `from/to`
  (absolute). Возвращает `{ clause, params }` для подстановки в prepared
  statement.
- **Dynamic SQL для top/errors** — подготовленные statements с `WHERE`
  условием не работают (SQLite prepared statements не поддерживают
  переменные в WHERE-clause). Используем `db.prepare()` с шаблоном
  и `all()` с параметрами.
- **`useTimeRange` хук** — стейт-менеджер для `{ mode, seconds, from, to }`.
  Экспортит `timeRange`, `setRelative`, `setAbsolute`, `shift`.
  Изолирует бизнес-логику времени от DashboardPage.
- **`useMetrics` принимает `timeRange`** вместо `windowSeconds` —
  конвертация в query string происходит внутри хука.

## Tasks

### Phase 1: Backend — buildTimeFilter

#### Task 1: buildTimeFilter в reader.js

**Status:** Pending

**Description:** Добавить функцию `buildTimeFilter(windowSeconds, from, to)`
в `reader.js`. Возвращает объект `{ clause: string, params: Array }`.

**Acceptance criteria:**
- [ ] `buildTimeFilter(3600)` → `{ clause: 'created_at >= ?', params: [now-3600] }`
- [ ] `buildTimeFilter(0)` → `{ clause: '1=1', params: [] }` (без фильтра)
- [ ] `buildTimeFilter(0, 1721020800, 1721056800)` → `{ clause: 'created_at >= ? AND created_at <= ?', params: [1721020800, 1721056800] }`
- [ ] `buildTimeFilter(3600, 1721020800, 1721056800)` → absolute приоритетнее
- [ ] Функция экспортируется через `module.exports`
- [ ] `npm test` — все тесты passing

**Files:** `src/queue-monitor/db/reader.js`

**Estimated scope:** S

---

#### Task 2: Динамические SQL-запросы в reader.js

**Status:** Pending

**Description:** Обновить функции `summary()`, `topSource()`,
`topRecipient()`, `errors()` для принятия `timeFilter` параметра.
Использовать `db.prepare(template).all(...params)` вместо
подготовленных statements (SQLite не поддерживает переменные
в WHERE-clause prepared statements).

**Acceptance criteria:**
- [ ] `summary(timeFilter)` — добавляет `WHERE ${timeFilter.clause}` в запрос
- [ ] `topSource(limit, timeFilter)` — добавляет `WHERE source != '' AND ${timeFilter.clause}`
- [ ] `topRecipient(limit, timeFilter)` — добавляет `WHERE payload LIKE '%"recipient"%' AND ${timeFilter.clause}`
- [ ] `errors(limit, timeFilter)` — добавляет `WHERE status = 'failed' AND ${timeFilter.clause}`
- [ ] При `timeFilter = { clause: '1=1', params: [] }` — поведение идентично текущему
- [ ] Prepared statements для `timeseries` и `ping` остаются без изменений
- [ ] `npm test` — все тесты passing

**Files:** `src/queue-monitor/db/reader.js`

**Dependencies:** Task 1

**Estimated scope:** M

---

### Checkpoint: Backend buildTimeFilter

- [ ] `buildTimeFilter()` экспортируется и работает
- [ ] Все функции reader принимают `timeFilter`
- [ ] `npm test` — все тесты passing

---

### Phase 2: Backend — API endpoints

#### Task 3: Добавить from/to во все API endpoints

**Status:** Pending

**Description:** Обновить `metrics.js` — добавить парсинг `from`/`to`
параметров во все эндпоинты. `parseWindowSeconds` уже существует.
Добавить `parseFromTo(ctx)` для извлечения абсолютного диапазона.

**Acceptance criteria:**
- [ ] `parseFromTo(ctx)` возвращает `{ from: number, to: number }` или `{ from: null, to: null }`
- [ ] `parseFromTo` валидирует: `from < to`, оба — числа, `from > 0`
- [ ] `timeseries(ctx)` — поддержка `?from=&to=` (приоритет над `?window=`)
- [ ] `summary(ctx)` — поддержка `?window=` и `?from=&to=`
- [ ] `top(ctx)` — поддержка `?window=` и `?from=&to=`
- [ ] `errors(ctx)` — поддержка `?window=` и `?from=&to=`
- [ ] Response body содержит `window` (relative) ИЛИ `from`/`to` (absolute)
- [ ] `npm test` — все тесты passing

**Files:** `src/queue-monitor/api/metrics.js`

**Dependencies:** Task 2

**Estimated scope:** M

---

#### Task 4: Тесты для backend изменений

**Status:** Pending

**Description:** Обновить `tests/queue-monitor/api/metrics.test.js`
и `tests/queue-monitor/db/reader.test.js` для покрытия новых
параметров.

**Acceptance criteria:**
- [ ] Тест: `GET /api/metrics/timeseries?window=3600` — возвращает данные за час
- [ ] Тест: `GET /api/metrics/timeseries?from=X&to=Y` — возвращает данные за диапазон
- [ ] Тест: `GET /api/metrics/summary?window=3600` — summary за час
- [ ] Тест: `GET /api/metrics/top?window=3600` — top за час
- [ ] Тест: `GET /api/metrics/errors?window=3600` — errors за час
- [ ] Тест: невалидные from/to → 400 или fallback на без фильтра
- [ ] Тест: `buildTimeFilter` — unit test для всех веток
- [ ] `npm test` — все тесты passing

**Files:**
- `tests/queue-monitor/api/metrics.test.js`
- `tests/queue-monitor/db/reader.test.js`

**Dependencies:** Task 3

**Estimated scope:** M

---

### Checkpoint: Backend API

- [ ] Все 4 эндпоинта поддерживают `window` и `from/to`
- [ ] Тесты покрывают новые параметры
- [ ] `npm test` — все тесты passing

---

### Phase 3: Frontend — State Management

#### Task 5: Хук useTimeRange

**Status:** Pending

**Description:** Создать хук `useTimeRange` — стейт-менеджер для
временного диапазона. Экспортит `timeRange`, `setRelative`,
`setAbsolute`, `shift`.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/hooks/useTimeRange.js`
- [ ] Начальное значение: `{ mode: 'relative', seconds: 3600 }` (1ч)
- [ ] `setRelative(seconds)` — устанавливает `{ mode: 'relative', seconds }`
- [ ] `setAbsolute(from, to)` — устанавливает `{ mode: 'absolute', from, to }`
- [ ] `shift(deltaT)` — сдвигает текущий диапазон на deltaT секунд
  - relative: сдвигает `seconds` (не может стать < 60)
  - absolute: сдвигает оба `from` и `to`
- [ ] `useCallback` для всех функций (стабильные ссылки)
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/hooks/useTimeRange.js` (новый)

**Estimated scope:** S

---

#### Task 6: Рефактор useMetrics — timeRange вместо windowSeconds

**Status:** Pending

**Description:** Изменить `useMetrics` — принимать `timeRange` объект
вместо `windowSeconds`. Конвертировать в query string внутри хука.

**Acceptance criteria:**
- [ ] `useMetrics({ timeRange, refreshMs, topLimit, errorsLimit })`
- [ ] `timeRange.mode === 'relative'` → `?window=${timeRange.seconds}`
- [ ] `timeRange.mode === 'absolute'` → `?from=${timeRange.from}&to=${timeRange.to}`
- [ ] `summary` fetch: добавить `?window=` или `?from=&to=`
- [ ] `top` fetch: добавить `?window=` или `?from=&to=`
- [ ] `errors` fetch: добавить `?window=` или `?from=&to=`
- [ ] `timeRange` в `useCallback` dependencies (перезапуск fetch при смене)
- [ ] Backward compatibility: `windowSeconds` как deprecated fallback
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/hooks/useMetrics.js`

**Dependencies:** Task 5

**Estimated scope:** S

---

### Checkpoint: Frontend State

- [ ] `useTimeRange` хук работает
- [ ] `useMetrics` принимает `timeRange`
- [ ] `npm run build` — сборка без ошибок

---

## Checkpoint: Sprint 29 Complete

- [ ] `buildTimeFilter()` в reader.js
- [ ] Все API endpoints поддерживают `window` и `from/to`
- [ ] Тесты для backend изменений
- [ ] `useTimeRange` хук
- [ ] `useMetrics` принимает `timeRange`
- [ ] `npm test` — все тесты passing
- [ ] `npm run build` — сборка без ошибок

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Dynamic SQL теряет производительность | Medium | `db.prepare(template)` кэширует план. Проверить EXPLAIN QUERY PLAN |
| SQLite не индексирует `created_at` | Low | Текущий объём (58k) — full scan <100ms. Индекс при необходимости |
| from/to валидация на клиенте не sufficient | Medium | Backend тоже валидрует: `parseFromTo` возвращает null при невалидных значениях |
| `useTimeRange` breaking change в `useMetrics` | Low | Deprecated `windowSeconds` fallback, миграция в Sprint 30 |

## Parallelization

Phase 1 (Tasks 1-2) → Phase 2 (Tasks 3-4) — последовательно.
Phase 3 (Tasks 5-6) — независим от Phase 1-2, может выполняться параллельно.

## Файлы для изменения (сводка)

```
# Phase 1-2: Backend
src/queue-monitor/db/reader.js                    (модификация — buildTimeFilter, dynamic SQL)
src/queue-monitor/api/metrics.js                  (модификация — from/to парсинг)
tests/queue-monitor/api/metrics.test.js           (модификация — новые тесты)
tests/queue-monitor/db/reader.test.js             (модификация — buildTimeFilter tests)

# Phase 3: Frontend
src/queue-monitor/ui/src/hooks/useTimeRange.js    (новый файл)
src/queue-monitor/ui/src/hooks/useMetrics.js      (модификация — timeRange)
```
