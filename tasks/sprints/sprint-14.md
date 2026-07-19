# Sprint 14: Queue Infrastructure (ADR-0025 + ADR-0028)

## Outcome

Построить инфраструктуру очереди доставки сообщений: SQLite store с enqueue/dequeue/ack/nack, worker с retry и exponential backoff, интеграция с live-pipeline через conditional enqueue. По ADR-0025 (better-sqlite3) и ADR-0028 (delivery queue).

Контекст: текущий outbound-client делает fire-and-forget (`httpClient.post(request)`). При недоступности MAX Bot API сообщение теряется. Очередь гарантирует at-least-once доставку.

## Tasks

### Task 1: Add `better-sqlite3` dependency

**Status:** Planned

**Description:** Добавить `better-sqlite3` в `package.json` как runtime dependency. Проверить совместимость с Node 22.

**Acceptance criteria:**
- [ ] `package.json` содержит `"dependencies": { "better-sqlite3": "^x.x" }`
- [ ] `npm install` завершается без ошибок
- [ ] `npm audit` не показывает критических уязвимостей

**Verification:**
- [ ] `npm test` passes (существующие тесты не сломаны)

**Dependencies:** None

**Files likely touched:**
- `package.json`

**Estimated scope:** XS (1 file)

### Task 2: Add queue env vars to `src/bot-platform/core/config.js`

**Status:** Planned

**Description:** Расширить `createBotPlatformConfig()` новыми переменными окружения для очереди: `QUEUE_ENABLED`, `QUEUE_MAX_ATTEMPTS`, `QUEUE_INTERVAL_MS`, `QUEUE_BATCH_SIZE`, `QUEUE_BACKOFF_BASE`, `QUEUE_BACKOFF_MAX`. Значения по умолчанию из ADR-0028. `QUEUE_ENABLED=false` по умолчанию (backward compatible).

**Acceptance criteria:**
- [ ] `createBotPlatformConfig({ QUEUE_ENABLED: 'true' })` возвращает `queueEnabled: true`
- [ ] `createBotPlatformConfig({})` возвращает `queueEnabled: false` (default)
- [ ] `queueMaxAttempts` по умолчанию = 5
- [ ] `queueIntervalMs` по умолчанию = 5000
- [ ] `queueBatchSize` по умолчанию = 10

