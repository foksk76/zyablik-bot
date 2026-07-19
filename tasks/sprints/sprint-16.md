# Sprint 16: App Wiring + Integration

## Outcome

Связать все компоненты в `app.js`: запуск HTTP-ingress сервера и queue worker как второй pipeline в одном процессе. Интеграционные тесты end-to-end. Обновить документацию.

Контекст: sprint-14 построил queue infrastructure, sprint-15 построил ingress pipeline. Теперь нужно собрать всё вместе в `app.js` и проверить что два pipeline работают в одном процессе (ADR-0009, ADR-0023).

## Tasks

### Task 1: Add ingress env vars to `src/bot-platform/core/config.js`

**Status:** Planned

**Description:** Расширить `createBotPlatformConfig()` переменными для ingress: `INGRESS_ENABLED`, `INGRESS_PORT`. Добавить валидацию: `INGRESS_PORT` обязателен при `INGRESS_ENABLED=true`.

**Acceptance criteria:**
- [ ] `createBotPlatformConfig({ INGRESS_ENABLED: 'true', INGRESS_PORT: '8443' })` возвращает `ingressEnabled: true`, `ingressPort: 8443`
- [ ] `createBotPlatformConfig({})` возвращает `ingressEnabled: false` (default)
- [ ] Валидация: `INGRESS_PORT` обязателен при `INGRESS_ENABLED=true`

