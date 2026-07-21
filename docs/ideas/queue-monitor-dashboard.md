# Queue Monitor Dashboard

## Problem Statement

Как дать оператору реальную видимость в очередь доставки уведомлений — сколько сообщений в каждом статусе, как меняется нагрузка по часам, кто отправляет больше всего и кто получает, а также быстро находить ошибки, и при этом интегрироваться с внешней системой мониторинга (например, Zabbix)?

## Recommended Direction

**Readonly SQLite replica + stdlib HTTP (вариант 2A)**

Встроенный дашборд внутри bot-platform, читающий текущую SQLite через readonly replica. Один процесс, два HTTP-сервера: ingress (текущий, stdlib) и queue-monitor (новый, stdlib на порту 9000). `/api/metrics` эндпоинт для внешних систем мониторинга (LLD-формат).

**Почему:**
- Средний приоритет → минимальная инфраструктура
- SQLite readonly на том же хосте → 0 сетевых задержек, WAL concurrent reads
- `/api/metrics` для внешних систем мониторинга → встроенный в тот же процесс
- Нет миграции БД → SQLite sufficien для 58k msg/мес (запас ×2.5M)
- Auth через IdP → единый IdP для UI и ingest, но разные flow (OAuth2/OIDC для UI, JWT для ingest)
- Второй HTTP-сервер (порт 9000) для queue-monitor — через ADR (обновление ADR-0023, см. ADR-0034)

## Key Assumptions to Validate

- [ ] `better-sqlite3` readonly replica не блокирует `bot-platform` при чтении в WAL mode
- [ ] `/api/metrics` эндпоинт отвечает за <100ms (timeout по умолчанию у внешних систем)
- [ ] IdP (Okta/Keycloak) доступен для UI auth через OAuth2/OIDC
- [ ] `/api/metrics` формат совместим с LLD (Low-Level Discovery) для автоматического обнаружения метрик
- [ ] UI auth (OAuth2) и ingest auth (JWT) могут использовать один IdP с разными flow
- [ ] Bearer Token для metrics endpoint достаточен для внешних систем мониторинга

## MVP Scope

### In (MVP)

- **Dashboard UI**:
  - Графики количества сообщений по статусам (delivered/failed/processing/pending)
  - Временная ось с переключением окна: 1ч / 6ч / 12ч / 24ч
  - Топ-5 отправителей (source) и получателей (recipient из payload)
  - Текущий размер очереди и скорость обработки
  - Таблица последних ошибок (failed messages)

- **API**:
  - `GET /api/metrics/summary` — агрегированная статистика
  - `GET /api/metrics/timeseries?window=1h` — временные ряды по статусам
  - `GET /api/metrics/top?by=source&limit=5` — топ отправителей/получателей
  - `GET /api/metrics/errors?limit=20` — последние ошибки
  - `GET /api/metrics/discovery` — LLD-совместимый формат для внешних систем мониторинга
  - `GET /readyz` — readiness check (БД + queue-store), `200`/`503`

- **Интеграция**:
  - Readonly SQLite replica через `better-sqlite3` (WAL mode)
  - Автообновление данных каждые 30 сек (SSE или polling)
  - Discovery endpoint для внешних систем мониторинга (LLD-формат)

- **Auth (UI)**:
  - OAuth2/OIDC flow через IdP (Okta/Keycloak)
  - Сессия через HTTP-only cookie (JWT в cookie)
  - Middleware проверки сессии на всех UI-эндпоинтах (except `/readyz` и `/api/metrics/*`)
  - Logout endpoint
  - Единый IdP для UI и ingest, но разные flow:
    - UI: OAuth2 Authorization Code + PKCE → session cookie
    - Ingest: JWT Bearer token (текущий flow, без изменений)

- **Auth (Metrics)**:
  - Bearer Token (`Authorization: Bearer xxx`) для `/api/metrics/*`
  - Статический токен через ENV (`METRICS_API_KEY`)
  - Совместимость: Zabbix (HTTP Headers), Prometheus (authorization config), curl
  - Не требует refresh/token rotation (read-only, low-risk)

### Out (MVP)

- Real-time push (SSE/WebSocket) — polling достаточен
- Export в CSV/PDF
- Настройка алертов через UI
- Multi-tenant / multi-source
- Historical data archival (только текущая БД)
- Custom widgets / drag-and-drop

## Not Doing (and Why)

- **Microservice separation (2B/2C)** — оверхед для среднего приоритета
- **Собственный auth** — используем IdP (Okta/Keycloak), не изобретаем велосипед
- **ACL/роли** — один оператор, granular permissions не нужны
- **WebSocket/SSE** — polling каждые 30 сек достаточен для мониторинга
- **PostgreSQL/MySQL migration** — SQLite sufficien для 58k msg/мес
- **Grafana/external dashboards** — свой UI проще интегрировать с внешними системами
- **Алертинг через UI** — алерты идут через внешнюю систему мониторинга, не через дашборд
- **Historical data beyond SQLite** — нет потребности хранить >1 года
- **Шаблоны мониторинга** — настройка шаблонов (Zabbix/Prometheus/etc) на стороне внешней системы, не входит в MVP

## Architecture

```
bot-platform (Node.js)
├── src/bot-platform/          — текущий код
├── src/queue-monitor/         — новый модуль
│   ├── api/                   — REST эндпоинты
│   │   ├── metrics.js         — /api/metrics/* (без auth)
│   │   └── auth.js            — /api/auth/* (login/logout/callback)
│   ├── auth/                  — OAuth2/OIDC middleware
│   │   ├── oidc.js            — IdP client (Okta/Keycloak)
│   │   └── session.js         — session cookie management
│   ├── db/                    — readonly SQLite replica
│   │   └── reader.js          — query functions
│   └── ui/                    — React SPA (Vite)
│       ├── src/
│       └── package.json
├── delivery-queue.db          — текущая БД (WAL)
└── env.example                — IDP_ISSUER, IDP_CLIENT_ID, IDP_CLIENT_SECRET
```

## Tech Stack

| Компонент | Технология | Обоснование |
|-----------|------------|-------------|
| Backend API | stdlib `http.createServer` | ADR-0023: HTTP-фреймворки не добавляются |
| Auth | `openid-client` + `express-session` | Стандартный OIDC flow для Node.js (исключение из ADR-0015, см. ADR-0034) |
| DB Reader | `better-sqlite3` (readonly) | Уже в проекте, WAL concurrent reads |
| Frontend | React + Vite (SPA) | Проще Next.js для 1 оператора, нет SSR |
| Charts | Recharts / Chart.js | Лёгкие, React-friendly |
| Styling | Tailwind CSS | Быстрый прототип |
| Monitoring Integration | LLD-совместимый JSON | Универсальный формат для Zabbix/Prometheus/etc |

## Open Questions

- [x] Какой порт для дашборда? — **9000** (настраивается через ENV, дефолт 9000)
- [x] Нужен ли HTTPS для дашборда? — **HTTP sufficien**, HTTPS через внешний reverse proxy (Nginx/Caddy/Apache). Настройка reverse proxy не входит в MVP.
- [x] Какой IdP? — **MVP: NanoIdP**, совместимость с Okta/Keycloak для Prod
- [x] Как интегрировать с текущим signal handler (graceful shutdown)? — **A: Shared shutdown handle**. Queue-monitor добавляется в `stopHandles` массив, порядок остановки гарантирован.
- [x] Нужны ли health-check эндпоинты для systemd? — **Readiness (`GET /readyz`)**. `200` = ok, `503` = не готов. Проверяет БД + queue-store. Достаточно для systemd `ExecStartPost` и `WatchdogSec`.
