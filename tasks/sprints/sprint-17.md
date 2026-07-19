# Sprint 17: Lifecycle Audit Trail (ADR-0029)

## Outcome

Внедрить двуслойное журналирование (audit trail + lifecycle trace) в bot-platform pipeline. Каждое входящее HTTP-запрос получает `reqId` (crypto.randomUUID()), который прокидывается через auth → normalize → queue → outbound. Audit-записи — для быстрого grep, trace-записи — для полной трассировки по reqId.

Контекст: ADR-0029 принят (2026-07-18). Live run подтвердил доставку, но промежуточные этапы не логируются. Текущий pipeline: 8 log calls на 1126 строк кода в 5 модулях.

## Architecture Decisions

- **Формат через helper, не через рефакторинг logger**: добавить `formatLogLine()` в `logger.js`, модули вызывают его для stdout-строки. Внутренний API `createSafeLogger` не меняется — минимум disruption.
- **reqId в payload + столбце**: dual storage — payload для передачи между компонентами, `req_id` столбец для SQL-запросов.
- **Nullable req_id**: обратная совместимость с существующими записями в queue.
- **Флаги LOG_AUDIT / LOG_TRACE**: управление на уровне вызова, не на уровне logger. Если флаг выключен — соответствующие log-вызовы пропускаются.

## Tasks

### Task 1: Config — add `LOG_AUDIT`, `LOG_TRACE` env vars

**Status:** Planned

**Description:** Расширить `createBotPlatformConfig()` двумя новыми boolean переменными: `LOG_AUDIT` и `LOG_TRACE`. Использовать существующий `readBoolEnvValue`. Дефолт: `true` (ADR-0029 specifies enabled by default).

**Acceptance criteria:**
- [ ] `createBotPlatformConfig({ LOG_AUDIT: 'true', LOG_TRACE: 'true' })` → `logAudit: true`, `logTrace: true`
- [ ] `createBotPlatformConfig({})` → `logAudit: true`, `logTrace: true` (default)
- [ ] `createBotPlatformConfig({ LOG_AUDIT: 'false' })` → `logAudit: false`

**Verification:**
- [ ] `npm test` passes (config.test.js)

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/core/config.js`
- `tests/bot-platform/config.test.js`

**Estimated scope:** S (1 file + 1 test file)

### Task 2: Logger — add `formatLogLine()` helper

**Status:** Planned

**Description:** Добавить в `src/bot-platform/core/logger.js` функцию `formatLogLine({ ts, level, module, reqId, action, context })`, которая возвращает строку формата ADR-0029: `[<ISO-timestamp>] [<level>] [<module>:<reqId>] <action> {<json-context>}`. Если `reqId` не передан — формат `[<module>]`. Если `context` пуст — без JSON-хвоста. Экспортировать функцию.

**Acceptance criteria:**
- [ ] `formatLogLine({ ts: '2026-07-18T04:58:06.123Z', level: 'info', module: 'ingress', reqId: 'abc123', action: 'auth success', context: { sub: 'zabbix' } })` → `[2026-07-18T04:58:06.123Z] [info] [ingress:abc123] auth success {"sub":"zabbix"}`
- [ ] `formatLogLine({ ts, level, module: 'worker', action: 'delivered', context: { id: 13 } })` → `[ts] [info] [worker] delivered {"id":13}`
- [ ] `formatLogLine({ ts, level, module: 'ingress', reqId: 'abc', action: 'ingress', context: null })` → `[ts] [info] [ingress:abc] ingress`
- [ ] Функция экспортируется из модуля

**Verification:**
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/core/logger.js`

**Estimated scope:** S (1 file)

### Task 3: Schema — add `req_id` column + index

**Status:** Planned

**Description:** В `src/bot-platform/queue/store.js` добавить миграцию: при старте `createQueueStore` выполнять `ALTER TABLE delivery_queue ADD COLUMN req_id TEXT` (с try/catch — если столбец уже есть) и `CREATE INDEX IF NOT EXISTS idx_queue_req_id ON delivery_queue(req_id)`. Обновить INSERT/SELECT запросы для поддержки `req_id`. Принимать `reqId` в `enqueue(entry)`, возвращать в `dequeue()`.

