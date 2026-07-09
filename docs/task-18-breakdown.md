# Task 18 breakdown: live MAX Identity Bot

Документ декомпозирует реализацию live MAX Identity Bot для получения `user_id` / `chat_id`.

Основание:

```text
ADR-0010: docs/decisions/ADR-0010-require-live-evidence-for-max-identity-bot-acceptance.md
Project acceptance: docs/project-acceptance.md
Status: docs/live-identity-bot.md
```

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

Если потребуется live bot-service, который принимает события Zabbix и отправляет alert-сообщения в МАХ, это отдельная архитектура вне Task 18.

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

Webhook ingress remains optional for Task 18. It can be selected only if network, DNS, port exposure and official MAX webhook semantics are confirmed before implementation.

## Sprints

### Sprint 0: API Source And Contract

Outcome: implementation is allowed only after MAX Bot API behavior is confirmed.

- Task 18.1: Confirm MAX Bot API live transport contract. Done: official `dev.max.ru` source is documented in `docs/specs/task-18-1-max-api-source.md`.
- Task 18.2: Write live transport spec and test plan. Done: `long_polling` is selected in `docs/specs/task-18-2-live-transport-spec.md`; `webhook` remains `Не реализовано`.

Checkpoint:

- [x] `docs/specs/task-18-1-max-api-source.md` is marked `Ready for Task 18.2`.
- [x] Official or approved local MAX Bot API source is documented.
- [x] Selected live transport mode is documented: `long_polling`.
- [x] No code performs live network calls yet.

### Sprint 1: Live Boundaries

Outcome: code has safe live config boundaries and a tested outbound client interface.

- Task 18.3: Add live runtime config and secret validation.
- Task 18.4: Implement live outbound MAX client behind an injectable HTTP boundary.

Checkpoint:

- [ ] `npm test` passes.
- [ ] Tests prove secrets are not logged.
- [ ] Outbound client tests use fake HTTP only.

### Sprint 2: Live Inbound

Outcome: bot can fetch or receive real MAX updates through the selected live transport boundary.

- Task 18.5: Implement live inbound MAX updates client for `long_polling`.
- Task 18.6: Connect live inbound updates to the identity pipeline.

Checkpoint:

- [ ] `npm test` passes.
- [ ] Existing synthetic dry-run still works.
- [ ] Live runtime can be exercised with fake MAX API responses.

### Sprint 3: Runtime And Operations

Outcome: operator can run the live bot safely with local secrets.

- Task 18.7: Add live service entrypoint and operational runbook.
- Task 18.8: Add security review and failure-mode tests for live runtime.

Checkpoint:

- [ ] `npm test` passes.
- [ ] Runbook explains start, stop, logs and rollback.
- [ ] `.env` and service docs do not contain real secrets.

### Sprint 4: Live Acceptance

Outcome: live `user_id` and `chat_id` scenarios are proven with sanitized evidence.

- Task 18.9: Run live personal-dialog `user_id` verification.
- Task 18.10: Run live chat `chat_id` verification and update acceptance evidence.

Checkpoint:

- [ ] Bot replies visibly in personal dialog.
- [ ] Bot replies visibly in chat scenario.
- [ ] Sanitized live test-run is committed.
- [ ] `docs/project-acceptance.md` evidence map references the live run.
- [ ] `npm test` passes.

## Parallelization

Safe to parallelize after Sprint 0:

- Task 18.4 outbound client tests and Task 18.7 runbook draft.
- Task 18.8 security review checklist and Task 18.5 fake inbound fixtures.

Must be sequential:

- Task 18.1 -> Task 18.2.
- Task 18.3 before any code reads live secrets.
- Task 18.5 before Task 18.6.
- Task 18.9 before Task 18.10 final acceptance update.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| MAX Bot API behavior is guessed | High | Task 18.1 blocks implementation until source is documented |
| Live token or IDs enter git | High | Use local `.env`, sanitized test-runs and secret-focused tests |
| Current LXC cannot receive webhook traffic | High | Prefer `long_polling` unless webhook ingress prerequisites are confirmed |
| Live runtime breaks dry-run tests | Medium | Keep synthetic dry-run path and run `npm test` after each sprint |
| Read/ack semantics are unavailable | Low | Do not make read/ack an acceptance blocker without official API support |

## Definition Of Done

- [ ] Tasks 18.1-18.10 are complete.
- [ ] Live user and chat scenarios have sanitized evidence.
- [ ] No real tokens, IDs, internal URLs or organization names are committed.
- [ ] `npm test` passes.
- [ ] `docs/project-acceptance.md`, `docs/live-identity-bot.md`, `tasks/plan.md` and `tasks/todo.md` are synchronized.
