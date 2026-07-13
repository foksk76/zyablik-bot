# Identity Plugin: live transport mode and test plan

Документ фиксирует contract-first план для первой live-реализации MAX Identity Bot.

## Status

```text
Ready for implementation: long_polling selected, webhook is explicit Not Implemented stub.
```

## Source Basis

Основной source gate закрыт в `docs/identity-plugin/max-api-source.md`.

ADR: `docs/decisions/ADR-0011-use-long-polling-for-first-live-max-identity-bot.md`

## Selected Transport

First live implementation: `MAX_TRANSPORT_MODE=long_polling`

Explicit unsupported mode: `MAX_TRANSPORT_MODE=webhook`

Expected behavior for `webhook`:

```text
Не реализовано: transport mode webhook
```

## Public Runtime Contract

### Environment Inputs

| Variable | Required | Values | Notes |
|---|---:|---|---|
| `MAX_TRANSPORT_MODE` | yes | `long_polling`, `webhook` | `webhook` returns Not Implemented stub |
| `MAX_BOT_TOKEN` | yes for live mode | non-empty string | Never log raw value |
| `MAX_API_URL` | optional | HTTPS URL | Default: `https://platform-api2.max.ru` |
| `MAX_POLL_LIMIT` | optional | integer `1..1000` | Default should not exceed official limit |
| `MAX_POLL_TIMEOUT_SECONDS` | optional | integer `0..90` | Default should not exceed official limit |
| `MAX_POLL_TYPES` | optional | comma-separated update types | Initial: `message_created,bot_started,bot_added` |

### Runtime Mode Result

Config boundary should expose a discriminated mode result:

```text
{ mode: "long_polling", ...validatedLongPollingConfig }
{ mode: "webhook", error: "Не реализовано: transport mode webhook" }
```

### Error Semantics

All config and transport errors must be:
- deterministic;
- safe to log;
- free of raw token, IDs, internal URL and organization names.

Error codes:
- `TRANSPORT_NOT_IMPLEMENTED`: webhook mode selected
- `CONFIG_VALIDATION_ERROR`: invalid config
- `MAX_API_ERROR`: API request failed

## Long Polling Inbound Contract

Request: `GET /updates` with `Authorization: <token>`

Runtime rules:
- use `types=message_created,bot_started,bot_added`;
- persist `marker` in memory;
- send previous `marker` on next poll;
- validate responses before routing;
- never commit live payloads with real secrets.

## Outbound Response Contract

Request: `POST /messages?user_id=<id>` or `POST /messages?chat_id=<id>`

Body:

```json
{
  "text": "RecipientType: user_id\nTo: <redacted>",
  "notify": true,
  "format": "markdown"
}
```

Rules:
- `RecipientType` must match scenario;
- `To` from validated event data;
- text within 4000 character limit;
- injectable HTTP boundary for tests;
- logs redact secrets.

## Webhook Stub Contract

Required behavior:
- config accepts `webhook` enum value;
- runtime fails before server startup;
- message: `Не реализовано: transport mode webhook`.

Forbidden:
- silent fallback to `long_polling`;
- partial server startup;
- `POST /subscriptions` calls.

## Test Plan

### Fake API Tests

Config validation:
- validates `long_polling` mode;
- validates default API URL;
- rejects missing token without printing it;
- returns `TRANSPORT_NOT_IMPLEMENTED` for `webhook`.

Outbound client:
- builds `POST /messages` with fake HTTP;
- sends `Authorization` without logging;
- maps HTTP errors to safe errors.

Inbound updates:
- builds `GET /updates` with parameters;
- stores `marker` in memory;
- validates response shape.

### Live Personal Dialog Run

Prerequisites:
- real token in local environment only;
- `MAX_TRANSPORT_MODE=long_polling`;
- no real IDs in repository.

Expected result:
```text
RecipientType: user_id
To: <redacted>
```

### Live Chat Run

Prerequisites:
- bot in target chat;
- `MAX_TRANSPORT_MODE=long_polling`;
- no real chat IDs in repository.

Expected result:
```text
RecipientType: chat_id
To: <redacted>
```

## Out Of Scope

- Webhook server implementation.
- `POST /subscriptions` automation.
- Persistent marker storage.
- Queue, database, delivery journal.
- Moving Zabbix alert delivery.

## Review Checklist

- [x] First live transport mode selected: `long_polling`.
- [x] Webhook behavior explicit: `Не реализовано: transport mode webhook`.
- [x] Inbound contract documented.
- [x] Outbound contract documented.
- [x] Test plan documented.
- [x] No real secrets included.
