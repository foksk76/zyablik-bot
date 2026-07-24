# Sprint 28: Queue Monitor Polish — Configurable Limits, Countdown, Error Boundary

**Цель:** добавить гибкость (configurable limits), visibility (auto-refresh
countdown) и resilience (error boundary) для dashboard.

**ADR:** [ADR-0040](../../docs/decisions/ADR-0040-ui-improvements-for-queue-monitor.md)

**Контекст:** Sprint 27 завершён — error drill-down, session redirect,
alert cleanup. 590+ тестов passing. Dashboard functional, но:

1. TopTable limit=5, ErrorsTable limit=20 — hardcoded, оператор не может
   изменить
2. 30s polling — «слепой»: оператор не знает когда обновится
3. Crash в 1 компоненте = white-screen всего dashboard

**Границы:** Решение ограничено `src/queue-monitor/ui/`. Backend API
уже поддерживает `limit` query parameter. ADR-0015 без изменений.

## Architecture Decisions

- **Configurable limits через Button group** (shadcn): не требует
  нового компонента (Input существует, но Button group проще для
  фиксированных опций). Варианты: 5/10/20 (top), 20/50/100 (errors).
- **Countdown через useState + setInterval** на 1s: простая клиентская
  логика, не требует WebSocket/SSE. Сбрасывается при ручном refresh.
- **Error Boundary per panel**: краш в TimeseriesChart не ломает
  SummaryCards и TopTable. Fallback — error card с кнопкой reload.

## Tasks

### Phase 1: Configurable Limits

#### Task 1: Configurable Limits in useMetrics

**Status:** Pending

**Description:** Добавить параметры `topLimit` и `errorsLimit` в
useMetrics. Подставлять их в fetch URLs вместо hardcoded значений.

**Acceptance criteria:**
- [ ] `useMetrics` принимает `topLimit` (default 5) и `errorsLimit` (default 20)
- [ ] `fetchJson(`/api/metrics/top?by=${topBy}&limit=${topLimit}`)`
- [ ] `fetchJson(`/api/metrics/errors?limit=${errorsLimit}`)`
- [ ] `topLimit` и `errorsLimit` в dependencies useEffect (перезапуск
      polling при изменении)
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/hooks/useMetrics.js`

**Dependencies:** None

**Estimated scope:** XS

---

#### Task 2: Limit Controls in DashboardPage

**Status:** Pending

**Description:** Добавить UI controls для изменения limits —
Button group рядом с соответствующими панелями.

**Acceptance criteria:**
- [ ] State `topLimit` (default 5) и `errorsLimit` (default 20)
- [ ] TopTable: Button group [5] [10] [20] над таблицей
- [ ] ErrorsTable: Button group [20] [50] [100] над таблицей
- [ ] Активная кнопка: `variant="default"`, неактивная: `variant="ghost"`
- [ ] Кнопки `size="sm"` для компактности
- [ ] При клике → обновляется state → useMetrics перезапускает fetch
- [ ] `npm run build` — сборка без ошибок

**Files:**
- `src/queue-monitor/ui/src/pages/DashboardPage.jsx`
- `src/queue-monitor/ui/src/components/TopTable.jsx`
- `src/queue-monitor/ui/src/components/ErrorsTable.jsx`

**Dependencies:** Task 1

**Estimated scope:** S

---

### Checkpoint: Configurable Limits

- [ ] topLimit: 5/10/20 — работает
- [ ] errorsLimit: 20/50/100 — работает
- [ ] `npm run build` — сборка без ошибок

---

### Phase 2: Auto-Refresh Countdown

#### Task 3: Countdown Timer

**Status:** Pending

**Description:** Добавить таймер обратного отсчёта до следующего
auto-refresh. Отображается рядом с кнопкой «обновить».

**Acceptance criteria:**
- [ ] State `countdown` (default 30) в DashboardPage
- [ ] `useEffect` с `setInterval(1000)`: `countdown <= 1 ? 30 : countdown - 1`
- [ ] Cleanup interval при unmount
- [ ] Кнопка «обновить» показывает: `обновить ({countdown}с)`
- [ ] При ручном refresh → `setCountdown(30)` (сброс)
- [ ] При session expiry → countdown останавливается
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/DashboardPage.jsx`

