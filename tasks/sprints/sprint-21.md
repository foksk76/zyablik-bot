# Sprint 21: Queue Monitor Frontend UI + OAuth2 Auth

## Outcome

Построить React SPA дашборд для queue-monitor: авторизация через
OAuth2/OIDC (NanoIdP MVP), session cookies, UI компоненты для
метрик (summary, timeseries charts, top recipients, errors table),
интеграция frontend build с HTTP-сервером queue-monitor.

Контекст: Sprint 20 завершён — backend API с Bearer Token auth работает.
Теперь нужен UI для оператора: визуализация метрик, авторизация через IdP,
автообновление данных.

## Architecture Decisions

- **ADR-0034:** Readonly SQLite replica, stdlib `http.createServer`,
  Bearer Token для metrics, OAuth2/OIDC для UI
- **ADR-0023:** HTTP-фреймворки (express/fastify) не добавляются — только stdlib
- **ADR-0015:** `openid-client` — исключение (auth layer),
  `react`/`vite`/`recharts`/`tailwindcss` — в отдельном `ui/package.json`
- **React + Vite:** SPA без SSR, 1 оператор, простота. Frontend в
  `src/queue-monitor/ui/` с отдельным `package.json` (не нарушает ADR-0015
  для root package.json).
- **OAuth2/OIDC:** `openid-client` для flow. NanoIdP для MVP, Okta/Keycloak для prod.
- **Session:** Standalone session store (не Express middleware) — совместим
  с stdlib `http.createServer` (ADR-0023). In-memory Map для MVP.
- **Session cookie:** HTTP-only, JWT внутри. Cookie парсится вручную
  через `Cookie` header в HTTP handler.
- **Build:** `vite build` → `dist/`. HTTP-сервер раздаёт static files
  из `dist/` для `GET /*` (кроме `/api/*` и `/readyz`).
- **Charts:** Recharts — лёгкий, React-native, достаточно для 1 оператора.

### Related ADRs

| ADR | Constraint | Where it applies |
|-----|-----------|-----------------|
| ADR-0013 | `createSafeLogger()` для всех модулей, secret redaction | OIDC client не логирует токены |
| ADR-0015 | Нулевые внешние зависимости | `openid-client` — исключение (ADR-0034) |
| ADR-0016 | Options-based DI паттерн | Все factory functions |
| ADR-0023 | stdlib HTTP only | Session store — standalone, не Express middleware |
| ADR-0031 | Apache-2.0 SPDX headers | Все новые файлы в `src/queue-monitor/` |
| ADR-0033 | Shutdown ordering | queue-monitor останавливается после queue-store (WAL dependency) |
| ADR-0034 | OAuth2/OIDC для UI, stdlib HTTP | Весь спринт |

## Tasks

### Task 1: UI Scaffold — React + Vite + Tailwind

**Status:** To Do

**Description:** Инициализировать React SPA в `src/queue-monitor/ui/`.
Создать `package.json`, `vite.config.js`, `tailwind.config.js`,
базовую структуру с `index.html`, `src/main.jsx`, `src/App.jsx`.

**Acceptance criteria:**
- [ ] `src/queue-monitor/ui/package.json` с dependencies: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `recharts`
- [ ] `src/queue-monitor/ui/vite.config.js` — dev server на порту 5173, proxy `/api` → `http://localhost:9000`
- [ ] `src/queue-monitor/ui/tailwind.config.js` — базовая конфигурация
- [ ] `src/queue-monitor/ui/index.html` — entry point
- [ ] `src/queue-monitor/ui/src/main.jsx` — React root render
- [ ] `src/queue-monitor/ui/src/App.jsx` — базовый layout с routing
- [ ] `npm run dev` в `ui/` запускает dev server
- [ ] `npm run build` в `ui/` создаёт `dist/` с production build

**Verification:**
- [ ] `cd src/queue-monitor/ui && npm run dev` — dev server стартует
- [ ] `cd src/queue-monitor/ui && npm run build` — `dist/` создан
- [ ] Browser: `http://localhost:5173` показывает пустой layout

**Dependencies:** None

**Files likely touched:**
- `src/queue-monitor/ui/package.json` (новый)
- `src/queue-monitor/ui/vite.config.js` (новый)
- `src/queue-monitor/ui/tailwind.config.js` (новый)
- `src/queue-monitor/ui/postcss.config.js` (новый)
- `src/queue-monitor/ui/index.html` (новый)
- `src/queue-monitor/ui/src/main.jsx` (новый)
- `src/queue-monitor/ui/src/App.jsx` (новый)
- `src/queue-monitor/ui/src/index.css` (новый)

