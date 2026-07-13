# Sprint 1: Live Boundaries

## Outcome

Code has safe live config boundaries and a tested outbound client interface.

## Tasks

### Task 1.1: Add live runtime config and secret validation

**Status:** Done

**Description:** Добавить конфигурационные границы для live runtime.

**Acceptance criteria:**

- [x] Live runtime валидирует обязательные переменные.
- [x] `MAX_TRANSPORT_MODE=webhook` завершается с ошибкой.
- [x] Ошибки не раскрывают секреты.
- [x] Existing dry-run behavior не ломается.

**Verification:**

- [x] Unit tests for valid/invalid config.
- [x] `npm test` passes.

**Result:** `createLiveRuntimeConfig` validates env and returns discriminated result.

### Task 1.2: Implement live outbound MAX client behind injectable HTTP boundary

**Status:** Done

**Description:** Реализовать отправку ответа через MAX Bot API за injectable HTTP boundary.

**Acceptance criteria:**

- [x] Outbound client строит live request по spec.
- [x] HTTP transport injectable and fakeable.
- [x] Logs redact token, IDs.

**Verification:**

- [x] Unit tests with fake HTTP success/error.
- [x] Secret redaction tests.
- [x] `npm test` passes.

**Result:** `createMaxOutboundClient` supports injectable HTTP boundary.

## Checkpoint

- [x] `npm test` passes.
- [x] Tests prove secrets are not logged.
- [x] Outbound client tests use fake HTTP only.
