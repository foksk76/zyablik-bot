# Sprint 13: Bot Commands System

## Outcome

Добавить систему команд в bot-platform: парсер `/command`, реестр команд в `core/`, ветвление в pipeline перед `router.route()`, auto-response на `bot_added`, text-only ответы в outbound client.

Реализует `docs/ideas/bot-commands.md` по ADR-0018 (pipeline dispatch), ADR-0019 (outbound response shape), ADR-0020 (expanded event scope — `bot_added`), ADR-0021 (expanded event scope — `bot_started`).

Контекст: pipeline сейчас линеен — нормализация → `router.route('identity')` → send. `event.message.text` доступен, но не используется. Outbound client хардкодит `kind: 'identity'` с `zabbix` полями. `bot_added` фильтруется.

## Tasks

### Task 1: Create `src/bot-platform/core/command-parser.js`

**Status:** Done

**Description:** Модуль для парсинга команд из текста сообщения. Принимает строку, возвращает `{ command, args }` или `null` если текст не начинается с `/`.

**Acceptance criteria:**
- [x] `parseCommand('/help')` → `{ command: '/help', args: '' }`
- [x] `parseCommand('/status --verbose')` → `{ command: '/status', args: '--verbose' }`
- [x] `parseCommand('hello')` → `null`
- [x] `parseCommand('')` → `null`
- [x] `parseCommand('/')` → `null` (пустая команда)
- [x] `parseCommand('/Help')` → `{ command: '/help', args: '' }` (case-insensitive)

**Verification:**
- [x] Модуль импортируется без ошибок
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/core/command-parser.js` (new)

**Estimated scope:** XS (1 file)

### Task 2: Create `src/bot-platform/core/command-registry.js`

**Status:** Done

**Description:** Статический реестр команд. Объект `{ '/help': { description, handler }, '/id': { description, handler }, '/status': { description, handler } }`. Функция `lookup(commandName)` возвращает `{ description, handler }` или `null`. Обработчики команд `/help` и `/status` — встроенные. Обработчик `/id` делегирует в identity plugin.

**Acceptance criteria:**
- [x] `lookup('/help')` возвращает `{ description: ..., handler: function }`
- [x] `lookup('/id')` возвращает `{ description: ..., handler: function }`
- [x] `lookup('/status')` возвращает `{ description: ..., handler: function }`
- [x] `lookup('/unknown')` возвращает `null`
- [x] `getCommandList()` возвращает массив `{ name, description }` для /help
- [x] `/help` handler возвращает text-ответ со списком команд

**Verification:**
- [x] Модуль импортируется без ошибок
- [x] `npm test` passes

**Dependencies:** Task 1

**Files likely touched:**
- `src/bot-platform/core/command-registry.js` (new)

**Estimated scope:** S (1 file)

### Task 3: Extend `src/bot-platform/transports/max/outbound-client.js` for text-only responses

**Status:** Done

**Description:** Расширить `buildMaxOutboundPayload()` для поддержки `kind: 'text'` ответов (ADR-0019). Существующая ветка `kind: 'identity'` не меняется. Новая ветка извлекает `recipientType` и `to` из `response.recipient.kind` + `response.recipient.value`.

**Acceptance criteria:**
- [x] `buildMaxOutboundPayload({ kind: 'identity', zabbix: { ... } })` — существующее поведение без изменений
- [x] `buildMaxOutboundPayload({ kind: 'text', recipient: { kind: 'chat', value: '2002' } })` → `{ recipientType: 'chat_id', to: '2002', text: ... }`
- [x] `buildMaxOutboundPayload({ kind: 'text', recipient: { kind: 'user', value: '12345' } })` → `{ recipientType: 'user_id', to: '12345', text: ... }`
- [x] `buildMaxOutboundPayload(null)` выбрасывает ошибку (существующее поведение)
- [x] `buildMaxOutboundPayload({ kind: 'unknown' })` выбрасывает ошибку

**Verification:**
- [x] `npm test` passes (существующие identity-тесты не сломаны)

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/transports/max/outbound-client.js`

**Estimated scope:** S (1 file)

### Task 4: Add command dispatch to `src/bot-platform/core/live-pipeline.js`

**Status:** Done

