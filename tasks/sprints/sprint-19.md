# Sprint 19: Crash recovery для delivery pipeline

## Outcome

Устранить три связанных пробела в crash-resilience delivery pipeline,
выявленных code review репозитория (2026-07-21). Все три нарушают
at-least-once гарантию ADR-0028 или наблюдаемость ADR-0029. Один ADR
(ADR-0033), один PR, четыре коммита.

Контекст: ADR-0028 принят (2026-07-17), обещает «Сообщение гарантированно
доставляется» и «SQLite persistence гарантирует delivery после restart».
Code review показало, что при crash процесса или poisoning long-polling
эти обещания не выполняются.

340 тестов passing на старте спринта. Цель — 353+ после фиксов.

## Architecture Decisions

- **ADR-0033:** Crash recovery для delivery pipeline — один ADR на три
  связанных фикса (reclaim stale processing + poison-loop prevention +
  coordinated shutdown), т.к. они составляют единое resilience-свойство.
- **Reclaim без инкремента attempts:** crash-recovery ≠ failed-delivery;
  at-least-once уже допускает дубли (ADR-0028).
- **TTL 300с:** 3× запас от MAX API timeout (90с) + rate-limiter wait (5с).
- **Skip+log для poison-message:** минимум кода для MVP; per-update retry
  counter — overkill.
- **`process.exit(0)` в signal handler:** HTTP listen-сокет иначе удерживает
  event loop. In-flight send abort приемлем (at-least-once + reclaim).

## Tasks

### Task 1: BUG A — reclaim stale processing-строк после crash

**Status:** Done

**Description:** При падении процесса между `dequeue` и `ack`/`nack` строка
оставалась в `status='processing'` навсегда — сообщение терялось.

**Acceptance criteria:**
- [x] Миграция `ALTER TABLE delivery_queue ADD COLUMN processing_since INTEGER` (idempotent)
- [x] `updateStatusProcessing` и `dequeue` выставляют `processing_since = now`
- [x] `reclaimStale(now)` возвращает строки с `processing_since <= now - ttl` в `pending`
- [x] Reclaim НЕ инкрементирует `attempts`
- [x] `dequeue` перед `selectPending` вызывает `reclaimStale`
- [x] `NULL processing_since` трактуется как stale (legacy строки до миграции)
- [x] `nackPending` сбрасывает `processing_since` в NULL
- [x] Конфиг `QUEUE_PROCESSING_TTL_SECONDS` (default 300, range 30–3600)
- [x] 4 новых теста reclaim-семантики проходят

**Verification:**
- [x] `node --test tests/bot-platform/queue-store.test.js` — 19/19 pass
- [x] `npm test` — без регрессий

**Files touched:**
- `src/bot-platform/queue/store.js`
- `src/bot-platform/core/config.js`
- `src/bot-platform/app.js`
- `tests/bot-platform/queue-store.test.js`

**Estimated scope:** M (4 файла, 4 теста)

---

### Task 2: BUG B — skip failed update в long-polling (poison-loop prevention)

**Status:** Done

**Description:** Если одно `processUpdate` выбрасывало, `onCycleSuccess`
(ack marker) пропускался, и long-polling бесконечно переопрашивал тот же
batch — poison-message loop.

**Acceptance criteria:**
- [x] Per-update try/catch в `tick()`: сбойное update логируется на error
- [x] Цикл продолжается для остальных update
- [x] `onCycleSuccess` вызывается ВСЕГДА (даже при сбое одного update)
- [x] Первая ошибка пробрасывается в `loop()` для recovery-лога
- [x] Новый тест на poison-loop prevention проходит
- [x] Обновлён live-service тест, кодировавший старое багованное поведение

**Verification:**
- [x] `node --test tests/bot-platform/long-polling-runtime.test.js` — 5/5 pass
- [x] `node --test tests/bot-platform/live-service.test.js` — pass
- [x] `npm test` — без регрессий

**Files touched:**
- `src/bot-platform/runtime/long-polling.js`
- `tests/bot-platform/long-polling-runtime.test.js`
- `tests/bot-platform/live-service.test.js`

**Estimated scope:** S (3 файла, 2 теста)

---

### Task 3: BUG C — coordinated graceful shutdown

**Status:** Done

**Description:** Signal handler вызывал только `liveService.stop()`.
Queue worker, SQLite connection и ingress HTTP server не закрывались.
HTTP listen-сокет удерживал event loop → процесс висел до SIGKILL.

**Acceptance criteria:**
- [x] `startIngressAndQueue` возвращает shutdown handle `{ stop }`
- [x] Handle вызывает stop() в порядке worker → ingress → queue-store
- [x] Ошибки логируются, не прерывая остальные shutdown-шаги
- [x] `liveService.stop()` стал async, вызывает `shutdownHandle.stop()`
- [x] `createLiveServiceShutdownHandlers` вызывает `await liveService.stop()` → `exitFn(0)`
- [x] `exitFn` инжектируется для тестируемости (default: `process.exit`)
- [x] 6 новых тестов в `app-shutdown.test.js` проходят

**Verification:**
- [x] `node --test tests/bot-platform/app-shutdown.test.js` — 6/6 pass
- [x] `npm test` — без регрессий

**Files touched:**
- `src/bot-platform/app.js`
- `src/bot-platform/runtime/live-service.js`
- `tests/bot-platform/app-shutdown.test.js` (новый)

**Estimated scope:** M (3 файла, 6 тестов)

---

### Task 4: ADR-0033 + документация

**Status:** Done

**Description:** Зафиксировать архитектурное решение для трёх фиксов,
обновить ADR-0028 cross-link, описать sprint.

**Acceptance criteria:**
- [x] `docs/decisions/ADR-0033-delivery-pipeline-crash-recovery.md` создан
- [x] ADR-0033 добавлен в `docs/decisions/README.md` индекс
- [x] ADR-0028 cross-link на ADR-0033 в разделе «Статусы»
- [x] `tasks/sprints/sprint-19.md` создан (этот файл)

**Verification:**
- [x] `npm test` — policy-тест `tests/repo-structure.test.js` проходит
- [x] ADR-0033 ссылается на ADR-0028 и ADR-0009

**Files touched:**
- `docs/decisions/ADR-0033-delivery-pipeline-crash-recovery.md` (новый)
- `docs/decisions/README.md`
- `docs/decisions/ADR-0028-introduce-delivery-queue.md`
- `tasks/sprints/sprint-19.md` (новый)

**Estimated scope:** S (4 файла документации)

---

## Итог

- 4 коммита на ветке `fix/delivery-pipeline-crash-recovery`:
  - `fix(queue): reclaim stale processing rows after process crash (BUG A, ADR-0028)`
  - `fix(long-polling): skip failed update instead of blocking batch (BUG B)`
  - `fix(app): coordinated graceful shutdown for worker/queue/ingress (BUG C)`
  - `docs: ADR-0033 + sprint-19 + ADR-0028 cross-link`
- 353 теста passing (+13 от старта спринта).
- Новых внешних зависимостей нет (ADR-0015 соблюдён).
- Обратная совместимость сохранена (default TTL не меняет normal operation).
