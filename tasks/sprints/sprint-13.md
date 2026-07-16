# Sprint 13: Bot Commands System

## Outcome

Добавить систему команд в bot-platform: парсер `/command`, реестр команд в `core/`, ветвление в pipeline перед `router.route()`, auto-response на `bot_added`, text-only ответы в outbound client.

Реализует `docs/ideas/bot-commands.md` по ADR-0018 (pipeline dispatch), ADR-0019 (outbound response shape), ADR-0020 (expanded event scope).

Контекст: pipeline сейчас линеен — нормализация → `router.route('identity')` → send. `event.message.text` доступен, но не используется. Outbound client хардкодит `kind: 'identity'` с `zabbix` полями. `bot_added` фильтруется.

## Tasks

### Task 1: Create `src/bot-platform/core/command-parser.js`

**Description:** Модуль для парсинга команд из текста сообщения. Принимает строку, возвращает `{ command, args }` или `null` если текст не начинается с `/`.

**Acceptance criteria:**
- [ ] `parseCommand('/help')` → `{ command: '/help', args: '' }`
- [ ] `parseCommand('/status --verbose')` → `{ command: '/status', args: '--verbose' }`
- [ ] `parseCommand('hello')` → `null`
- [ ] `parseCommand('')` → `null`
- [ ] `parseCommand('/')` → `null` (пустая команда)
- [ ] `parseCommand('/Help')` → `{ command: '/help', args: '' }` (case-insensitive)

**Verification:**
- [ ] Модуль импортируется без ошибок
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/core/command-parser.js` (new)

**Estimated scope:** XS (1 file)

### Task 2: Create `src/bot-platform/core/command-registry.js`

**Description:** Статический реестр команд. Объект `{ '/help': { description, handler }, '/id': { description, handler }, '/status': { description, handler } }`. Функция `lookup(commandName)` возвращает `{ description, handler }` или `null`. Обработчики команд `/help` и `/status` — встроенные. Обработчик `/id` делегирует в identity plugin.

**Acceptance criteria:**
- [ ] `lookup('/help')` возвращает `{ description: ..., handler: function }`
- [ ] `lookup('/id')` возвращает `{ description: ..., handler: function }`
- [ ] `lookup('/status')` возвращает `{ description: ..., handler: function }`
- [ ] `lookup('/unknown')` возвращает `null`
- [ ] `getCommandList()` возвращает массив `{ name, description }` для /help
- [ ] `/help` handler возвращает text-ответ со списком команд

**Verification:**
- [ ] Модуль импортируется без ошибок
- [ ] `npm test` passes

**Dependencies:** Task 1

**Files likely touched:**
- `src/bot-platform/core/command-registry.js` (new)

**Estimated scope:** S (1 file)

### Task 3: Extend `src/bot-platform/transports/max/outbound-client.js` for text-only responses

**Description:** Расширить `buildMaxOutboundPayload()` для поддержки `kind: 'text'` ответов (ADR-0019). Существующая ветка `kind: 'identity'` не меняется. Новая ветка извлекает `recipientType` и `to` из `response.recipient.kind` + `response.recipient.value`.

**Acceptance criteria:**
- [ ] `buildMaxOutboundPayload({ kind: 'identity', zabbix: { ... } })` — существующее поведение без изменений
- [ ] `buildMaxOutboundPayload({ kind: 'text', recipient: { kind: 'chat', value: '2002' } })` → `{ recipientType: 'chat_id', to: '2002', text: ... }`
- [ ] `buildMaxOutboundPayload({ kind: 'text', recipient: { kind: 'user', value: '12345' } })` → `{ recipientType: 'user_id', to: '12345', text: ... }`
- [ ] `buildMaxOutboundPayload(null)` выбрасывает ошибку (существующее поведение)
- [ ] `buildMaxOutboundPayload({ kind: 'unknown' })` выбрасывает ошибку

**Verification:**
- [ ] `npm test` passes (существующие identity-тесты не сломаны)

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/transports/max/outbound-client.js`

**Estimated scope:** S (1 file)

### Task 4: Add command dispatch to `src/bot-platform/core/live-pipeline.js`

**Description:** Добавить ветвление перед `router.route()` (ADR-0018): парсинг команды → lookup в registry → если команда: handler(event) → send; если не команда: вернуть «Unknown command» reply. Расширить `REPLY_UPDATE_TYPES` на `['message_created', 'bot_added']` (ADR-0020). `bot_added` → автоматический text-ответ «Ready to help.».

**Acceptance criteria:**
- [ ] `message_created` с `/help` → command handler, не router
- [ ] `message_created` с `/unknown` → text-ответ «Unknown command. Send /help for available commands.»
- [ ] `message_created` с `/id` → identity handler через command registry
- [ ] `message_created` с текстом без `/` → text-ответ «Unknown command...» (identity catch-all удалён)
- [ ] `bot_added` → text-ответ «Ready to help.» с `recipient` из event
- [ ] `bot_started` → `mode: 'ignored'` (без изменений)
- [ ] Существующие identity-тесты продолжают работать

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 1, 2, 3

**Files likely touched:**
- `src/bot-platform/core/live-pipeline.js`

**Estimated scope:** M (1 file, критичные изменения)

### Task 5: Add command dispatch to `src/bot-platform/core/dry-run-pipeline.js`

**Description:** Добавить command dispatch в dry-run pipeline для паритета с live-pipeline (ADR-0018). Принимать command registry через options.

