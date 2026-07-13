# Sprint 2: Live Inbound

## Outcome

Bot can fetch or receive real MAX updates through the selected live transport boundary.

## Tasks

### Task 2.1: Implement live inbound MAX updates client for long_polling

**Status:** Done

**Description:** Реализовать получение live updates через `GET /updates`.

**Acceptance criteria:**

- [x] Inbound client получает updates по spec.
- [x] Inbound client передает `marker` в следующий poll.
- [x] HTTP transport injectable.
- [x] Invalid API responses fail safely.

**Verification:**

- [x] Unit tests with fake/empty/error responses.
- [x] `npm test` passes.

**Result:** `createMaxInboundUpdatesClient` with marker memory and validation.

### Task 2.2: Connect live inbound updates to identity pipeline

**Status:** Done

**Description:** Подключить live inbound updates к existing flow.

**Acceptance criteria:**

- [x] Live update проходит через normalizer and identity plugin.
- [x] Live response отправляется через outbound boundary.
- [x] Existing dry-run continues to pass.

**Verification:**

- [x] Integration test with fake inbound/outbound.
- [x] Regression tests for dry-run.
- [x] `npm test` passes.

**Result:** `createIdentityUpdateProcessor` wires live pipeline.

## Checkpoint

- [x] `npm test` passes.
- [x] Existing synthetic dry-run still works.
- [x] Live runtime can be exercised with fake MAX API responses.
