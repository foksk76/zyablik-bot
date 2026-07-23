# ADR-0034: Queue Monitor Dashboard

## Статус

Принято.

## Дата

2026-07-21

## Контекст

ADR-0028 вводит очередь доставки сообщений с гарантией at-least-once.
ADR-0033 добавляет crash recovery и coordinated shutdown. Очередь работает
стабильно (247 delivered / 42 failed за 21.07), но оператор не имеет
видимости в реальном времени: сколько сообщений в каждом статусе, как
меняется нагрузка по часам, кто отправляет больше всего, какие ошибки
встречаются.

Текущий мониторинг — ручной запрос к SQLite через `node -e`. Это не
масштабируется и не интегрируется с внешними системами мониторинга
(Zabbix, Prometheus).

### Прогноз нагрузки

- Текущий пик: 113 msg/час (21.07, 00–06 UTC)
- Прогноз +400% запас: 58 000 msg/мес ≈ 0.02 writes/sec
- SQLite WAL выдерживает 50 000–100 000 writes/sec → запас ×2.5M
- Нет потребности в миграции на PostgreSQL/MySQL

### Требования

1. Dashboard UI для 1 оператора — графики по статусам, топы, ошибки
2. API для внешних систем мониторинга (LLD-формат)
3. Auth через IdP (OAuth2/OIDC для UI, Bearer Token для metrics)
4. Readiness check для systemd
5. In-process (без отдельного microservice)

## Решение

Встроенный queue-monitor модуль внутри bot-platform. Один процесс, два
HTTP-сервера: ingress (текущий, ADR-0023) и queue-monitor (новый, stdlib
`http.createServer` на порту 9000). Readonly SQLite replica для чтения
без блокировки writer.

### Архитектура

```
bot-platform (Node.js)
├── src/bot-platform/          — текущий код (writer)
├── src/queue-monitor/         — новый модуль (reader)
│   ├── api/                   — REST эндпоинты
│   │   ├── metrics.js         — /api/metrics/* (Bearer Token / Session auth)
│   │   ├── auth.js            — Bearer Token auth (protectRoute)
│   │   └── auth-routes.js     — /api/auth/* (OAuth2/OIDC)
│   ├── auth/                  — OAuth2/OIDC middleware
│   │   ├── oidc.js            — IdP client (NanoIdP MVP, Okta/Keycloak prod)
│   │   └── session.js         — session cookie management
│   ├── db/                    — readonly SQLite replica
│   │   └── reader.js          — query functions
│   └── ui/                    — React SPA (Vite)
├── delivery-queue.db          — текущая БД (WAL)
└── systemd/                   — unit-файлы (обновлены)
```

### Auth

Два потока auth через единый IdP:

- **UI (оператор)**: OAuth2 Authorization Code + PKCE → session cookie
  (HTTP-only). Middleware на `/api/auth/*`. Logout endpoint.
- **Metrics (внешние системы)**: Bearer Token (`Authorization: Bearer xxx`)
  через ENV `METRICS_API_KEY`. Статический токен, read-only, не требует
  refresh. Совместимость: Zabbix HTTP Agent, Prometheus blackbox exporter,
  curl.

`/api/metrics/*` — с Bearer Token auth ИЛИ session cookie (ADR-0035).
`/readyz` — без auth (health check).

### API endpoints

| Endpoint | Auth | Описание |
|----------|------|----------|
| `GET /api/metrics/summary` | Bearer / Session | Агрегированная статистика |
| `GET /api/metrics/timeseries?window=1h` | Bearer / Session | Временные ряды по статусам |
| `GET /api/metrics/top?by=source&limit=5` | Bearer / Session | Топ отправителей/получателей |
| `GET /api/metrics/errors?limit=20` | Bearer / Session | Последние ошибки |
| `GET /api/metrics/discovery` | Bearer / Session | LLD-совместимый формат |
| `GET /readyz` | Нет | Readiness check (200/503) |
| `GET /api/auth/login` | Нет | OAuth2 redirect |
| `GET /api/auth/callback` | Нет | OAuth2 callback |
| `POST /api/auth/logout` | Session | Logout |

