# Sprint 4: Live Acceptance

## Outcome

Live `user_id` and `chat_id` scenarios are proven with sanitized evidence.

## Tasks

### Task 4.1: Run live personal-dialog user_id verification

**Status:** Done

**Description:** Выполнить live run в личном диалоге.

**Method:** Live integration run

**Acceptance criteria:**

- [x] Бот получил реальное личное сообщение.
- [x] Бот отправил видимый ответ через MAX Bot API.
- [x] Ответ содержит `RecipientType: user_id` и sanitized `To`.

**Verification:**

- [x] Обезличенный live test-run добавлен.
- [x] Реальные токены and IDs not committed.
- [x] `npm test` passes.

**Dependencies:** Sprint 3 complete

### Task 4.2: Run live chat chat_id verification and update acceptance

**Status:** Done

**Description:** Выполнить live chat-сценарий и закрыть acceptance evidence.

**Method:** Live acceptance run

**Acceptance criteria:**

- [x] Бот получил реальное chat-сообщение.
- [x] Бот отправил видимый ответ through MAX Bot API.
- [x] `docs/live-identity-bot.md` references sanitized live run.

**Verification:**

- [x] Обезличенный live test-run добавлен.
- [x] `docs/live-identity-bot.md` marks live scenario accepted.
- [x] `npm test` passes.

**Dependencies:** Task 4.1

## Checkpoint

- [x] Bot replies visibly in personal dialog.
- [x] Bot replies visibly in chat scenario.
- [x] Sanitized live test-run is committed.
- [x] `docs/live-identity-bot.md` references the live run.
- [x] `npm test` passes.
