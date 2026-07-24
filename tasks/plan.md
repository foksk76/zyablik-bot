# Implementation Plan: Sprint 27 + Sprint 28 (ADR-0040 UI Improvements)

**ADR:** [ADR-0040](../docs/decisions/ADR-0040-ui-improvements-for-queue-monitor.md)
**Scope:** `src/queue-monitor/ui/` — no backend changes, no root package.json changes

---

## Sprint 27: Error Drill-Down, Session Redirect, Alert Cleanup

### Task 1 — Expandable Rows in ErrorsTable
**File:** `src/queue-monitor/ui/src/components/ErrorsTable.jsx`

- Add `useState` for `expandedId`
- Add `cursor-pointer` + `onClick` handler on `<TableRow>` (non-loading, non-empty state)
- Below each row, render a conditional expanded row: `<TableRow>` with `colSpan={5}`, containing `<pre>` with `JSON.stringify(JSON.parse(payload), null, 2)`
- Style: `text-xs font-mono bg-muted p-3 rounded max-h-48 overflow-auto`
- Loading skeleton and empty states remain unchanged

### Task 2 — Auto-Redirect on Session Expiry
**File:** `src/queue-monitor/ui/src/hooks/useMetrics.js`

- In `catch` block, when `err.message === 'SESSION_EXPIRED'`:
  - `clearInterval(refreshRef.current)` — stop polling
  - `setError('Сессия истекла. Перенаправление...')`
  - `setTimeout(() => { window.location.href = '/api/auth/login'; }, 2000)` — redirect after 2s
- Store timeout ref to clear on unmount

### Task 3 — Replace alert() with Inline Banner
**File:** `src/queue-monitor/ui/src/pages/DashboardPage.jsx`

- Add `logoutError` state
- Replace `alert(...)` with `setLogoutError(message)`
- Add banner markup above main (inside header area or top of main):
  ```
  <div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3 flex items-center justify-between">
    <span>{logoutError}</span>
    <Button variant="ghost" size="sm" onClick={() => setLogoutError(null)}>×</Button>
  </div>
  ```
- Banner shows only when `logoutError` is truthy

---

## Sprint 28: Configurable Limits, Countdown, Error Boundary

### Task 1 — Configurable Limits in useMetrics
**File:** `src/queue-monitor/ui/src/hooks/useMetrics.js`

- Add params `topLimit = 5`, `errorsLimit = 20` to `useMetrics()`
- Replace hardcoded `limit=5` with `limit=${topLimit}` in top fetch URL
- Replace hardcoded `limit=20` with `limit=${errorsLimit}` in errors fetch URL
- Add `topLimit`, `errorsLimit` to `useEffect` deps (restarts polling)

### Task 2 — Limit Controls in DashboardPage
**Files:** `DashboardPage.jsx`, `TopTable.jsx`, `ErrorsTable.jsx`

- DashboardPage: add `topLimit` (default 5) and `errorsLimit` (default 20) state
- Pass `limit={topLimit}` to useMetrics, pass `topLimit` to TopTable
- Pass `errorsLimit` to useMetrics, pass `errorsLimit` to ErrorsTable
- TopTable: accept `limit` + `onLimitChange` props, render Button group `[5] [10] [20]` in header
- ErrorsTable: accept `limit` + `onLimitChange` props, render Button group `[20] [50] [100]` in header
- Active button: `variant="default"`, inactive: `variant="ghost"`, all `size="sm"`

### Task 3 — Countdown Timer
**File:** `src/queue-monitor/ui/src/pages/DashboardPage.jsx`

- Add `countdown` state (default 30)
- `useEffect` with `setInterval(1000)`:
  ```
  countdown <= 1 ? 30 : countdown - 1
  ```
- Cleanup interval on unmount
- Refresh button text: `обновить (${countdown}с)`
- On manual refresh → `setCountdown(30)`
- On session expiry error → countdown stops (check `metrics.error` containing "Сессия истекла")

### Task 4 — ErrorBoundary Component
**File:** `src/queue-monitor/ui/src/components/ErrorBoundary.jsx` (NEW)

- Class component with `getDerivedStateFromError` + `componentDidCatch`
- State: `hasError`
- Fallback UI: Card with `py-8 text-center`, text "Ошибка отображения", Button "Перезагрузить" (`variant="outline" size="sm"`, `window.location.reload()`)

### Task 5 — Wrap Panels with Error Boundary
**File:** `src/queue-monitor/ui/src/pages/DashboardPage.jsx`

- Import `ErrorBoundary`
- Wrap each of 4 panels: `<SummaryCards>`, `<TimeseriesChart>`, `<TopTable>`, `<ErrorsTable>`
- Each `<ErrorBoundary>` is independent (separate state)

---

## Verification

```bash
cd src/queue-monitor/ui && npm run build
cd /root/zyablik-bot && npm test
```

Both must pass before marking complete.