### Readonly SQLite replica

- `better-sqlite3` с `readonly: true` для reader
- WAL mode: concurrent reads не блокируют writer
- `dequeue()` в `bot-platform` продолжает работать без изменений
- **Crash recovery (`reclaimStale`)**: вызывается writer-ом (не reader-ом)
  перед каждым `dequeue()`. Readonly replica не может выполнять write-операции
  (`UPDATE ... SET status = 'pending'`), поэтому reader читает только актуальные
  данные после reclaim writer-ом

### LLD response format (`/api/metrics/discovery`)

Формат совместим с Zabbix Low-Level Discovery:

```json
{
  "data": [
    {
      "{#METRIC}": "delivered",
      "{#LABEL}": "Доставлено"
    },
    {
      "{#METRIC}": "failed",
      "{#LABEL}": "Ошибки"
    },
    {
      "{#METRIC}": "processing",
      "{#LABEL}": "В обработке"
    },
    {
      "{#METRIC}": "pending",
      "{#LABEL}": "Ожидают"
    }
  ]
}
```

### Схема queue (для reader)

Reader читает таблицу `queue` из текущей `delivery-queue.db`:

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | INTEGER PK | Auto-increment |
| `req_id` | TEXT | Request ID (для идемпотентности) |
| `source` | TEXT | Источник сообщения (`zabbix`, `manual`, и т.д.) |
| `payload` | TEXT | JSON — содержит `recipient` (получатель), `message`, и т.д. |
| `status` | TEXT | `pending` / `processing` / `delivered` / `failed` |
| `attempts` | INTEGER | Количество попыток доставки |
| `created_at` | INTEGER | Unix timestamp |
| `updated_at` | INTEGER | Unix timestamp |

Reader парсит JSON из `payload` для извлечения `recipient` (топ
получателей). Колонка `idempotency_key` из ADR-0028 в реализации
называется `req_id`.

### Shared shutdown handle

Queue-monitor добавляется в `stopHandles` массив через `unshift` (после worker):

```
stopHandles = [queue-worker, queue-monitor, ingress, queue-store]
```

`queue-monitor.stop()` закрывает HTTP-сервер и readonly DB connection.
Порядок остановки: worker → monitor → ingress → queue-store.

### Health check

`GET /readyz` → `200` (ok) или `503` (не готов). Проверяет:
- Readonly SQLite replica доступен
- Queue-store работает (basic query)

Для systemd: `ExecStartPost` и `WatchdogSec`.

## Рассмотренные альтернативы

### Microservice separation (вариант 2B/2C)

Отдельный `queue-monitor` сервис с readonly SQLite replica.

Минус: +1 процесс, +1 порт, конфигурация межпроцессного взаимодействия.
Для 1 оператора и среднего приоритета — оверхед. SQLite readonly на том же
хосте даёт 0 сетевых задержек. Отклонено.

### PostgreSQL/MySQL migration

Замена SQLite на PostgreSQL или MySQL для reader.

Минус: 58 000 msg/мес = 0.02 writes/sec. SQLite выдерживает 50 000–100 000
writes/sec. Миграция не оправдана текущей нагрузкой. Может быть revisited
при multi-instance deployment. Отклонено.

### WebSocket/SSE для live-обновлений

Real-time push вместо polling.

Минус: для 1 оператора polling каждые 30 секунд достаточен. WebSocket добавляет
сложность (reconnect, state management). Отклонено.

### Grafana/external dashboards

Использовать Grafana или аналог для визуализации.

Минус: свой UI проще интегрировать с внешними системами мониторинга.
Grafana требует отдельной инфраструктуры (PostgreSQL для metadata).
Отклонено.

### API Key (X-Metrics-Key header)

Статический ключ в custom header вместо Bearer Token.

Минус: Bearer Token — стандарт для OAuth2/OIDC экосистемы. Zabbix HTTP
Agent поддерживает `Authorization: Bearer` natивно. API Key — нестандартно
для мониторинга. Отклонено.

