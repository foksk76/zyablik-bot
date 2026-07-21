# Sprint 20: Queue Monitor Backend API

## Outcome

Построить backend API queue-monitor модуля: readonly SQLite replica для
чтения очереди доставки, stdlib HTTP-сервер на порту 9000 с Bearer Token
auth, 5 metrics-эндпоинтов (summary, timeseries, top, errors, discovery),
readiness check, и интеграция с shutdown flow в `app.js`.

Контекст: ADR-0034 принят (2026-07-21). Очередь работает стабильно
(289 total, 214 delivered за 21.07), но оператор не имеет видимости
в реальном времени. Ручной запрос к SQLite через `node -e` не
масштабируется и не интегрируется с внешними системами мониторинга.

353 тестов passing на старте спринта. Цель — 380+ после реализации.

## Architecture Decisions

- **ADR-0034:** Readonly SQLite replica, stdlib `http.createServer`,
  Bearer Token для metrics, OAuth2/OIDC для UI
- **ADR-0023:** HTTP-фреймворки (express/fastify) не добавляются — только stdlib
- **ADR-0015:** `openid-client`, `express-session` — исключения (auth layer),
  `react`/`vite`/`recharts`/`tailwindcss` — в отдельном `ui/package.json`
- **Модуль `src/queue-monitor/`:** отдельный от `src/bot-platform/`,
  инжектируется в `app.js` через `stopHandles`. Читает ту же `delivery-queue.db`,
  но через отдельное readonly-подключение.
- **Config:** `src/queue-monitor/config.js` — собственные ENV vars
  (`MONITOR_PORT`, `METRICS_API_KEY`). `dbPath` инжектируется извне
  (shared с bot-platform).
- **DB reader:** `better-sqlite3` с `readonly: true`. Не вызывает
  `reclaimStale` — writer делает это перед каждым `dequeue()`.
  Reader читает только актуальные данные.
- **HTTP server:** stdlib `http.createServer` (ADR-0023). Паттерн
  идентичен `ingress/http-server.js`: factory function, `start()`/`stop()`,
  `MODULE_NAME` для логирования.
- **Bearer Token:** статический токен через ENV `METRICS_API_KEY`.
  Read-only, low-risk, совместимость с Zabbix HTTP Agent / Prometheus / curl.
- **`/readyz`:** без auth. Проверяет readonly replica доступен.
  Для systemd `ExecStartPost`.

### Related ADRs

| ADR | Constraint | Where it applies |
|-----|-----------|-----------------|
| ADR-0013 | `createSafeLogger()` для всех модулей, secret redaction | Auth модуль не логирует `METRICS_API_KEY` |
| ADR-0015 | Нулевые внешние зависимости | `better-sqlite3` — исключение (ADR-0025) |
| ADR-0016 | Options-based DI паттерн | Все factory functions (`createDbReader`, `createBearerAuth`, etc.) |
| ADR-0023 | stdlib HTTP only | HTTP-сервер queue-monitor |
| ADR-0025 | `better-sqlite3` для storage layer | DB reader |
| ADR-0028 | Queue schema (`req_id`, statuses) | DB reader queries |
| ADR-0033 | `processing_since`, `reclaimStale` semantics | Reader не вызывает reclaim (writer делает это) |
| ADR-0034 | Readonly replica, Bearer Token, stdlib HTTP | Весь спринт |

### Dependency Graph

```
src/queue-monitor/config.js
    │
    ├── src/queue-monitor/db/reader.js
    │       │
    │       ├── src/queue-monitor/api/metrics.js
    │       │       │
    │       │       └── src/queue-monitor/api/auth.js (Bearer Token)
    │       │
    │       └── src/queue-monitor/api/readyz.js
    │
    ├── src/queue-monitor/http-server.js
    │       │
    │       └── src/queue-monitor/index.js (facade)
    │               │
    │               └── src/bot-platform/app.js (integration)
    │
    └── src/queue-monitor/ui/ (Sprint 21)
            ├── src/queue-monitor/auth/oidc.js
            └── React SPA
```

## Tasks

### Task 1: Config — ENV vars для queue-monitor

**Status:** To Do

**Description:** Создать `src/queue-monitor/config.js` с конфигурацией
queue-monitor модуля. Читает ENV vars с паттерном, идентичным
`bot-platform/core/config.js`: `readEnvValue`, `readBoolEnvValue`,
`readIntegerEnvValue`.

