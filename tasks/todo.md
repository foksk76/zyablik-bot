# Task Checklist — Sprint 27 + Sprint 28

## Sprint 27

- [ ] **1. ErrorsTable expandable rows** — click row → JSON payload section; colSpan=5, cursor-pointer, max-h-48 overflow-auto, text-xs font-mono bg-muted
- [ ] **2. useMetrics session redirect** — SESSION_EXPIRED → clearInterval + setTimeout redirect (2s) to /api/auth/login
- [ ] **3. DashboardPage alert→banner** — alert() replaced with inline error banner + dismiss button

## Sprint 28

- [ ] **4. useMetrics configurable limits** — topLimit (default 5), errorsLimit (default 20) params; used in fetch URLs
- [ ] **5. Limit controls UI** — Button groups [5/10/20] on TopTable, [20/50/100] on ErrorsTable; active=default, inactive=ghost
- [ ] **6. Countdown timer** — 30s countdown next to refresh button; resets on manual refresh; stops on session expiry
- [ ] **7. ErrorBoundary component** — new class component, fallback card with reload button
- [ ] **8. Wrap panels in ErrorBoundary** — 4 panels each in own ErrorBoundary

## Verification

- [ ] `npm run build` (in src/queue-monitor/ui/) — no errors
- [ ] `npm test` (in /root/zyablik-bot/) — all tests passing