**Description:** Добавить ветвление перед `router.route()` (ADR-0018): парсинг команды → lookup в registry → если команда: handler(event) → send; если не команда: вернуть «Unknown command» reply. Расширить `REPLY_UPDATE_TYPES` на `['message_created', 'bot_added']` (ADR-0020). `bot_added` → автоматический text-ответ «Ready to help.». Позже ADR-0021 расширил scope до `bot_started` — см. Task 11.

**Acceptance criteria:**
- [x] `message_created` с `/help` → command handler, не router
- [x] `message_created` с `/unknown` → text-ответ «Unknown command. Send /help for available commands.»
- [x] `message_created` с `/id` → identity handler через command registry
- [x] `message_created` с текстом без `/` → text-ответ «Unknown command...» (identity catch-all удалён)
- [x] `bot_added` → text-ответ «Ready to help.» с `recipient` из event
- [x] `bot_started` → text-ответ «Ready to help.» (расширено в ADR-0021, см. Task 11)
- [x] Существующие identity-тесты продолжают работать

**Verification:**
- [x] `npm test` passes

**Dependencies:** Tasks 1, 2, 3

**Files likely touched:**
- `src/bot-platform/core/live-pipeline.js`

**Estimated scope:** M (1 file, критичные изменения)

### Task 5: Add command dispatch to `src/bot-platform/core/dry-run-pipeline.js`

**Status:** Done

**Description:** Добавить command dispatch в dry-run pipeline для паритета с live-pipeline (ADR-0018). Принимать command registry через options.

**Acceptance criteria:**
- [x] `dry-run-pipeline` обрабатывает `/help` через command dispatch
- [x] `dry-run-pipeline` обрабатывает `/unknown` — возвращает «Unknown command» reply
- [x] `dry-run-pipeline` обрабатывает `bot_added` — возвращает «Ready to help.»
- [x] Существующие dry-run тесты продолжают работать

**Verification:**
- [x] `npm test` passes

**Dependencies:** Tasks 1, 2, 3

**Files likely touched:**
- `src/bot-platform/core/dry-run-pipeline.js`

**Estimated scope:** S (1 file)

### Task 6: Create `tests/bot-platform/command-parser.test.js`

**Status:** Done

**Description:** Тесты для command-parser: положительные кейсы (`/help`, `/id`, `/status`), негативные (пустой текст, текст без `/`, только `/`), case-insensitive, аргументы.

**Acceptance criteria:**
- [x] Тест: `/help` → `{ command: '/help', args: '' }`
- [x] Тест: `/status --verbose` → `{ command: '/status', args: '--verbose' }`
- [x] Тест: `hello` → `null`
- [x] Тест: `''` → `null`
- [x] Тест: `/` → `null`
- [x] Тест: `/Help` → `{ command: '/help', args: '' }`
- [x] Тест: `/id some args` → `{ command: '/id', args: 'some args' }`

**Verification:**
- [x] `npm test` passes

**Dependencies:** Task 1

**Files likely touched:**
- `tests/bot-platform/command-parser.test.js` (new)

**Estimated scope:** S (1 file)

### Task 7: Create `tests/bot-platform/command-registry.test.js`

**Status:** Done

**Description:** Тесты для command-registry: lookup команд, getCommandList, обработчики возвращают правильные ответы.

**Acceptance criteria:**
- [x] Тест: `lookup('/help')` возвращает объект с `handler`
- [x] Тест: `lookup('/id')` возвращает объект с `handler`
- [x] Тест: `lookup('/status')` возвращает объект с `handler`
- [x] Тест: `lookup('/unknown')` возвращает `null`
- [x] Тест: `getCommandList()` возвращает массив из 3 элементов
- [x] Тест: `/help` handler возвращает ответ с `kind: 'text'`

**Verification:**
- [x] `npm test` passes

**Dependencies:** Task 2

**Files likely touched:**
- `tests/bot-platform/command-registry.test.js` (new)

**Estimated scope:** S (1 file)

### Task 8: Create `tests/bot-platform/bot-commands-pipeline.test.js`

**Status:** Done

**Description:** Интеграционные тесты pipeline с command dispatch: live-pipeline обрабатывает `/help`, `/id`, `/unknown`, `bot_added`, не-командный текст. Dry-run pipeline аналогично.

**Acceptance criteria:**
- [x] Тест: live-pipeline + `/help` → mode !== 'ignored', response.text содержит список команд
- [x] Тест: live-pipeline + `/id` → mode !== 'ignored', response.kind === 'identity'
- [x] Тест: live-pipeline + `/unknown` → response.text содержит «Unknown command»
- [x] Тест: live-pipeline + `bot_added` → response.text === 'Ready to help.'
- [x] Тест: live-pipeline + `bot_started` → text-ответ «Ready to help.» (расширено в ADR-0021, см. Task 11)
- [x] Тест: dry-run pipeline + `/help` → response с text полем