**Verification:**
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/core/config.js`

**Estimated scope:** S (1 file)

### Task 2: Wire HTTP-ingress in `src/bot-platform/app.js`

**Status:** Planned

**Description:** Расширить `createBotPlatformApp()` для второго pipeline. Если `config.ingressEnabled`: создать `http-server` с `jwtAuth`, `normalizer`, `queueStore`, `outboundClient`. Запустить HTTP-сервер на `config.ingressPort`. Если `config.queueEnabled`: создать `queueWorker` и запустить `start()`. Оба pipeline в одном процессе `app.js`.

**Acceptance criteria:**
- [ ] `app.js` с `INGRESS_ENABLED=false` → только long-polling pipeline (существующее поведение)
- [ ] `app.js` с `INGRESS_ENABLED=true` → long-polling + HTTP-ingress pipelines
- [ ] `app.js` с `QUEUE_ENABLED=true` → queue worker запущен
- [ ] `app.js` с `QUEUE_ENABLED=false` → queue worker не запущен
- [ ] Оба pipeline делят один outbound-client (ADR-0023)

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Sprint 14 (queue), Sprint 15 (ingress)

**Files likely touched:**
- `src/bot-platform/app.js`

**Estimated scope:** M (1 file, wiring logic)

### Task 3: Create `tests/bot-platform/app-ingress-wiring.test.js`

**Status:** Planned

**Description:** Тесты wiring в app.js: проверить что ingress pipeline создаётся при `INGRESS_ENABLED=true`, queue worker запускается при `QUEUE_ENABLED=true`, оба pipeline не конфликтуют.

**Acceptance criteria:**
- [ ] Тест: `INGRESS_ENABLED=true` → http.createServer вызван
- [ ] Тест: `QUEUE_ENABLED=true` → queueWorker.start() вызван
- [ ] Тест: `INGRESS_ENABLED=false` → http.createServer не вызван
- [ ] Тест: `QUEUE_ENABLED=false` → queueWorker.start() не вызван

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 2

**Files likely touched:**
- `tests/bot-platform/app-ingress-wiring.test.js` (new)

**Estimated scope:** S (1 file, 4 tests)

### Task 4: End-to-end integration test

**Status:** Planned

**Description:** Полный end-to-end тест: HTTP-сервер получает POST /ingest → JWT auth → normalize → queue.enqueue → worker.poll → outbound.send → MAX API. Использовать mock outboundClient и mock jwtAuth.

**Acceptance criteria:**
- [ ] POST /ingest (valid JWT + body) → outboundClient.send() вызван с правильным payload
- [ ] POST /ingest (invalid JWT) → 401, outboundClient.send() не вызван
- [ ] POST /ingest (queue enabled) → queueStore.enqueue() вызван, outboundClient.send() вызван worker'ом
- [ ] Dry-run mode → outboundClient.send() возвращает dry-run payload без очереди

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 2, 3

**Files likely touched:**
- `tests/bot-platform/ingress-e2e.test.js` (new)

**Estimated scope:** M (1 file, 4 tests)

### Task 5: Create `src/bot-platform/ingress/index.js` facade

**Status:** Planned

**Description:** Фасад для ingress pipeline. Экспортирует `createIngressPipeline(options)` — создаёт и связывает `http-server`, `jwtAuth`, `normalizers`, `queueStore`. Упрощает wiring в `app.js`.

**Acceptance criteria:**
- [ ] `createIngressPipeline({ port, issuer, audience, queueStore, outboundClient, logger })` возвращает `{ start(), stop() }`
- [ ] `start()` запускает HTTP-сервер
- [ ] `stop()` останавливает HTTP-сервер

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Sprint 15

**Files likely touched:**
- `src/bot-platform/ingress/index.js` (new)

**Estimated scope:** S (1 file)

### Task 6: Update `docs/zabbix-media-type.md` planned changes

**Status:** Planned

**Description:** Обновить секцию "Planned changes" в `docs/zabbix-media-type.md`: добавить статус реализации для каждого компонента (queue, ingress, auth, normalizer).

**Acceptance criteria:**
- [ ] Секция "Planned changes" отражает текущий статус реализации
- [ ] Ссылки на ADR-0022..0028 актуальны
- [ ] Нет секретов и реальных идентификаторов

**Verification:**
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `docs/zabbix-media-type.md`

**Estimated scope:** XS (1 file)

### Task 7: Update `docs/project-context.md` with implementation status

**Status:** Planned

**Description:** Обновить `docs/project-context.md`: добавить секцию о текущем статусе multi-source ingest реализации. Отметить какие компоненты реализованы, какие в процессе.

**Acceptance criteria:**
- [ ] `docs/project-context.md` содержит актуальный статус multi-source ingest
- [ ] Ссылки на ADR-0022..0028 актуальны

**Verification:**
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `docs/project-context.md`

**Estimated scope:** XS (1 file)

### Task 8: Final integration verification

**Status:** Planned

**Description:** Полная проверка: все тесты проходят, dry-run работает, queue disabled по умолчанию, ingress disabled по умолчанию, backward compatibility сохранена.

**Acceptance criteria:**
- [ ] `npm test` — все тесты проходят
- [ ] Dry-run mode работает (существующее поведение)
- [ ] `QUEUE_ENABLED=false` — очередь не используется
- [ ] `INGRESS_ENABLED=false` — HTTP-ingress не запускается
- [ ] Backward compatibility: существующий long-polling pipeline работает без изменений
- [ ] Нет секретов в коде и документации
- [ ] Нет CJK/garbled текста в документации

**Verification:**
- [ ] `npm test` passes
- [ ] Manual check: dry-run prints safe result

**Dependencies:** Tasks 1-7

**Files likely touched:**
- None (verification only)

**Estimated scope:** XS (verification)

## Checkpoint: After Tasks 1-2 (App Wiring)

- [ ] `app.js` поддерживает два pipeline
- [ ] Ingress pipeline создаётся при `INGRESS_ENABLED=true`
- [ ] Queue worker запускается при `QUEUE_ENABLED=true`

## Checkpoint: After Tasks 3-4 (Integration Tests)

- [ ] End-to-end тест работает
- [ ] Все HTTP-коды протестированы
- [ ] Queue integration работает

## Checkpoint: After Tasks 5-8 (Final)

- [ ] Ingress facade создан
- [ ] Документация обновлена
- [ ] `npm test` passes (все тесты)
- [ ] Backward compatibility подтверждена
- [ ] Готово к ревью