## Последствия

- Новый модуль `src/queue-monitor/` с API, auth, DB reader, UI
- Backend API: stdlib `http.createServer` (ADR-0023) — не добавляются
  HTTP-фреймворки (express, fastify, koa)
- Зависимости (исключения из ADR-0015, каждая обоснована):
  - `react`, `vite` — frontend SPA ( layer: ui/ )
  - `recharts` (или `chart.js`) — графики ( layer: ui/ )
  - `tailwindcss` — стилизация ( layer: ui/ )
  - UI-зависимости живут в отдельном `src/queue-monitor/ui/package.json`
    (не затрагивают root `package.json` и его ADR-0015 policy-test)
- OIDC auth: **hand-rolled** на stdlib (`node:fetch` + `node:crypto`),
  Authorization Code + PKCE (см. поправку ниже). Новых runtime-зависимостей
  в root `package.json` НЕ появляется.
- Session management: standalone session store (не Express middleware),
  совместимый с stdlib `http.createServer` (ADR-0023). Cookie подписан
  HMAC-SHA256 (без JWT — не тащим JWT-библиотеку).
- ENV: `METRICS_API_KEY`, `IDP_ISSUER`, `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`,
  `IDP_REDIRECT_URI`, `SESSION_SECRET`, `MONITOR_PORT` (default 9000)
- systemd unit-файл обновлён: порт 9000, `ExecStartPost` readiness check
- ADR-0015 (нулевые внешние зависимости) — расширен: UI-зависимости
  обоснованы и ограничены слоем `ui/` (отдельный package.json)
- Текущий `bot-platform` код не изменяется (reader-only модуль)
- `delivery-queue.db` продолжает использоваться той же БД (WAL)

## Поправка от 2026-07-21: hand-rolled OIDC вместо `openid-client`

Первоначально ADR-0034 предполагал `openid-client` как исключение из ADR-0015.
При реализации (Sprint 21) от этой зависимости отказались в пользу hand-rolled
OIDC-клиента на stdlib (`src/queue-monitor/auth/oidc.js`).

Причины:
- `openid-client` v5+ распространяется только в ESM-формате, тогда как
  репозиторий — CommonJS. Подключение потребовало бы dynamic `import()`
  и усложнило бы тестирование.
- В дереве уже есть две JWT/OIDC-библиотеки (`@okta/jwt-verifier`, `jose`).
  Третья — без необходимости: нужный flow (Authorization Code + PKCE,
  discovery, token exchange) укладывается в ~150 строк stdlib.
- Существующий прецедент: `src/bot-platform/ingress/oidc-verifier.js` уже
  hand-rolls JWKS-верификацию на `node:crypto` + `fetch` — тот же подход
  расширен на authorization-code flow.

Реализованный flow покрывает: PKCE (S256), state (cookie-echo против CSRF),
OP discovery через `/.well-known/openid-configuration` (с fallback на
конвенции `/authorize`, `/token`, `/userinfo`), client_secret_basic auth на
token endpoint. Refresh-token flow оставлен на future work (сессия живёт
`maxAgeSeconds`, после истечения — повторный login).

Альтернатива `openid-client` остаётся доступной через инъекцию
`options.oidcClient` в `createQueueMonitor` (ADR-0016), если later
потребуются advanced-фичи (back-channel logout, JWKS rotation edge cases).

## Тесты

- `tests/queue-monitor/api/metrics.test.js`: API endpoints с Bearer Token
- `tests/queue-monitor/api/auth.test.js`: Bearer + session auth, protectRoute
- `tests/queue-monitor/auth/session.test.js`: session store, signed cookies, CSRF
- `tests/queue-monitor/auth-routes.test.js`: OAuth2 flow, login/callback/logout
- `tests/queue-monitor/db/reader.test.js`: readonly queries, concurrent access
- `tests/queue-monitor/api/readyz.test.js`: readiness check 200/503
- Обновить `tests/bot-platform/app-shutdown.test.js`: queue-monitor в
  shutdown order
