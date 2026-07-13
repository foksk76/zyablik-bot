# Sprint 3: Runtime And Operations

## Outcome

Operator can run the live bot safely with local secrets.

## Tasks

### Task 3.1: Add live service entrypoint and operational runbook

**Status:** Done

**Description:** Добавить документированный способ запуска live bot.

**Acceptance criteria:**

- [x] Live startup command documented.
- [x] systemd guidance separates modes.
- [x] Rollback and log inspection documented.

**Verification:**

- [x] Foreground startup tested without real network.
- [x] `npm test` passes.
- [x] No real secrets in docs.

**Result:** `node src/bot-platform/app.js --live`, systemd unit, runbook.

### Task 3.2: Add security review and failure-mode tests

**Status:** Done

**Description:** Проверить live runtime на безопасную обработку ошибок.

**Acceptance criteria:**

- [x] Ошибки API классифицированы без раскрытия секретов.
- [x] Malformed updates do not crash permanently.
- [x] Raw payload not logged by default.

**Verification:**

- [x] Failure-mode tests pass.
- [x] Security review notes recorded.
- [x] `npm test` passes.

**Result:** Failure-mode tests and redacting logger. Review in `security-review.md`.

## Checkpoint

- [x] `npm test` passes.
- [x] Runbook explains start, stop, logs and rollback.
- [x] `.env` and service docs do not contain real secrets.
