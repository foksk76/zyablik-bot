# Sprint 12: ADR-0017 Event Contract Edge Cases

## Outcome

Добавить тесты для edge cases внутреннего контракта событий (ADR-0017): channel chat_type, пустой input, строгая проверка shape output.

## Tasks

### Task 1: channel chat_type

**Status:** Closed

**Description:** Проверить, что `chat_type: 'channel'` маршрутизируется как `RECIPIENT_KIND_CHAT`.

**Acceptance criteria:**
- [x] `event.recipient.kind === 'chat'`
- [x] `event.recipient.value === '3003'`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/max-event-normalizer.test.js`

**Estimated scope:** XS (1 test)

### Task 2: createInternalEvent с пустым input

**Status:** Closed

**Description:** Проверить, что `createInternalEvent({})` выбрасывает `Unsupported recipient kind`.

**Acceptance criteria:**
- [x] `assert.throws(..., /Unsupported recipient kind/)`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/event-contract.test.js`

**Estimated scope:** XS (1 test)

### Task 3: Строгая проверка output shape

**Status:** Closed

**Description:** Проверить, что `createInternalEvent` и `normalizeMaxEvent` возвращают объект ровно с `{source, recipient, message, raw}` — без лишних полей.

**Acceptance criteria:**
- [x] `Object.keys(event).sort()` === `['message', 'raw', 'recipient', 'source']`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/event-contract.test.js`
- `tests/bot-platform/max-event-normalizer.test.js`

**Estimated scope:** XS (2 tests)

## Checkpoint: After Tasks 1-3

- [x] 3 теста добавлены (1 в max-event-normalizer, 2 в event-contract)
- [x] `npm test` passes (151 tests)
- [x] ADR-0017 покрыт тестами для edge cases
