# Identity Plugin: MAX Bot API live source confirmation

Документ фиксирует pre-code gate для live MAX Identity Bot.

## Status

```text
Ready for live transport spec: official MAX Bot API source is confirmed.
```

Этот spec закрывает source gate для:

- получения входящих событий МАХ;
- отправки ответа через MAX Bot API;
- ack входящих событий.

Live network code должен следовать transport spec, потому что выбранный transport mode, test plan и runtime boundaries описаны отдельно.

## Required Source

Для продолжения нужен один из вариантов:

- официальная публичная документация MAX Bot API;
- утвержденная локальная спецификация MAX Bot API;
- обезличенная выдержка из внутренней документации, достаточная для реализации contracts.

Источник должен описывать:

- authentication format;
- base URL rules;
- endpoint или метод получения incoming updates;
- endpoint или метод отправки message response;
- request/response schemas;
- error format;
- rate limit или retry guidance, если есть;
- read/ack support или явное отсутствие такого метода.

## Current Known State

```text
Inbound live API: confirmed
Outbound live API: confirmed
Update ack API: confirmed for Long Polling marker and Webhook HTTP 200
Message read status API: not found in the official API index
Selected transport mode: long_polling
Live code allowed: yes, only under transport spec and implementation tasks
```

Zabbix alert delivery через `src/zabbix-media-type/max-webhook.js` уже подтверждена отдельно и не является источником contract для incoming bot messages.

## Confirmed Source

Source type: official public documentation.

Checked on: 2026-07-09.

Official source URLs:

- `https://dev.max.ru/docs-api` — API overview, base URL, auth, HTTP codes, transport guidance.
- `https://dev.max.ru/docs-api/methods/POST/messages` — outbound message sending.
- `https://dev.max.ru/docs-api/methods/GET/updates` — Long Polling updates.
- `https://dev.max.ru/docs-api/methods/POST/subscriptions` — Webhook subscription and delivery model.
- `https://dev.max.ru/docs-api/objects/Update` — event object and supported update types.
- `https://dev.max.ru/docs-api/objects/Message` — message object.
- `https://dev.max.ru/docs-api/objects/NewMessageBody` — outbound message body.
- `https://github.com/max-messenger/max-bot-api-client-java` — public MAX Bot API Java client README.
- `https://github.com/max-messenger/max-bot-sdk-java` — public SDK README with Long Polling and Webhook examples.

Repository stack:

- Node.js `>=20`;
- test runner: `node --test`;
- no runtime HTTP dependency is currently declared for live bot code.

## Contract Summary

### Base URL And Auth

- API calls use `https://platform-api2.max.ru`.
- Token must be passed in the `Authorization: <token>` header.
- Token in query parameters is not supported.
- Historical `platform-api.max.ru` traffic must be redirected to `platform-api2.max.ru` before 2026-07-19.

### Outbound Message

Method: `POST /messages`

Recipient query parameters:
- `user_id` for personal dialog response;
- `chat_id` for chat response.

Required headers:
- `Authorization: <token>`;
- `Content-Type: application/json`.

Body shape for identity response:

```json
{
  "text": "RecipientType: user_id\nTo: <redacted>",
  "notify": true,
  "format": "markdown"
}
```

Notes:
- `text` length limit is 4000 characters.
- `notify` defaults to `true`.
- `format` can be `markdown` or `html`.
- Result contains `message` object.

### Inbound Events: Long Polling

Method: `GET /updates`

Supported for development and testing. Official documentation says production integrations should use Webhook.

Parameters:
- `limit`: optional, `1..1000`, default `100`;
- `timeout`: optional, `0..90`, default `30`;
- `marker`: optional int64 or null;
- `types`: optional list such as `message_created`.

Ack semantics:
- Response includes `marker`.
- After a client sends a received `marker`, previous updates are considered read by the updates stream.
- If `marker` is missing or null, only the latest update is returned.

### Inbound Events: Webhook

Subscription method: `POST /subscriptions`

Delivery model:
- MAX sends HTTPS `POST` requests with an `Update` object to the configured endpoint.
- Endpoint must be available over HTTPS on port `443`.
- Self-signed certificates are not supported.
- Endpoint must return HTTP `200 OK` within 30 seconds.
- MAX retries failed delivery up to 10 times with exponential delay.

### Update And Message Shape

Relevant update types for identity bot:
- `message_created`;
- `bot_started`;
- `bot_added`.

Relevant fields:
- `Update.update_type`;
- `Update.timestamp`;
- `Update.chat_id` for chat/channel events;
- `Update.user`;
- `Message.sender`;
- `Message.recipient`;
- `Message.body`.

### Error And Rate Limits

Documented HTTP response codes:
- `200`: successful request;
- `400`: invalid request;
- `401`: authentication error;
- `404`: resource not found;
- `405`: method not allowed;
- `429`: too many requests;
- `503`: service unavailable.

Documented throughput guidance:
- Keep calls to `platform-api2.max.ru` at or below 30 rps.

### Read/Ack Status

Supported:
- Long Polling update acknowledgement through `marker`.
- Webhook event acknowledgement through HTTP `200 OK`.

Not found in official API index:
- dedicated API method to mark a user-visible chat message as read.

## Review Checklist

- [x] Source type selected.
- [x] Incoming events contract documented.
- [x] Outbound response contract documented.
- [x] Authentication and secret handling documented.
- [x] Error handling contract documented.
- [x] Read/ack status documented.
- [x] No real tokens, IDs, internal URLs or organization names included.
