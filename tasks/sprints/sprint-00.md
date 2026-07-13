# Sprint 0: API Source And Contract

## Outcome

Implementation is allowed only after MAX Bot API behavior is confirmed.

## Tasks

### Task 0.1: Confirm MAX Bot API live transport contract

**Status:** Done

**Description:** Найти и зафиксировать официальный или утвержденный локальный источник MAX Bot API.

**Acceptance criteria:**

- [x] Подтвержден источник API для входящих событий.
- [x] Подтвержден источник API для отправки сообщения.
- [x] Зафиксирован статус read/ack.

**Verification:**

- [x] `docs/identity-plugin/max-api-source.md` exists.
- [x] Spec has references or approved local source.
- [x] Spec has no tokens, real IDs, internal URLs.

**Result:** Official source confirmed via `dev.max.ru`.

### Task 0.2: Write live transport spec and test plan

**Status:** Done

**Description:** Выбрать live transport mode и описать test plan.

**Acceptance criteria:**

- [x] Выбран первый live transport mode: `long_polling`.
- [x] Описаны inbound/outbound contracts.
- [x] Описан test plan.

**Verification:**

- [x] `docs/identity-plugin/live-transport-spec.md` exists.
- [x] No API behavior is guessed.
- [x] `npm test` passes.

**Result:** `long_polling` selected; `webhook` is explicit stub.

## Checkpoint

- [x] `max-api-source.md` marked ready.
- [x] Official MAX Bot API source documented.
- [x] Selected live transport mode: `long_polling`.
- [x] No code performs live network calls yet.