**Verification:**
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/core/config.js`

**Estimated scope:** S (1 file)

### Task 3: Create `src/bot-platform/queue/store.js`

**Status:** Planned

**Description:** SQLite-based queue store. Фабрика `createQueueStore(options = {})` принимает `{ dbPath }` (путь к SQLite файлу). Создаёт таблицу `delivery_queue` при инициализации (schema из ADR-0028). Экспортирует методы: `enqueue(entry)`, `dequeue(batchSize)`, `ack(id)`, `nack(id, attempts, maxAttempts)`, `stats()`. Все операции синхронные (better-sqlite3 API).

**Acceptance criteria:**
- [ ] `createQueueStore({ dbPath: ':memory:' })` создаёт store без ошибок
- [ ] `enqueue({ payload: {...}, source: 'zabbix' })` возвращает `{ id }` (autoincrement)
- [ ] `dequeue(10)` возвращает массив pending записей, помечает их как `processing`
- [ ] `ack(id)` устанавливает `status='delivered'`
- [ ] `nack(id, 1, 5)` устанавливает `status='pending'` + `next_retry_at` (exponential backoff)
- [ ] `nack(id, 5, 5)` устанавливает `status='failed'` (max attempts reached)
- [ ] `stats()` возвращает `{ pending: N, processing: N, delivered: N, failed: N }`
- [ ] `dequeue()` пропускает записи с `next_retry_at > Date.now()/1000`
- [ ] Таблица `delivery_queue` создаётся автоматически при первом обращении

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 1

**Files likely touched:**
- `src/bot-platform/queue/store.js` (new)

**Estimated scope:** M (1 file, complex logic)

### Task 4: Create `tests/bot-platform/queue-store.test.js`

**Status:** Planned

**Description:** Unit tests для queue store: enqueue, dequeue, ack, nack (success + max attempts), stats, retry timing. Использовать in-memory SQLite (`:memory:`).

**Acceptance criteria:**
- [ ] Тест: enqueue создаёт запись с `status='pending'`
- [ ] Тест: dequeue возвращает pending записи и помечает как processing
- [ ] Тест: ack устанавливает `status='delivered'`
- [ ] Тест: nack с attempts < max устанавливает `status='pending'` + `next_retry_at > now`
- [ ] Тест: nack с attempts >= max устанавливает `status='failed'`
- [ ] Тест: stats возвращает правильные counts
- [ ] Тест: dequeue пропускает записи с `next_retry_at` в будущем
- [ ] Тест: enqueue с idempotency_key предотвращает дубли (опционально)

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 3

**Files likely touched:**
- `tests/bot-platform/queue-store.test.js` (new)

**Estimated scope:** M (1 file, 8+ tests)

### Task 5: Create `src/bot-platform/queue/worker.js`

**Status:** Planned

**Description:** Queue worker — `setInterval` polling loop. Фабрика `createQueueWorker(options = {})` принимает `{ queueStore, outboundClient, batchSize, intervalMs, logger }`. Экспортирует `start()`, `stop()`, `poll()` (отдельно для тестирования). `poll()`: dequeue → send → ack/nack. Exponential backoff при nack. Логирование каждого результата.

**Acceptance criteria:**
- [ ] `createQueueWorker({})` возвращает объект с `start()`, `stop()`, `poll()`
- [ ] `poll()` вызывает `queueStore.dequeue(batchSize)` 
- [ ] Для каждой записи: `outboundClient.send(payload)` → `ack(id)` при успехе
- [ ] При ошибке отправки: `nack(id, attempts+1, maxAttempts)`
- [ ] `start()` запускает `setInterval(poll, intervalMs)`
- [ ] `stop()` очищает интервал
- [ ] Worker не падает при ошибке отправки (продолжает работу)

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 3

**Files likely touched:**
- `src/bot-platform/queue/worker.js` (new)

**Estimated scope:** M (1 file)

### Task 6: Create `tests/bot-platform/queue-worker.test.js`

**Status:** Planned

**Description:** Unit tests для queue worker: poll обрабатывает очередь, ack/nack вызываются правильно, start/stop работают, ошибки не крашат worker.

**Acceptance criteria:**
- [ ] Тест: poll() dequeues и отправляет через outboundClient
- [ ] Тест: успешная отправка → ack(id)
- [ ] Тест: ошибка отправки → nack(id, attempts+1, maxAttempts)
- [ ] Тест: start() запускает interval
- [ ] Тест: stop() останавливает interval
- [ ] Тест: worker продолжает после ошибки отправки

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 5

**Files likely touched:**
- `tests/bot-platform/queue-worker.test.js` (new)

**Estimated scope:** M (1 file, 6+ tests)

### Task 7: Add conditional enqueue to `src/bot-platform/core/live-pipeline.js`

**Status:** Planned

**Description:** Расширить `createIdentityUpdateProcessor()` для поддержки очереди. Если `queueStore` передан через options И `queueEnabled=true`: вызывать `queueStore.enqueue()` вместо `outboundClient.send()`. Если `queueStore` не передан или `queueEnabled=false`: существующее поведение (fire-and-forget). Обратная совместимость обязательна.

**Acceptance criteria:**
- [ ] Существующие тесты live-pipeline продолжают работать (queue не включена)
- [ ] При `queueEnabled: true` и `queueStore`: вызывается `queueStore.enqueue()` вместо `outboundClient.send()`
- [ ] При `queueEnabled: false`: вызывается `outboundClient.send()` (без изменений)
- [ ] При `queueStore: undefined`: вызывается `outboundClient.send()` (без изменений)

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 3

**Files likely touched:**
- `src/bot-platform/core/live-pipeline.js`

**Estimated scope:** S (1 file, conditional branch)

### Task 8: Create `tests/bot-platform/queue-pipeline-integration.test.js`

**Status:** Planned

**Description:** Интеграционные тесты: live-pipeline с queue enabled, live-pipeline с queue disabled (backward compat), dry-run pipeline без очереди.

**Acceptance criteria:**
- [ ] Тест: live-pipeline + queue enabled → enqueue вызван, send не вызван
- [ ] Тест: live-pipeline + queue disabled → send вызван, enqueue не вызван
- [ ] Тест: live-pipeline + no queueStore → send вызван
- [ ] Тест: dry-run pipeline → send вызван (очередь не используется в dry-run)

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 7

**Files likely touched:**
- `tests/bot-platform/queue-pipeline-integration.test.js` (new)

**Estimated scope:** S (1 file, 4 tests)

## Checkpoint: After Tasks 1-2 (Foundation)

- [ ] `better-sqlite3` установлен
- [ ] Queue env vars добавлены в config
- [ ] `npm test` passes (существующие тесты не сломаны)

## Checkpoint: After Tasks 3-4 (Queue Store)

- [ ] `queue/store.js` создан и работает
- [ ] `queue-store.test.js` — все тесты проходят
- [ ] SQLite schema создаётся автоматически

## Checkpoint: After Tasks 5-6 (Queue Worker)

- [ ] `queue/worker.js` создан и работает
- [ ] `queue-worker.test.js` — все тесты проходят
- [ ] Retry + exponential backoff работают

## Checkpoint: After Tasks 7-8 (Pipeline Integration)

- [ ] Live-pipeline поддерживает conditional enqueue
- [ ] Интеграционные тесты проходят
- [ ] Backward compatibility сохранена (QUEUE_ENABLED=false)
- [ ] `npm test` passes (все тесты)
