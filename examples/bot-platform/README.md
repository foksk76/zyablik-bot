# Bot-platform examples

Этот каталог содержит synthetic fixtures для локальных тестов bot-platform.

## Fixtures

| File | Purpose |
|---|---|
| `max-inbound-user.fixture.json` | Synthetic personal dialog message. Not real MAX payload. |
| `max-inbound-chat.fixture.json` | Synthetic group chat message. Not real MAX payload. |
| `max-inbound-id-command.fixture.json` | Synthetic /id command in personal dialog. Not real MAX payload. |

## Rules

- Fixtures are synthetic and safe for repository storage.
- Fixtures are not real MAX payloads.
- Do not copy real bot events into this directory.
- Do not add real tokens, callback URLs, recipient identifiers or internal addresses.
- Use placeholder values in the form `<synthetic-...>`.

## Intended use

These files are used for tests and future normalizer development:

```text
synthetic MAX event -> event normalizer -> internal event contract
```

Task 12.3 only adds fixtures and tests for their presence and safety. The normalizer is implemented in the next task.

## Local dry-run

Use the fixtures with the CLI entrypoint:

```bash
node src/bot-platform/app.js examples/bot-platform/max-inbound-user.fixture.json
node src/bot-platform/app.js examples/bot-platform/max-inbound-chat.fixture.json
```

The output is synthetic and safe for repository storage. Do not add real tokens, callback URLs, recipient identifiers or internal addresses.

## Transport mode

The bot-platform uses `MAX_TRANSPORT_MODE` to choose the runtime transport mode:

- `long_polling` — default for development and testing in the current LXC;
- `webhook` — reserved live mode and current not-implemented stub: `Не реализовано: transport mode webhook`.

Keep the value in the local `.env` file and out of version control.

## Safe test bot service

For the outbound-only LXC, run the safe test bot as a `systemd` service:

```text
systemd/zyablik-bot.service
```

The service runs `src/bot-platform/app.js` with `MAX_TRANSPORT_MODE=long_polling` from a local `.env` file. It stays in the same runtime process, keeps inbound webhook disabled, and processes synthetic updates safely.