**Acceptance criteria:**
- [ ] `dry-run-pipeline` обрабатывает `/help` через command dispatch
- [ ] `dry-run-pipeline` обрабатывает `/unknown` — возвращает «Unknown command» reply
- [ ] `dry-run-pipeline` обрабатывает `bot_added` — возвращает «Ready to help.»
- [ ] Существующие dry-run тесты продолжают работать

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 1, 2, 3

**Files likely touched:**
- `src/bot-platform/core/dry-run-pipeline.js`

**Estimated scope:** S (1 file)

### Task 6: Create `tests/bot-platform/command-parser.test.js`

**Description:** Тесты для command-parser: положительные кейсы (`/help`, `/id`, `/status`), негативные (пустой текст, текст без `/`, только `/`), case-insensitive, аргументы.

**Acceptance criteria:**
- [ ] Тест: `/help` → `{ command: '/help', args: '' }`
- [ ] Тест: `/status --verbose` → `{ command: '/status', args: '--verbose' }`
- [ ] Тест: `hello` → `null`
- [ ] Тест: `''` → `null`
- [ ] Тест: `/` → `null`
- [ ] Тест: `/Help` → `{ command: '/help', args: '' }`
- [ ] Тест: `/id some args` → `{ command: '/id', args: 'some args' }`

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 1

**Files likely touched:**
- `tests/bot-platform/command-parser.test.js` (new)

**Estimated scope:** S (1 file)

### Task 7: Create `tests/bot-platform/command-registry.test.js`

**Description:** Тесты для command-registry: lookup команд, getCommandList, обработчики возвращают правильные ответы.

**Acceptance criteria:**
- [ ] Тест: `lookup('/help')` возвращает объект с `handler`
- [ ] Тест: `lookup('/id')` возвращает объект с `handler`
- [ ] Тест: `lookup('/status')` возвращает объект с `handler`
- [ ] Тест: `lookup('/unknown')` возвращает `null`
- [ ] Тест: `getCommandList()` возвращает массив из 3 элементов
- [ ] Тест: `/help` handler возвращает ответ с `kind: 'text'`

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 2

**Files likely touched:**
- `tests/bot-platform/command-registry.test.js` (new)

**Estimated scope:** S (1 file)

### Task 8: Create `tests/bot-platform/bot-commands-pipeline.test.js`

**Description:** Интеграционные тесты pipeline с command dispatch: live-pipeline обрабатывает `/help`, `/id`, `/unknown`, `bot_added`, не-командный текст. Dry-run pipeline аналогично.

**Acceptance criteria:**
- [ ] Тест: live-pipeline + `/help` → mode !== 'ignored', response.text содержит список команд
- [ ] Тест: live-pipeline + `/id` → mode !== 'ignored', response.kind === 'identity'
- [ ] Тест: live-pipeline + `/unknown` → response.text содержит «Unknown command»
- [ ] Тест: live-pipeline + `bot_added` → response.text === 'Ready to help.'
- [ ] Тест: live-pipeline + `bot_started` → mode === 'ignored'
- [ ] Тест: dry-run pipeline + `/help` → response с text полем

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 4, 5

**Files likely touched:**
- `tests/bot-platform/bot-commands-pipeline.test.js` (new)

**Estimated scope:** M (1 file, интеграционные тесты)

### Task 9: Update `docs/decisions/README.md`

**Description:** Добавить ADR-0018, ADR-0019, ADR-0020 в индекс `docs/decisions/README.md`.

**Acceptance criteria:**
- [ ] ADR-0018 перечислен в README
- [ ] ADR-0019 перечислен в README
- [ ] ADR-0020 перечислен в README
- [ ] Формат записи совпадает с существующими

**Verification:**
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `docs/decisions/README.md`

**Estimated scope:** XS (1 file)

### Task 10: Update `docs/project-context.md` and `docs/ideas/bot-commands.md`

**Description:** Обновить project-context.md: добавить описание bot commands системы. Обновить bot-commands.md: пометить ADRs как созданные, задачи как запланированные.

**Acceptance criteria:**
- [ ] `docs/project-context.md` содержит секцию о bot commands
- [ ] `docs/ideas/bot-commands.md` ссылается на sprint-13
- [ ] ADR-0018, 0019, 0020 помечены как Created/Accepted

**Verification:**
- [ ] `npm test` passes
- [ ] Документы не содержат секретов

**Dependencies:** Tasks 9

**Files likely touched:**
- `docs/project-context.md`
- `docs/ideas/bot-commands.md`

**Estimated scope:** S (2 files)

## Checkpoint: After Tasks 1-3 (Foundation)

- [ ] `command-parser.js` создан и работает
- [ ] `command-registry.js` создан и работает
- [ ] `outbound-client.js` поддерживает `kind: 'text'` ответы
- [ ] Существующие тесты не сломаны
- [ ] `npm test` passes

## Checkpoint: After Tasks 4-5 (Pipeline Integration)

- [ ] Live pipeline обрабатывает команды и `bot_added`
- [ ] Dry-run pipeline обрабатывает команды
- [ ] Identity catch-all удалён (не-командный текст → «Unknown command»)
- [ ] `npm test` passes

## Checkpoint: After Tasks 6-8 (Tests)

- [ ] 3 новых тест-файла созданы
- [ ] Все тесты проходят
- [ ] Команды работают end-to-end через pipeline

## Checkpoint: After Tasks 9-10 (Docs)

- [ ] `docs/decisions/README.md` обновлён
- [ ] `docs/project-context.md` обновлён
- [ ] `docs/ideas/bot-commands.md` обновлён
- [ ] Нет секретов и реальных идентификаторов
- [ ] Готово к ревью