**Estimated scope:** S (8 файлов, шаблоны)

---

### Task 2: OIDC Client + Session Store

**Status:** To Do

**Description:** Создать `src/queue-monitor/auth/oidc.js` — OIDC-клиент
для авторизации через IdP. Создать `src/queue-monitor/auth/session.js` —
standalone session store для управления session cookie (без Express,
совместим с stdlib `http.createServer`).

**Acceptance criteria:**
- [ ] `createOidcClient({ issuer, clientId, clientSecret, redirectUri })` — factory
- [ ] `oidcClient.getAuthorizationUrl()` → URL для redirect на IdP
- [ ] `oidcClient.callback(code)` → `{ accessToken, idToken, profile }`
- [ ] `oidcClient.refresh(refreshToken)` → `{ accessToken }`
- [ ] `createSessionStore({ secret, maxAge })` — standalone store (не Express middleware)
  - In-memory Map для session storage (MVP)
  - `store.get(sessionId)` → session object или null
  - `store.set(sessionId, session)` → void
  - `store.destroy(sessionId)` → void
- [ ] `parseSessionCookie(req, secret)` → `{ sessionId, user }` или null — парсит `Cookie` header
- [ ] `setSessionCookie(res, sessionId, maxAge)` → void — устанавливает `Set-Cookie` header
- [ ] Session хранит `user` object из ID token claims
- [ ] Cookie: HTTP-only, secure (in prod), sameSite: lax
- [ ] Тесты: mock OIDC responses, session creation/destruction, cookie parsing

**Примечание:** `express-session` НЕ используется — ADR-0023 требует
только stdlib HTTP. Session store реализуется как standalone модуль,
интегрируемый через ручную обработку `Cookie`/`Set-Cookie` headers
в `http.createServer` handler.

**Verification:**
- [ ] `node --test tests/queue-monitor/oidc.test.js` — тесты проходят
- [ ] `node --test tests/queue-monitor/session.test.js` — тесты проходят
- [ ] `npm test` — без регрессий

**Dependencies:** None

**Files likely touched:**
- `src/queue-monitor/auth/oidc.js` (новый)
- `src/queue-monitor/auth/session.js` (новый)
- `tests/queue-monitor/oidc.test.js` (новый)
- `tests/queue-monitor/session.test.js` (новый)

**Estimated scope:** M (4 файла)

---

### Task 3: Auth Endpoints (login, callback, logout)

**Status:** To Do

**Description:** Создать `src/queue-monitor/api/auth-routes.js` —
обработчики для OAuth2 flow: login (redirect на IdP), callback
(exchange code → session), logout (destroy session).

**Acceptance criteria:**
- [ ] `createAuthRoutes({ oidcClient, sessionMiddleware })` → `{ login, callback, logout }`
- [ ] `GET /api/auth/login` → redirect на IdP authorization URL
- [ ] `GET /api/auth/callback?code=xxx` → exchange code, create session, redirect на `/`
- [ ] `POST /api/auth/logout` → destroy session, redirect на `/`
- [ ] Ошибки callback → redirect на `/` с error flash
- [ ] CSRF protection: state parameter в OAuth2 flow
- [ ] Тесты: полный flow (mock OIDC)

**Verification:**
- [ ] `node --test tests/queue-monitor/auth-routes.test.js` — тесты проходят
- [ ] `npm test` — без регрессий

**Dependencies:** Task 2

**Files likely touched:**
- `src/queue-monitor/api/auth-routes.js` (новый)
- `tests/queue-monitor/auth-routes.test.js` (новый)

**Estimated scope:** S (2 файла)

---

### Task 4: Dashboard UI Components

**Status:** To Do

**Description:** Создать React компоненты для дашборда: summary cards,
timeseries chart, top recipients/sources table, errors table.
Использовать Recharts для графиков, Tailwind для стилей.

**Acceptance criteria:**
- [ ] `SummaryCards` — отображает pending/processing/delivered/failed + total
- [ ] `TimeseriesChart` — line chart по статусам, переключение окна 1ч/6ч/12ч/24ч
- [ ] `TopTable` — топ-5 отправителей и получателей (переключение by=source/by=recipient)
- [ ] `ErrorsTable` — последние ошибки (id, source, recipient, attempts, time)
- [ ] `DashboardPage` — собирает все компоненты, fetch данные с `/api/metrics/*`
- [ ] Автообновление каждые 30 сек (setInterval + cleanup)
- [ ] Loading state и error state для каждого компонента
- [ ] Responsive layout (Tailwind breakpoints)
- [ ] Login page: кнопка «Войти через IdP»