**Verification:**
- [x] `npm test` passes

**Dependencies:** Tasks 4, 5

**Files likely touched:**
- `tests/bot-platform/bot-commands-pipeline.test.js` (new)

**Estimated scope:** M (1 file, интеграционные тесты)

### Task 9: Update `docs/decisions/README.md`

**Status:** Done

**Description:** Добавить ADR-0018, ADR-0019, ADR-0020 в индекс `docs/decisions/README.md`.

**Acceptance criteria:**
- [x] ADR-0018 перечислен в README
- [x] ADR-0019 перечислен в README
- [x] ADR-0020 перечислен в README
- [x] Формат записи совпадает с существующими

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `docs/decisions/README.md`

**Estimated scope:** XS (1 file)

### Task 10: Update `docs/project-context.md` and `docs/ideas/bot-commands.md`

**Status:** Done

**Description:** Обновить project-context.md: добавить описание bot commands системы. Обновить bot-commands.md: пометить ADRs как созданные, задачи как запланированные.

**Acceptance criteria:**
- [x] `docs/project-context.md` содержит секцию о bot commands
- [x] `docs/ideas/bot-commands.md` ссылается на sprint-13
- [x] ADR-0018, 0019, 0020 помечены как Created/Accepted

**Verification:**
- [x] `npm test` passes
- [x] Документы не содержат секретов

**Dependencies:** Tasks 9

**Files likely touched:**
- `docs/project-context.md`
- `docs/ideas/bot-commands.md`

**Estimated scope:** S (2 files)

### Task 11: Handle `bot_started` events with welcome (ADR-0021)

**Status:** Done

**Description:** Принять ADR-0021 — расширить `REPLY_UPDATE_TYPES` на `bot_started`. Баг-репорт показал, что пользователи ожидают приветствие при начале личного диалога с ботом. `bot_started` обрабатывается аналогично `bot_added` — отправляет «Ready to help.» без вызова command dispatch. Обновить `docs/live-identity-bot.md`.

**Acceptance criteria:**
- [x] ADR-0021 создан и помечен как Accepted
- [x] `REPLY_UPDATE_TYPES` включает `bot_started`
- [x] `bot_started` → text-ответ «Ready to help.» с `recipient` из event
- [x] `live-pipeline.js` и `dry-run-pipeline.js` обновлены
- [x] Тесты `bot_started` обновлены: возвращают приветствие вместо `mode: 'ignored'`
- [x] `docs/live-identity-bot.md` обновлён
- [x] `npm test` passes

**Verification:**
- [x] `npm test` passes

**Dependencies:** Task 4

**Files likely touched:**
- `docs/decisions/ADR-0021-handle-bot-started-welcome.md` (new)
- `src/bot-platform/core/pipeline-constants.js`
- `src/bot-platform/core/live-pipeline.js`
- `src/bot-platform/core/dry-run-pipeline.js`
- `docs/live-identity-bot.md`

**Estimated scope:** S (5 files)

## Checkpoint: After Tasks 1-3 (Foundation)

- [x] `command-parser.js` создан и работает
- [x] `command-registry.js` создан и работает
- [x] `outbound-client.js` поддерживает `kind: 'text'` ответы
- [x] Существующие тесты не сломаны
- [x] `npm test` passes (151 tests)

## Checkpoint: After Tasks 4-5 (Pipeline Integration)

- [x] Live pipeline обрабатывает команды и `bot_added`
- [x] Dry-run pipeline обрабатывает команды
- [x] Identity catch-all удалён (не-командный текст → «Unknown command»)
- [x] `npm test` passes (153 tests)

## Checkpoint: After Tasks 6-8 (Tests)

- [x] 3 новых тест-файла созданы
- [x] Все тесты проходят (185 tests)
- [x] Команды работают end-to-end через pipeline

## Checkpoint: After Tasks 9-10 (Docs)

- [x] `docs/decisions/README.md` обновлён
- [x] `docs/project-context.md` обновлён
- [x] `docs/ideas/bot-commands.md` обновлён
- [x] Нет секретов и реальных идентификаторов
- [x] Готово к ревью