**Acceptance criteria:**
- [ ] `MONITOR_ENABLED` (bool, default `false`) — включает queue-monitor
- [ ] `MONITOR_PORT` (integer, default `9000`, range 1024–65535) — порт HTTP-сервера
- [ ] `METRICS_API_KEY` (string, default `''`) — Bearer Token для `/api/metrics/*`
- [ ] `MONITOR_DB_PATH` (string, default `''`) — путь к БД (пустой = инжектируется)
- [ ] Функция `createQueueMonitorConfig(environment)` возвращает объект конфига
- [ ] Валидация: `MONITOR_PORT` в диапазоне; `METRICS_API_KEY` не пустой
  если `MONITOR_ENABLED=true` (config-level rejection — сервер не стартует
  при отсутствии ключа, fail-fast подход)

**Verification:**
- [ ] `node --test tests/queue-monitor/config.test.js` — тесты проходят
- [ ] `npm test` — без регрессий

**Dependencies:** None

**Files likely touched:**
- `src/queue-monitor/config.js` (новый)
- `tests/queue-monitor/config.test.js` (новый)

**Estimated scope:** S (2 файла)

---

### Task 2: DB Reader — readonly SQLite replica

**Status:** To Do

**Description:** Создать `src/queue-monitor/db/reader.js` — readonly
SQLite replica для чтения `delivery_queue`. Использует `better-sqlite3`
с `readonly: true`. Предоставляет функции для агрегации метрик:
`summary()`, `timeseries(window)`, `topSource(limit)`, `topRecipient(limit)`,
`errors(limit)`.

**Acceptance criteria:**
- [ ] `createDbReader({ dbPath, logger })` — factory function
- [ ] `reader.summary()` → `{ pending, processing, delivered, failed }` (GROUP BY status)
- [ ] `reader.timeseries(windowSeconds)` → `[{ status, count, bucket }]` (GROUP BY status + time bucket)
- [ ] `reader.topSource(limit)` → `[{ source, count }]` (GROUP BY source, ORDER BY count DESC)
- [ ] `reader.topRecipient(limit)` → `[{ recipient, count }]` (парсит JSON из `payload`, GROUP BY recipient)
- [ ] `reader.errors(limit)` → `[{ id, source, payload, attempts, created_at, updated_at }]` (WHERE status='failed', ORDER BY updated_at DESC)
- [ ] `reader.ready()` → `boolean` (проверяет доступность БД через simple query)
- [ ] `reader.close()` — закрывает readonly connection
- [ ] Readonly: `better-sqlite3` с `readonly: true`, journal_mode=WAL
- [ ] Все queries используют prepared statements (без string interpolation)

**Verification:**
- [ ] `node --test tests/queue-monitor/db-reader.test.js` — тесты проходят
- [ ] Тесты используют `:memory:` SQLite для изоляции
- [ ] `npm test` — без регрессий

**Dependencies:** Task 1

**Files likely touched:**
- `src/queue-monitor/db/reader.js` (новый)
- `tests/queue-monitor/db-reader.test.js` (новый)

**Estimated scope:** M (2 файла, ~15 SQL queries)

---

### Task 3: HTTP Server — stdlib http.createServer

**Status:** To Do

**Description:** Создать `src/queue-monitor/http-server.js` — HTTP-сервер
на stdlib `http.createServer` (ADR-0023). Паттерн идентичен
`ingress/http-server.js`: factory function, `start()`/`stop()`,
routing через `if/else` (без frameworks).

**Acceptance criteria:**
- [ ] `createMonitorHttpServer(options)` — factory function
- [ ] `options.port` (default 9000), `options.metricsAuth`, `options.metricsRoutes`, `options.readyzRoute`, `options.logger`
- [ ] `GET /api/metrics/*` → `metricsAuth.authenticate(req)` → `metricsRoutes[endpoint](req, res)`
- [ ] `GET /readyz` → `readyzRoute(req, res)`
- [ ] Все остальные маршруты → 404
- [ ] `start()` → Promise (resolves when listening)
- [ ] `stop()` → Promise (resolves when closed)
- [ ] Access log: `formatLogLine` с `MODULE_NAME = 'queue-monitor-http'`
- [ ] Error handling: 500 при необработанных исключениях
- [ ] CORS headers для `/api/metrics/*` (опционально, для browser-based tools)

**Verification:**
- [ ] `node --test tests/queue-monitor/http-server.test.js` — тесты проходят
- [ ] Тесты используют реальный `http.createServer` с порт-счетчиком
- [ ] `npm test` — без регрессий

**Dependencies:** Task 1

**Files likely touched:**
- `src/queue-monitor/http-server.js` (новый)
- `tests/queue-monitor/http-server.test.js` (новый)

**Estimated scope:** S (2 файла)

---

