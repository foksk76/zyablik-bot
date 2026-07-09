# Task 18.2 spec: live transport mode and test plan

Документ фиксирует contract-first план для первой live-реализации MAX Identity Bot.

## Status

```text
Ready for Task 18.3: long_polling selected, webhook is explicit Not Implemented stub.
```

## Source Basis

Основной source gate закрыт в:

```text
docs/specs/task-18-1-max-api-source.md
docs/decisions/ADR-0011-use-long-polling-for-first-live-max-identity-bot.md
```

Официальные источники MAX API:

- `https://dev.max.ru/docs-api` — base URL, auth, HTTP codes, transport guidance.
- `https://dev.max.ru/docs-api/methods/GET/updates` — Long Polling updates.
- `https://dev.max.ru/docs-api/methods/POST/messages` — outbound message response.
- `https://dev.max.ru/docs-api/methods/POST/subscriptions` — Webhook subscription, not implemented in first live mode.
- `https://dev.max.ru/docs-api/objects/Update` — update event object.
- `https://dev.max.ru/docs-api/objects/Message` — message object.
- `https://dev.max.ru/docs-api/objects/NewMessageBody` — outbound message body.

## Selected Transport

First live implementation:

```text
MAX_TRANSPORT_MODE=long_polling
```

Explicit unsupported mode:

```text
MAX_TRANSPORT_MODE=webhook
```

Expected behavior for `webhook` until a separate implementation task or ADR:

```text
Не реализовано: transport mode webhook
```

The runtime must fail fast for `webhook`; it must not fallback to `long_polling` and must not perform live network calls in that branch.

## Public Runtime Contract

### Environment Inputs

Task 18.3 must validate these inputs before live runtime starts:

| Variable | Required | Values | Notes |
|---|---:|---|---|
| `MAX_TRANSPORT_MODE` | yes | `long_polling`, `webhook` | `webhook` returns Not Implemented stub |
| `MAX_BOT_TOKEN` | yes for live mode | non-empty string | Never log raw value |
| `MAX_API_URL` | optional | HTTPS URL | Default: `https://platform-api2.max.ru` |
| `MAX_POLL_LIMIT` | optional | integer `1..1000` | Default should not exceed official limit |
| `MAX_POLL_TIMEOUT_SECONDS` | optional | integer `0..90` | Default should not exceed official limit |
| `MAX_POLL_TYPES` | optional | comma-separated update types | Initial value: `message_created,bot_started,bot_added` |

### Runtime Mode Result

The config boundary should expose a discriminated mode result:

```text
{ mode: "long_polling", ...validatedLongPollingConfig }
{ mode: "webhook", error: "Не реализовано: transport mode webhook" }
```

Consumer code must switch on `mode`. It must not infer behavior from raw environment strings after validation.

### Error Semantics

All config and transport errors must be:

- deterministic;
- safe to log;
- free of raw token, `user_id`, `chat_id`, internal URL and organization names.

Webhook selected before implementation:

```text
code: TRANSPORT_NOT_IMPLEMENTED
message: Не реализовано: transport mode webhook
```

Invalid config:

```text
code: CONFIG_VALIDATION_ERROR
message: Invalid MAX live runtime configuration
```

MAX API response errors:

```text
code: MAX_API_ERROR
message: MAX API request failed
```

The exact error object shape can be implemented in Task 18.3, but it must preserve these stable codes and safe messages.

## Long Polling Inbound Contract

Request:

```text
GET /updates
Authorization: <token>
```

Query parameters:

- `limit`;
- `timeout`;
- `marker`;
- `types`.

Runtime rules:

- use `types=message_created,bot_started,bot_added` unless config overrides it;
- persist `marker` in memory for the running process;
- send the previous response `marker` on the next poll;
- treat MAX responses as untrusted external data and validate before routing;
- do not commit live payloads with real `user_id`, `chat_id`, tokens or organization names.

Ack rule:

- Long Polling updates are acknowledged by sending the received `marker` in a later request.

## Outbound Response Contract

Request:

```text
POST /messages?user_id=<redacted>
POST /messages?chat_id=<redacted>
Authorization: <token>
Content-Type: application/json
```

