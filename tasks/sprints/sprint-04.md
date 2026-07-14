# Sprint 4: Live Acceptance

## Outcome

Live `user_id` scenario is proven. Live `chat_id` scenario remains open.

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

**Status:** Open

**Description:** Выполнить live chat-сценарий и закрыть acceptance evidence.

**Method:** Live acceptance run

**Acceptance criteria:**

- [ ] Бот получил реальное chat-сообщение.
- [ ] Бот отправил видимый ответ through MAX Bot API.
- [ ] `docs/live-identity-bot.md` references sanitized live run.

**Verification:**

- [ ] Обезличенный live test-run добавлен.
- [ ] `docs/live-identity-bot.md` marks chat scenario accepted.
- [ ] `npm test` passes.

**Dependencies:** Task 4.1

## Checkpoint

- [x] Bot receives a real MAX inbound message.
- [x] Bot sends a real response through MAX Bot API.
- [x] Bot replies visibly in personal dialog with `RecipientType: user_id`.
- [ ] Bot replies visibly in chat scenario with `RecipientType: chat_id`.
- [ ] Sanitized live test-run is committed.
- [ ] `docs/live-identity-bot.md` references the final live run.
- [ ] `npm test` passes after final live acceptance update.
