# Identity Plugin: Live Sprint Plan

## Overview

Документ декомпозирует реализацию live MAX Identity Bot для получения `user_id` / `chat_id`.

## Цель

Довести bot-platform от dry-run/safe-test состояния до live-сценария:

```text
реальное входящее сообщение МАХ
  -> normalizeMaxEvent()
  -> event-router
  -> identity plugin
  -> реальный ответ через MAX Bot API
```

Проект остается identity-only. Он не добавляет очередь, базу данных, журнал доставки, retry, маршрутизацию уведомлений вне Zabbix или управление событиями Zabbix из МАХ.

Zabbix alert delivery не переносится в bot-platform. Уведомления Zabbix продолжает отправлять существующий Media type:

```text
src/zabbix-media-type/max-webhook.js
```

## Dependency Graph

```text
MAX Bot API source confirmation
  -> live transport contract spec
    -> live config and secret boundaries
      -> outbound MAX client
      -> inbound MAX polling client
        -> live long-polling runtime
          -> service entrypoint and runbook
            -> live user_id run
            -> live chat_id run
              -> final acceptance evidence
```

## Sprints

### Sprint 0: API Source And Contract

Outcome: implementation is allowed only after MAX Bot API behavior is confirmed.

- Confirm MAX Bot API live transport contract. Done: official `dev.max.ru` source documented in `max-api-source.md`.
- Write live transport spec and test plan. Done: `long_polling` is selected in `live-transport-spec.md`; `webhook` remains `Не реализовано`.

Checkpoint:

- [x] `max-api-source.md` marked ready.
- [x] Official or approved local MAX Bot API source is documented.
- [x] Selected live transport mode is documented: `long_polling`.
- [x] No code performs live network calls yet.

### Sprint 1: Live Boundaries

Outcome: code has safe live config boundaries and a tested outbound client interface.

- Add live runtime config and secret validation. Done: config boundary rejects invalid long polling live env and returns webhook not-implemented stub.
- Implement live outbound MAX client behind an injectable HTTP boundary. Done: live request builder uses injectable HTTP transport and safe error normalization.

Checkpoint:

- [x] `npm test` passes.
- [x] Tests prove secrets are not logged.
- [x] Outbound client tests use fake HTTP only.

### Sprint 2: Live Inbound

Outcome: bot can fetch or receive real MAX updates through the selected live transport boundary.

- Implement live inbound MAX updates client for `long_polling`. Done: stateful polling client stores `marker` and validates API responses.
- Connect live inbound updates to the identity pipeline. Done: live inbound update processor routes normalized MAX events to identity handler and outbound client boundary.

Checkpoint:

- [x] `npm test` passes.
- [x] Existing synthetic dry-run still works.
- [x] Live runtime can be exercised with fake MAX API responses.

### Sprint 3: Runtime And Operations

Outcome: operator can run the live bot safely with local secrets.

- Add live service entrypoint and operational runbook. Done: `node src/bot-platform/app.js --live` starts live long polling, and `docs/runbooks/live-identity-bot.md` documents start/stop/logs/rollback.
- Add security review and failure-mode tests for live runtime. Done: malformed inbound and outbound 503 failure modes are covered, and live runtime uses redacting logger boundary by default.

Checkpoint:

- [x] `npm test` passes.
- [x] Runbook explains start, stop, logs and rollback.
- [x] `.env` and service docs do not contain real secrets.

### Sprint 4: Live Acceptance

Outcome: live `user_id` and `chat_id` scenarios are proven with sanitized evidence.

- Run live personal-dialog `user_id` verification.
- Run live chat `chat_id` verification and update acceptance evidence.

Checkpoint:

- [ ] Bot replies visibly in personal dialog.
- [ ] Bot replies visibly in chat scenario.
- [ ] Sanitized live test-run is committed.
- [ ] `docs/live-identity-bot.md` references the live run.
- [ ] `npm test` passes.

## Parallelization

Safe to parallelize after Sprint 0:

- Outbound client tests and runbook draft.
- Security review checklist and fake inbound fixtures.

Must be sequential:

- Sprint 0 -> Sprint 1 -> Sprint 2 -> Sprint 3 -> Sprint 4.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| MAX Bot API behavior is guessed | High | Sprint 0 blocks implementation until source is documented |
| Live token or IDs enter git | High | Use local `.env`, sanitized test-runs and secret-focused tests |
| Current LXC cannot receive webhook traffic | High | Prefer `long_polling` unless webhook ingress prerequisites are confirmed |
| Live runtime breaks dry-run tests | Medium | Keep synthetic dry-run path and run `npm test` after each sprint |
| Read/ack semantics are unavailable | Low | Do not make read/ack an acceptance blocker without official API support |

## Definition Of Done

- [ ] All sprints complete.
- [ ] Live user and chat scenarios have sanitized evidence.
- [ ] No real tokens, IDs, internal URLs or organization names are committed.
- [ ] `npm test` passes.
- [ ] `docs/live-identity-bot.md` is synchronized.
