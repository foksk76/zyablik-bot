# Bot-platform examples

Этот каталог содержит synthetic fixtures для локальных тестов bot-platform.

## Fixtures

| File | Purpose |
|---|---|
| `max-inbound-user.fixture.json` | Synthetic personal dialog message. Not real MAX payload. |
| `max-inbound-chat.fixture.json` | Synthetic group chat message. Not real MAX payload. |

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
