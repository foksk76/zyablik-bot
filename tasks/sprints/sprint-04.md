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

**Dependencies:** Task 4.1, Sprint 5 Task 5.1 (group chat update delivery must be confirmed in public MAX Bot API sources first)

**Reopened rationale:** Ранее задача была отмечена Done, но live-диагностика показала, что chat-сценарий не подтверждён. Прямой запрос `GET /updates` с реальным токеном бота в групповом чате возвращает `HTTP 200` с пустым списком `updates` — MAX Bot API не доставляет боту `message_created` для обычных сообщений участников чата. Ранее наблюдавшийся chat-ответ (200 OK, `recipientType=chat_id`) с высокой вероятностью был ответом на `bot_added`, а не на `message_created` из чата; после фикса бага №1 (PR #2) бот не отвечает на `bot_added`. Подтверждение условий доставки updates в групповой чат вынесено в Sprint 5 Task 5.1.

**Closure:** Задача закрыта как часть Task 18.10 (live chat chat_id verification, 2026-07-15 10:51 UTC). Документ приемки: `docs/test-runs/task-18-live-acceptance-run.md`.

## Checkpoint

- [x] Bot replies visibly in personal dialog.
- [x] Bot replies visibly in chat scenario.
- [x] Sanitized live test-run is committed.
- [x] `docs/live-identity-bot.md` references the live run.
- [x] `npm test` passes.