Body:

```json
{
  "text": "RecipientType: user_id\nTo: <redacted>",
  "notify": true,
  "format": "markdown"
}
```

Rules:

- `RecipientType` must be `user_id` for personal dialog and `chat_id` for chat scenario;
- `To` must be derived from validated MAX event data;
- text must stay within the official 4000 character limit;
- outbound HTTP must be behind an injectable boundary for fake tests;
- logs must redact token and recipient identifiers.

## Webhook Stub Contract

`webhook` is intentionally not implemented in the first live mode.

Required behavior:

- config accepts the enum value `webhook`;
- runtime fails before creating a server or calling MAX API;
- returned/logged message is exactly:

```text
Не реализовано: transport mode webhook
```

Forbidden behavior:

- silent fallback to `long_polling`;
- partial webhook server startup;
- `POST /subscriptions` call;
- storing webhook `secret` in repository docs or examples.

## Test Plan

### Fake API Tests

Task 18.3:

- validates `MAX_TRANSPORT_MODE=long_polling`;
- validates default `MAX_API_URL=https://platform-api2.max.ru`;
- rejects missing `MAX_BOT_TOKEN` in live mode without printing it;
- returns `TRANSPORT_NOT_IMPLEMENTED` for `MAX_TRANSPORT_MODE=webhook`.

Task 18.4:

- builds `POST /messages?user_id=<id>` with fake HTTP transport;
- builds `POST /messages?chat_id=<id>` with fake HTTP transport;
- sends `Authorization` header without logging token;
- maps MAX `400`, `401`, `429`, `503` to safe structured errors.

Task 18.5:

- builds `GET /updates` with `limit`, `timeout`, `marker`, `types`;
- stores response `marker` in memory for the next poll;
- validates update response shape before passing it to routing;
- rejects malformed external API payloads with safe errors.

Task 18.6:

- routes validated `message_created` to identity plugin;
- ignores or safely handles unsupported update types;
- keeps existing dry-run and synthetic fixtures working.

### Local Service Run

Before live credentials:

1. Run unit tests with fake HTTP only.
2. Start runtime with `MAX_TRANSPORT_MODE=webhook` and sanitized local env; verify it exits with `Не реализовано: transport mode webhook`.
3. Start runtime with `MAX_TRANSPORT_MODE=long_polling` and fake/injected transport; verify no real network is required in automated tests.

### Live Personal Dialog Run

Prerequisites:

- real token configured only in local environment;
- `MAX_TRANSPORT_MODE=long_polling`;
- no real IDs in command line, docs or git.

Expected result:

- user sends a real message to the MAX bot;
- runtime receives a `message_created` update;
- bot replies visibly with:

```text
RecipientType: user_id
To: <redacted>
```

Evidence:

- create sanitized test-run document in `docs/test-runs/`;
- include date, transport mode, commands without secrets, and redacted result.

### Live Chat Run

Prerequisites:

- bot is present in target chat according to MAX rules;
- `MAX_TRANSPORT_MODE=long_polling`;
- no real chat IDs in repository.

Expected result:

- chat message or supported chat event reaches runtime;
- bot replies visibly with:

```text
RecipientType: chat_id
To: <redacted>
```

Evidence:

- create sanitized test-run document in `docs/test-runs/`;
- update `docs/project-acceptance.md` evidence map only after live evidence exists.

## Out Of Scope

- Webhook server implementation.
- `POST /subscriptions` automation.
- Persistent marker storage across process restarts.
- Queue, database, delivery journal or retry scheduler.
- Moving Zabbix alert delivery out of `src/zabbix-media-type/max-webhook.js`.

## Review Checklist

- [x] First live transport mode selected: `long_polling`.
- [x] Webhook behavior is explicit: `Не реализовано: transport mode webhook`.
- [x] Inbound Long Polling contract documented.
- [x] Outbound message response contract documented.
- [x] Fake API and live test plan documented.
- [x] No real tokens, `user_id`, `chat_id`, internal URLs or organization names are included.
- [x] No live network code is added by Task 18.2.