### Task 4: Bearer Token Auth

**Status:** To Do

**Description:** Создать `src/queue-monitor/api/auth.js` — модуль
аутентификации Bearer Token для `/api/metrics/*`. Статический токен
через ENV `METRICS_API_KEY`.

**Acceptance criteria:**
- [ ] `createBearerAuth({ apiKey, logger })` — factory function
- [ ] `auth.authenticate(req)` → `{ authenticated: true }` или `{ authenticated: false, error }`
- [ ] Извлекает токен из `Authorization: Bearer xxx` header
- [ ] Сравнивает с `apiKey` через `crypto.timingSafeEqual` (timing-safe)
- [ ] Если `apiKey` пустой → все запросы отклоняются (503)
- [ ] Логирует попытки аутентификации (успешные и неуспешные)
- [ ] Не логирует сам токен (redaction)

**Verification:**
- [ ] `node --test tests/queue-monitor/api-auth.test.js` — тесты проходят
- [ ] Тесты проверяют timing-safe comparison
- [ ] `npm test` — без регрессий

**Dependencies:** None

**Files likely touched:**
- `src/queue-monitor/api/auth.js` (новый)
- `tests/queue-monitor/api-auth.test.js` (новый)

**Estimated scope:** S (2 файла)

---

### Task 5: Metrics Endpoints (summary, timeseries, top, errors, discovery)

**Status:** To Do

**Description:** Создать `src/queue-monitor/api/metrics.js` — обработчики
для 5 metrics-эндпоинтов. Каждый эндпоинт вызывает соответствующий
метод DB reader и возвращает JSON.

**Acceptance criteria:**
- [ ] `createMetricsRoutes({ reader })` → `{ summary, timeseries, top, errors, discovery }`
- [ ] `GET /api/metrics/summary` → `{ pending, processing, delivered, failed, total, timestamp }`
- [ ] `GET /api/metrics/timeseries?window=1h` → `{ data: [{ status, count, bucket }] }`
  - Window parsing: `1h` = 3600s, `6h` = 21600s, `12h` = 43200s, `24h` = 86400s
  - Default: `1h`
- [ ] `GET /api/metrics/top?by=source&limit=5` → `{ data: [{ source, count }] }` или `{ data: [{ recipient, count }] }`
  - `by` param: `source` (default) или `recipient`
  - `limit` param: 1–100, default 5
- [ ] `GET /api/metrics/errors?limit=20` → `{ data: [{ id, req_id, source, payload, attempts, created_at, updated_at }] }`
  - `limit` param: 1–100, default 20
  - `req_id` включён для корреляции с audit trail (ADR-0029)
- [ ] `GET /api/metrics/discovery` → Zabbix LLD format: `{ data: [{ "{#METRIC}": "delivered", "{#LABEL}": "Доставлено" }, ...] }`
- [ ] Все ответы: `Content-Type: application/json`
- [ ] Ошибки валидации параметров → 400 с `{ error: "..." }`
- [ ] Reader errors → 500 с `{ error: "Internal server error" }`

**Verification:**
- [ ] `node --test tests/queue-monitor/api-metrics.test.js` — тесты проходят
- [ ] Тесты проверяют все 5 эндпоинтов + edge cases (невалидные params)
- [ ] `npm test` — без регрессий

**Dependencies:** Task 2, Task 4

**Files likely touched:**
- `src/queue-monitor/api/metrics.js` (новый)
- `tests/queue-monitor/api-metrics.test.js` (новый)

**Estimated scope:** M (2 файла, 5 endpoints)

---

### Task 6: Readiness Endpoint

**Status:** To Do

**Description:** Создать `src/queue-monitor/api/readyz.js` — readiness
check endpoint для systemd. Возвращает `200` если readonly replica
доступен, `503` если нет.

**Acceptance criteria:**
- [ ] `createReadyzRoute({ reader })` → function(req, res)
- [ ] `GET /readyz` → `200` с `{ status: "ok", db: "ready" }` если `reader.ready()` true
- [ ] `GET /readyz` → `503` с `{ status: "error", db: "unavailable" }` если `reader.ready()` false
- [ ] Без auth (открыт для systemd ExecStartPost)
- [ ] Ответ за <100ms (readiness check не должен быть тяжелым)

**Verification:**
- [ ] `node --test tests/queue-monitor/api-readyz.test.js` — тесты проходят
- [ ] `npm test` — без регрессий

**Dependencies:** Task 2

**Files likely touched:**
- `src/queue-monitor/api/readyz.js` (новый)
- `tests/queue-monitor/api-readyz.test.js` (новый)