**Acceptance criteria:**
- [ ] `createQueueStore()` создаёт таблицу с `req_id` столбцем (или мигрирует существующую)
- [ ] `enqueue({ payload, source, reqId: 'abc' })` → запись с `req_id = 'abc'`
- [ ] `dequeue()` возвращает объекты с `reqId` полем
- [ ] `enqueue({ payload, source })` → `req_id = NULL` (backward compat)
- [ ] Существующие тесты queue-store проходят

**Verification:**
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/queue/store.js`
- `tests/bot-platform/queue-store.test.js`

**Estimated scope:** M (1 file, schema + queries)

### Task 4: http-server.js — generate reqId + trace/audit logs

**Status:** Planned

**Description:** В `handleIngest`: (1) генерировать `reqId = crypto.randomUUID()` в начале; (2) trace-log `ingress` с method, path, from (IP); (3) передавать `reqId` в `jwtAuth.authenticate(header, { reqId, ip })`; (4) trace-log `normalized` с recipient; (5) передавать `reqId` в `queueStore.enqueue({ ...entry, reqId })`; (6) audit-log `message queued`. Использовать `formatLogLine()` для вывода. Проверять `LOG_AUDIT` / `LOG_TRACE` флаги из config перед логированием.

**Acceptance criteria:**
- [ ] `POST /ingest` логирует `[trace:req:<uuid>] ingress POST /ingest from <ip>`
- [ ] JWT auth success → `[audit] auth success sub=... source=... ip=...`
- [ ] Normalize → `[trace:req:<uuid>] normalized recipient=user:123`
- [ ] Enqueue → `[audit] message queued id=<n> source=... recipient=...`
- [ ] При `LOG_AUDIT=false` audit-логи не выводятся
- [ ] При `LOG_TRACE=false` trace-логи не выводятся
- [ ] `reqId` добавляется в queue payload

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 1, 2, 3

**Files likely touched:**
- `src/bot-platform/ingress/http-server.js`
- `tests/bot-platform/ingress-http-server.test.js`

**Estimated scope:** M (1 file + tests)

### Task 5: jwt-source-auth.js — add audit log

**Status:** Planned

**Description:** Расширить `authenticate(authorizationHeader)` → `authenticate(authorizationHeader, options = {})` для接受 `{ reqId, ip }`. Добавить audit-логи: (1) auth success — `[audit] auth success sub=... source=... ip=...`; (2) auth failed — `[audit] auth failed reason=... ip=...`. Использовать `formatLogLine()`. IP не верифицируется (приходит из http-server).

**Acceptance criteria:**
- [ ] `authenticate(header, { reqId, ip })` → audit-лог success с sub, source, ip
- [ ] `authenticate(null, { reqId, ip })` → audit-лог failed с reason, ip
- [ ] `authenticate(header)` (без options) → работает без audit (backward compat)
- [ ] Ошибки не содержат raw token

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 2

**Files likely touched:**
- `src/bot-platform/ingress/jwt-source-auth.js`
- `tests/bot-platform/jwt-source-auth.test.js`

**Estimated scope:** S (1 file + tests)

### Task 6: Tests for ingress audit/trace

**Status:** Planned

**Description:** Расширить `ingress-http-server.test.js` и `ingress-e2e.test.js` тестами для audit/trace: (1) mock logger проверяет что `formatLogLine` вызывается с правильными параметрами; (2) `reqId` присутствует в queue payload; (3) audit-логи вызываются при auth success/fail; (4) trace-логи вызываются на каждом этапе.

**Acceptance criteria:**
- [ ] Тест: `POST /ingest` → logger вызывается с `action: 'ingress'` и `reqId`
- [ ] Тест: auth success → logger вызывается с `action: 'auth success'`
- [ ] Тест: auth failure → logger вызывается с `action: 'auth failed'`
- [ ] Тест: `reqId` в enqueue payload
- [ ] `LOG_AUDIT=false` → audit-логи не вызываются

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 4, 5

**Files likely touched:**
- `tests/bot-platform/ingress-http-server.test.js`
- `tests/bot-platform/ingress-e2e.test.js`

**Estimated scope:** M (2 test files)

### Task 7: store.js — trace log for enqueue

**Status:** Planned

**Description:** В `queue/store.js` добавить trace-log при enqueue: `[trace:req:<reqId>] enqueued id=<rowId>`. Добавить dependency injection для `logger` через options. Log-вызов опционален (logger может отсутствовать).

**Acceptance criteria:**
- [ ] `enqueue({ payload, source, reqId })` → trace-лог `enqueued id=<n>`
- [ ] `enqueue({ payload, source })` → без trace-лога (нет reqId)
- [ ] Без logger в options → работает без ошибок

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 3

**Files likely touched:**
- `src/bot-platform/queue/store.js`
- `tests/bot-platform/queue-store.test.js`

**Estimated scope:** S (1 file + tests)

### Task 8: worker.js — trace/audit logs

**Status:** Planned

**Description:** В `queue/worker.js` добавить: (1) trace-log при dequeue: `[trace:queue:<id>] dequeued attempt=<n>`; (2) audit + trace при success: `[audit] message delivered id=<n> duration_ms=<ms>`, `[trace:queue:<id>] delivered duration_ms=<ms>`; (3) audit + trace при failure: `[audit] message failed id=<n> reason=... attempts=<n>`, `[trace:queue:<id>] failed reason=...`. Использовать `formatLogLine()`. Измерять duration с момента dequeue до ack/nack.

**Acceptance criteria:**
- [ ] Successful delivery → audit-лог `message delivered` с `duration_ms`
- [ ] Failed delivery → audit-лог `message failed` с `reason` и `attempts`
- [ ] Trace-лог `dequeued attempt=<n>` при dequeue
- [ ] Trace-лог `delivered` / `failed` после ack/nack
- [ ] `duration_ms` корректно измеряется

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 2

**Files likely touched:**
- `src/bot-platform/queue/worker.js`
- `tests/bot-platform/queue-worker.test.js`

**Estimated scope:** M (1 file + tests)

### Task 9: outbound-client.js — trace log

**Status:** Planned

**Description:** В `transports/max/outbound-client.js` добавить trace-log: (1) before request: `[trace:queue:<reqId>] outbound POST <url>`; (2) after response: добавить `statusCode` в context. Извлекать `reqId` из response/payload. Использовать `formatLogLine()`.

**Acceptance criteria:**
- [ ] `send(response)` с `reqId` в payload → trace-лог `outbound POST <url>`
- [ ] Response → trace-лог с `statusCode`
- [ ] Без `reqId` → работает без trace-лога

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 2

**Files likely touched:**
- `src/bot-platform/transports/max/outbound-client.js`
- `tests/bot-platform/max-outbound-client.test.js`

**Estimated scope:** S (1 file + tests)

### Task 10: Tests for queue + outbound audit/trace

**Status:** Planned

**Description:** Расширить `queue-worker.test.js`, `queue-store.test.js`, `max-outbound-client.test.js` тестами для audit/trace: (1) mock logger проверяет формат; (2) duration_ms измеряется; (3) reqId прокидывается через payload; (4) audit/trace вызываются при success/failure.

**Acceptance criteria:**
- [ ] Worker: mock logger проверяет `action: 'delivered'` и `duration_ms`
- [ ] Worker: mock logger проверяет `action: 'failed'` и `reason`
- [ ] Store: `reqId` сохраняется в `req_id` столбец
- [ ] Outbound: trace-лог вызывается с `statusCode`

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 7, 8, 9

**Files likely touched:**
- `tests/bot-platform/queue-worker.test.js`
- `tests/bot-platform/queue-store.test.js`
- `tests/bot-platform/max-outbound-client.test.js`

**Estimated scope:** M (3 test files)

### Task 11: End-to-end integration test

**Status:** Planned

**Description:** Полный end-to-end тест lifecycle trace: POST /ingest → auth → normalize → queue → dequeue → outbound → ack. Mock outboundClient. Проверить: (1) reqId генерируется и прокидывается через все этапы; (2) audit-логи вызываются на auth, queue, delivery; (3) trace-логи вызываются на ingress, jwt, normalize, enqueue, dequeue, outbound, delivered.

**Acceptance criteria:**
- [ ] reqId одинаковый на всех этапах (ingress → queue → outbound)
- [ ] Audit-логи: auth success, message queued, message delivered
- [ ] Trace-логи: ingress, jwt verified, normalized, enqueued, dequeued, outbound, delivered
- [ ] `LOG_AUDIT=false` → только trace-логи
- [ ] `LOG_TRACE=false` → только audit-логи

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 4-10

**Files likely touched:**
- `tests/bot-platform/ingress-e2e.test.js`

**Estimated scope:** M (1 test file)

### Task 12: Documentation

**Status:** Planned

**Description:** Обновить документацию: (1) `docs/project-context.md` — env vars `LOG_AUDIT`/`LOG_TRACE`, req_id в схеме; (2) `examples/bot-platform/env.example` — добавить `LOG_AUDIT` и `LOG_TRACE`; (3) ADR-0029 — добавить "Реализовано" секцию со ссылками на код.

**Acceptance criteria:**
- [ ] `docs/project-context.md` содержит `LOG_AUDIT` и `LOG_TRACE` в env vars
- [ ] `examples/bot-platform/env.example` содержит `LOG_AUDIT=true` и `LOG_TRACE=true`
- [ ] ADR-0029 отмечает реализованные модули
- [ ] Нет секретов и реальных идентификаторов

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 1-11

**Files likely touched:**
- `docs/project-context.md`
- `examples/bot-platform/env.example`
- `docs/decisions/ADR-0029-lifecycle-audit-trail.md`

**Estimated scope:** XS (3 files, docs only)

## Checkpoint: After Tasks 1-3 (Foundation)

- [ ] `npm test` passes
- [ ] Config возвращает `logAudit: true`, `logTrace: true`
- [ ] `formatLogLine()` produces correct ADR-0029 format
- [ ] `delivery_queue` таблица имеет `req_id` столбец

## Checkpoint: After Tasks 4-6 (Ingress)

- [ ] `POST /ingest` генерирует `reqId` и логирует ingress/jwt/normalize/enqueue
- [ ] Audit-логи: auth success/fail
- [ ] Trace-логи: ingress, jwt verified, normalized, enqueued
- [ ] Тесты проходят

## Checkpoint: After Tasks 7-10 (Queue + Outbound)

- [ ] `reqId` прокидывается через queue payload и `req_id` столбец
- [ ] Audit-логи: message queued/delivered/failed
- [ ] Trace-логи: dequeued/outbound/delivered/failed
- [ ] Тесты проходят

## Checkpoint: After Tasks 11-12 (Complete)

- [ ] Полный lifecycle trace от ingress до delivery
- [ ] `journalctl -u max-identity-bot-live | grep '\[audit\]'` работает
- [ ] `npm test` — все тесты проходят
- [ ] Документация обновлена
- [ ] Готово к ревью

## Post-sprint: MAX API Stress Test + Fixes (2026-07-18)

Стресс-тест выявил жёсткое ограничение MAX Bot API: **text field ≤ 4000 байт**. Ошибка: `{"code":"proto.payload","message":"Field 'text' size (N) must be at most 4000"}`.

### Исправления (в том же спринте)

| Что | Файл | Описание |
|-----|------|----------|
| Валидация длины text | `http-server.js` | Reject с HTTP 413 до enqueue если `text.length > 4000` |
| Логирование ошибок MAX API | `outbound-client.js` | `responseBody` из ответа MAX API прокидывается в error.details |
| Тесты | `ingress-http-server.test.js` | 3 новых теста: at-limit, over-limit, oversized-no-enqueue |
| Тесты | `max-outbound-client.test.js` | 1 новый тест: response body in validation error |
| Документация | `docs/zabbix-media-type.md` | Секция "Ограничения MAX Bot API" |

### Результат стресс-теста

| Размер text | ingress | MAX API |
|---|---|---|
| ≤ 4000 байт | ✅ queued | ✅ delivered |
| 4001 байт | ✅ queued | ❌ `proto.payload` (rejected) |
| 10KB+ | ✅ queued | ❌ `proto.payload` (rejected) |

297 тестов, 0 падений.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Logger format change breaks existing log consumers | Medium | formatLogLine is additive; existing emit() unchanged |
| req_id migration fails on existing DB | Low | ALTER TABLE ADD COLUMN is safe; column is nullable |
| Performance impact of randomUUID + 2 log calls per request | Low | randomUUID is ~microseconds; log writes are async |
| outbound-client.js shared-helpers createLogger only checks `info` | Low | Audit/trace use info level; error paths use logger.error directly |