**Verification:**
- [ ] `cd src/queue-monitor/ui && npm run build` — build succeeds
- [ ] Browser: dashboard отображает данные (с mock API или реальным)
- [ ] Responsive: mobile/tablet/desktop layouts корректны

**Dependencies:** Task 1, Sprint 20 (backend API)

**Files likely touched:**
- `src/queue-monitor/ui/src/components/SummaryCards.jsx` (новый)
- `src/queue-monitor/ui/src/components/TimeseriesChart.jsx` (новый)
- `src/queue-monitor/ui/src/components/TopTable.jsx` (новый)
- `src/queue-monitor/ui/src/components/ErrorsTable.jsx` (новый)
- `src/queue-monitor/ui/src/pages/DashboardPage.jsx` (новый)
- `src/queue-monitor/ui/src/pages/LoginPage.jsx` (новый)
- `src/queue-monitor/ui/src/hooks/useMetrics.js` (новый)
- `src/queue-monitor/ui/src/App.jsx` (редактирование)

**Estimated scope:** L (8 файлов, React components)

---

### Task 5: Build Integration + Static Serving

**Status:** To Do

**Description:** Интегрировать frontend build с HTTP-сервером queue-monitor.
После `vite build` статические файлы из `dist/` раздаются для `GET /*`.
Добавить script `build:ui` в root `package.json`.

**Acceptance criteria:**
- [ ] `src/queue-monitor/http-server.js` раздаёт static files из `dist/` для `GET /*`
- [ ] Static serving: проверяет существование файла, fallback на `index.html` (SPA routing)
- [ ] MIME types: `.html`, `.js`, `.css`, `.json`, `.png`, `.svg`
- [ ] `GET /api/*` и `GET /readyz` не перехватываются static handler
- [ ] Root `package.json`: `build:ui` script → `cd src/queue-monitor/ui && npm install && npm run build`
- [ ] Root `package.json`: `build` script → `npm run build:ui`
- [ ] `src/queue-monitor/index.js` передаёт `staticDir` в HTTP-сервер

**Verification:**
- [ ] `npm run build:ui` — frontend build succeeds
- [ ] `MONITOR_ENABLED=true METRICS_API_KEY=test node src/bot-platform/app.js` — dashboard доступен на `http://localhost:9000/`
- [ ] `curl http://localhost:9000/` — HTML response (SPA)
- [ ] `curl http://localhost:9000/api/metrics/summary` — JSON response (не static)
- [ ] `npm test` — без регрессий

**Dependencies:** Task 1, Task 4, Sprint 20 (HTTP server)

**Files likely touched:**
- `src/queue-monitor/http-server.js` (редактирование)
- `src/queue-monitor/index.js` (редактирование)
- `package.json` (редактирование)

**Estimated scope:** S (3 файла)

---

## Checkpoint: Sprint 21

- [ ] `npm test` passes
- [ ] `npm run build:ui` succeeds
- [ ] Dashboard UI renders в browser на `http://localhost:9000/`
- [ ] OAuth2 login flow работает с NanoIdP
- [ ] Session cookie устанавливается после login
- [ ] Metrics данные отображаются на dashboard
- [ ] Auto-refresh каждые 30 сек
- [ ] Static assets served by queue-monitor HTTP server
- [ ] Все файлы в `src/queue-monitor/` имеют SPDX header
- [ ] Review перед мержем

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `openid-client` native deps on some platforms | Medium | Prebuild binaries; fallback: manual OIDC implementation |
| Vite dev server proxy в dev mode | Low | Proxy config в `vite.config.js`; production — static serving |
| Session secret management | Medium | Secret через ENV `SESSION_SECRET`, не хардкодить |
| CSRF в OAuth2 state parameter | Low | `openid-client` генерирует state автоматически |
| Frontend bundle size | Low | Recharts + React = ~200KB gzipped; acceptable for 1 operator |
| NanoIdP compatibility с OIDC spec | Medium | Test с real NanoIdP instance; fallback: mock during dev |

## Не входит в спринт

- **Zabbix template** — настройка на стороне Zabbix
- **Okta/Keycloak production setup** — отдельный ADR (ADR-0027)
- **ACL/роли** — один оператор, granular permissions не нужны
- **WebSocket/SSE** — polling достаточен
- **Export в CSV/PDF** — Out of MVP
- **Алертинг через UI** — алерты через внешнюю систему мониторинга
