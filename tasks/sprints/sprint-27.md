# Sprint 27: Queue Monitor UX — Error Drill-Down, Session Redirect, Alert Cleanup

**Цель:** закрыть основные pain points dashboard — дать оператору
возможность диагностировать ошибки (error detail drill-down), убрать
ручной редирект при session expiry и заменить alert() на inline banner.

**ADR:** [ADR-0040](../../docs/decisions/ADR-0040-ui-improvements-for-queue-monitor.md)

**Контекст:** Sprint 26 завершён — Lucide Icons, CSS-переменные shadcn/ui,
fontWeights подключены. 590+ тестов passing. UI functional, но содержит
3 key pain points:

1. ErrorsTable не показывает текст ошибки и payload — оператор не может
   диагностировать без ручного запроса к БД
2. Session expiry (401) → error string без redirect — оператор видит
   «Сессия истекла» и должен обновлять страницу вручную
3. alert() при logout ошибке — нативный браузерный диалог, не
   совместимый с design system

**Границы:** Решение ограничено `src/queue-monitor/ui/`. Не затрагивает
backend API (payload уже в `/api/metrics/errors`). ADR-0015 без изменений.

## Architecture Decisions

- **Expandable rows** вместо Dialog/Sheet: не требует нового shadcn-компонента,
  контекст сохраняется (таблица + detail), state `expandedId` в компоненте.
- **Redirect через 2s** вместо немедленного: оператор должен увидеть
  сообщение (0s — мелькнёт и исчезнет). 2s — достаточно для чтения.
- **Inline banner** вместо toast-библиотеки: паттерн уже используется
  в DashboardPage, +1 runtime-зависимость не нужна.

## Tasks

### Phase 1: Error Detail Drill-Down

#### Task 1: Expandable Rows in ErrorsTable

**Status:** Pending

**Description:** Добавить возможность раскрытия строки в ErrorsTable
для просмотра полного payload. Клик по строке → раскрывается секция
с JSON pretty-print. Повторный клик → сворачивает.

**Acceptance criteria:**
- [ ] Клик по `<TableRow>` toggles expanded state
- [ ] Expanded row: `<pre>` с `JSON.stringify(JSON.parse(payload), null, 2)`
- [ ] `max-h-48 overflow-auto` для длинных payloads
- [ ] `text-xs font-mono bg-muted p-3 rounded` для styled JSON
- [ ] `colSpan={5}` на expanded row
- [ ] `cursor-pointer` на кликабельных строках
- [ ] Loading/empty states без expanded rows
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/components/ErrorsTable.jsx`

**Dependencies:** None

**Estimated scope:** S

---

### Checkpoint: Error Drill-Down

- [ ] ErrorsTable раскрывается кликом
- [ ] JSON payload отображается formatted
- [ ] `npm run build` — сборка без ошибок

---

### Phase 2: Session Expiry Auto-Redirect

#### Task 2: Auto-Redirect on Session Expiry

**Status:** Pending

**Description:** При `SESSION_EXPIRED` в useMetrics — очистить
polling interval, показать сообщение, выполнить redirect на
`/api/auth/login` через 2 секунды.

**Acceptance criteria:**
- [ ] `SESSION_EXPIRED` → `clearInterval(refreshRef.current)`
- [ ] `setError('Сессия истекла. Перенаправление...')`
- [ ] `setTimeout(() => { window.location.href = '/api/auth/login'; }, 2000)`
- [ ] После redirect interval не перезапускается
- [ ] Обычные ошибки (не 401) — без redirect
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/hooks/useMetrics.js`

**Dependencies:** None

**Estimated scope:** XS

---

### Checkpoint: Session Expiry

- [ ] 401 → redirect через 2s
- [ ] Обычные ошибки → без redirect
- [ ] `npm run build` — сборка без ошибок

---

### Phase 3: Alert Cleanup

#### Task 3: Replace alert() with Inline Banner

**Status:** Pending

**Description:** Заменить `alert()` в `DashboardPage.logout()` на
inline error banner с кнопкой dismiss. Паттерн аналогичен
существующему error banner для metrics errors.

**Acceptance criteria:**
- [ ] Новый state `logoutError` в DashboardPage
- [ ] `alert()` заменён на `setLogoutError(message)`
- [ ] Banner: `bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3`
- [ ] Кнопка dismiss: `<Button variant="ghost" size="sm" onClick={() => setLogoutError(null)}>×</Button>`
- [ ] Banner исчезает при клике на dismiss
- [ ] Logout без ошибок → banner не показывается
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/DashboardPage.jsx`

**Dependencies:** None

**Estimated scope:** XS

---

### Checkpoint: Alert Cleanup

- [ ] alert() удалён из DashboardPage
- [ ] Inline banner работает
- [ ] `npm run build` — сборка без ошибок

---

## Checkpoint: Sprint 27 Complete

- [ ] ErrorsTable: expandable rows с JSON payload
- [ ] useMetrics: session expiry → auto-redirect через 2s
- [ ] DashboardPage: alert() → inline banner
- [ ] `npm run build` — сборка без ошибок
- [ ] `npm test` — все тесты passing

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Expandable rows ломают table layout | Medium | `colSpan={5}`, `align-top`, проверить в Storybook |
| Redirect мешает текущей работе оператора | Low | 2s delay — достаточно для чтения, не раздражает |
| Inline banner перекрывает контент | Low | Banner сверху main, не внутри panel |

## Open Questions

- Нужно ли добавить keyboard navigation для expandable rows (Enter/Space)?
  → Нет, для 1 оператора mouse-only достаточно. Отложено.

## Parallelization

Phase 1 (Task 1), Phase 2 (Task 2), Phase 3 (Task 3) — независимы,
могут выполняться параллельно.

## Файлы для изменения (сводка)

```
src/queue-monitor/ui/src/components/ErrorsTable.jsx      (модификация — expandable rows)
src/queue-monitor/ui/src/hooks/useMetrics.js             (модификация — session redirect)
src/queue-monitor/ui/src/pages/DashboardPage.jsx         (модификация — alert→banner)
```