**Dependencies:** None

**Estimated scope:** XS

---

### Checkpoint: Countdown

- [ ] Countdown показывает 30 → 29 → ... → 1 → 30
- [ ] Ручной refresh сбрасывает countdown
- [ ] `npm run build` — сборка без ошибок

---

### Phase 3: Error Boundary

#### Task 4: Create ErrorBoundary Component

**Status:** Pending

**Description:** Создать React Error Boundary компонент.
Fallback — error card с кнопкой перезагрузки страницы.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/components/ErrorBoundary.jsx`
- [ ] Class component с `getDerivedStateFromError`
- [ ] Fallback: Card с текстом «Ошибка отображения» и кнопкой
      «Перезагрузить» (`window.location.reload()`)
- [ ] Кнопка: `Button variant="outline" size="sm"`
- [ ] Стили: `py-8 text-center` для fallback
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/components/ErrorBoundary.jsx` (новый)

**Dependencies:** None

**Estimated scope:** S

---

#### Task 5: Wrap Dashboard Panels with Error Boundary

**Status:** Pending

**Description:** Обернуть каждый dashboard panel в отдельный
Error Boundary. Краш в 1 компоненте не ломает остальные.

**Acceptance criteria:**
- [ ] `<ErrorBoundary>` вокруг `<SummaryCards>`
- [ ] `<ErrorBoundary>` вокруг `<TimeseriesChart>`
- [ ] `<ErrorBoundary>` вокруг `<TopTable>`
- [ ] `<ErrorBoundary>` вокруг `<ErrorsTable>`
- [ ] Каждый boundary независим (отдельный state)
- [ ] Краш в одном panel → остальные 3 продолжают работать
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/DashboardPage.jsx`

**Dependencies:** Task 4

**Estimated scope:** XS

---

### Checkpoint: Error Boundary

- [ ] ErrorBoundary компонент создан
- [ ] 4 dashboard panel обёрнуты
- [ ] `npm run build` — сборка без ошибок

---

## Checkpoint: Sprint 28 Complete

- [ ] Configurable limits: 5/10/20 (top), 20/50/100 (errors)
- [ ] Auto-refresh countdown рядом с кнопкой «обновить»
- [ ] Error Boundary на каждом dashboard panel
- [ ] `npm run build` — сборка без ошибок
- [ ] `npm test` — все тесты passing

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Countdown drift при long sessions | Low | setInterval(1000) достаточно точен для 30s intervals |
| Error Boundary ловит только render errors | Medium | Class component с getDerivedStateFromError + componentDidCatch |
| Limit controls перегружают UI | Low | Button group `size="sm"`, компактный layout |

## Open Questions

- Нужны ли limit controls для SummaryCards или TimeseriesChart?
  → Нет, они используют summary/timeseries без limit параметра.
- Нужен ли persistent countdown (чтоб при переключении вкладки
  таймер не сбрасывался)?
  → Нет, для 1 оператора visibility достаточна. Отложено.

## Parallelization

Phase 1 (Tasks 1-2), Phase 2 (Task 3), Phase 3 (Tasks 4-5) —
независимы, могут выполняться параллельно.

Phase 1 внутренне последовательна: Task 1 → Task 2.
Phase 3 внутренне последовательна: Task 4 → Task 5.

## Файлы для изменения (сводка)

```
# Phase 1: Configurable Limits
src/queue-monitor/ui/src/hooks/useMetrics.js             (модификация — limit params)
src/queue-monitor/ui/src/pages/DashboardPage.jsx         (модификация — limit state + controls)
src/queue-monitor/ui/src/components/TopTable.jsx         (модификация — limit prop)
src/queue-monitor/ui/src/components/ErrorsTable.jsx      (модификация — limit prop)

# Phase 2: Countdown
src/queue-monitor/ui/src/pages/DashboardPage.jsx         (модификация — countdown state)

# Phase 3: Error Boundary
src/queue-monitor/ui/src/components/ErrorBoundary.jsx    (новый файл)
src/queue-monitor/ui/src/pages/DashboardPage.jsx         (модификация — wrap panels)
```