**Estimated scope:** XS (2 файла)

---

### Task 7: App Integration + Shutdown

**Status:** To Do

**Description:** Создать `src/queue-monitor/index.js` — facade модуля.
Интегрировать queue-monitor в `app.js`: добавить в `stopHandles`,
передать `queueStore.dbPath` в reader, запустить HTTP-сервер.

**Acceptance criteria:**
- [ ] `createQueueMonitor(options)` → `{ start, stop }` (patтерн ingress)
- [ ] `start()` открывает readonly DB replica, запускает HTTP-сервер
- [ ] `stop()` закрывает HTTP-сервер и readonly DB connection
- [ ] В `app.js`: queue-monitor добавляется в `stopHandles` после `queue-store`
- [ ] Порядок остановки: worker → ingress → queue-store → queue-monitor
  (ADR-0033: reader закрывается последним, т.к. зависит от WAL writer;
  после закрытия queue-store reader теряет доступ к БД)
- [ ] Если `MONITOR_ENABLED=false` — queue-monitor не создаётся
- [ ] `dbPath` передаётся из config (shared с bot-platform)
- [ ] Тесты shutdown ordering обновлены

**Verification:**
- [ ] `node --test tests/bot-platform/app-shutdown.test.js` — тесты проходят
- [ ] `npm test` — без регрессий

**Dependencies:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6

**Files likely touched:**
- `src/queue-monitor/index.js` (новый)
- `src/bot-platform/app.js` (редактирование)
- `tests/bot-platform/app-shutdown.test.js` (редактирование)

**Estimated scope:** M (3 файла)

---

### Task 8: ADR-0015 policy test — verify better-sqlite3

**Status:** To Do

**Description:** Проверить, что policy test `repo-structure.test.js`
совместим с текущим allowed set. Sprint 20 использует только
`better-sqlite3` (readonly replica) — это уже в allowed set (ADR-0025).
Новых root dependencies НЕ добавляется.

`openid-client` добавляется в root `package.json` в Sprint 21 (Task 2:
OIDC Client) — он нужен для auth layer, который реализуется во втором спринте.

**Acceptance criteria:**
- [ ] `repo-structure.test.js`: allowed set уже содержит `better-sqlite3` (проверить)
- [ ] `npm test` — policy test проходит без изменений
- [ ] Root `package.json` dependencies: только `better-sqlite3` + `@okta/jwt-verifier` (Sprint 20)
- [ ] `openid-client` добавляется в Sprint 21, не в Sprint 20

**Verification:**
- [ ] `npm test` — все 353+ тестов проходят
- [ ] `node -e "console.log(Object.keys(require('./package.json').dependencies))"` — только `better-sqlite3` + `@okta/jwt-verifier`

**Dependencies:** None

**Files likely touched:**
- `tests/repo-structure.test.js` (проверка, без изменений)

**Estimated scope:** XS (0-1 файл)

---

## Checkpoint: Sprint 20

- [ ] `npm test` passes (353+ tests)
- [ ] `MONITOR_ENABLED=true METRICS_API_KEY=test node src/bot-platform/app.js` — queue-monitor стартует на порту 9000
- [ ] `GET /api/metrics/summary` returns JSON with Bearer Token
- [ ] `GET /readyz` returns 200/503
- [ ] Shutdown: `SIGTERM` → worker → ingress → queue-store → queue-monitor (логи)
- [ ] Shutdown integration works (queue-monitor в stopHandles)
- [ ] Все файлы в `src/queue-monitor/` имеют SPDX header
- [ ] Review перед мержем

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `better-sqlite3` readonly + WAL contention | Medium | WAL concurrent reads proven with ingress; reader doesn't write |
| Bearer Token static (no rotation) | Low | Read-only metrics, low-risk, documented ADR-0034 |
| Two HTTP servers in one process | Low | Stdlib pattern proven with ingress (8443) |
| Timing-safe comparison overhead | Low | `crypto.timingSafeEqual` is fast for short tokens |
| `topRecipient` JSON parsing performance | Low | SQLite `json_extract()` or JS-side parsing; 58k msg/мес is small |

## Не входит в спринт

- **Frontend UI** — Sprint 21
- **OAuth2/OIDC auth** — Sprint 21
- **systemd unit файл** — обновление при деплое
- **Zabbix template** — настройка на стороне Zabbix
- **Performance optimization** — SQLite sufficient для 58k msg/мес
- **ADR-0029 audit trail integration** — audit/trace данные не отображаются
  на dashboard в MVP; оператор использует `req_id` из errors endpoint
  для ручной корреляции через `grep` в логах
