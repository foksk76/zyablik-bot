# Bot Commands System

**Status:** Implemented (sprint-13, branch `feature/bot-commands`)

## Problem Statement

How might we let users in MAX chats self-discover bot capabilities via interactive commands (e.g., `/help`, `/id`, `/status`) without changing the existing plugin interface or architectural contracts?

## Recommended Direction

**Pipeline Branch + Static Command Registry in `core/`.**

A single `core/command-registry.js` file holds all available commands as a plain object. A command-parsing function checks `event.message.text` for a `/` prefix, extracts the command name, looks it up in the registry, and calls its handler. This check happens in `live-pipeline.js` — if a command matches, the pipeline short-circuits; otherwise it returns "Unknown command" (non-command text no longer flows through the identity route).

Built-in commands (`/help`, `/status`) are defined in the registry with handlers in `core/`. The identity plugin gets an `/id` command registered in the same file. The outbound client gains support for text-only responses (no `zabbix` field required) so command replies don't need the identity response shape.

The `live-pipeline.js` event filter expands to include `bot_added` and `bot_started` events, which trigger an auto-response with a welcome message (`Ready to help.`).

**Why this direction:** The project's identity is deliberate minimalism — zero dependencies (ADR-0015), convention-based loader (ADR-0012), no middleware (rejected in ADR-0012). A static registry keeps all those contracts intact. Adding a new command is a one-line edit to a single file. The plugin interface stays `(event) => response` — plugins don't need to know commands exist.

**ADRs:**
- ADR-0018 — pipeline command dispatch (ветвление в pipeline)
- ADR-0019 — outbound response shape extensibility (text-only ответы)
- ADR-0020 — expanded pipeline event scope (`bot_added` auto-response)
- ADR-0021 — expanded pipeline event scope (`bot_started` auto-response)

## Key Assumptions to Validate

- [ ] **Users will actually type `/` commands** — validate by checking if MAX users are familiar with slash-command UX from other bots. If not, a different trigger (e.g., mention + keyword) may be needed.
- [ ] **A static registry is sufficient** — if commands grow beyond ~10, a distributed approach (Direction A from ideation) becomes necessary. For now, 3-5 commands are expected.
- [ ] **Outbound client can handle text-only responses without breaking identity flow** — the current `buildMaxOutboundPayload()` in `outbound-client.js` hardcodes identity response shape. Adding a text-only path must not regress existing identity behavior.
- [ ] **`bot_added` events are reliably delivered** — the current filter ignores them. If MAX doesn't reliably deliver `bot_added` payloads, the auto-help-on-add feature fails silently.
- [ ] **Empty `event.message.text` is handled gracefully** — the normalizer defaults to `''`. The command parser must not crash on empty input.

## MVP Scope

**In:**
- `core/command-registry.js` — static command map with `/help`, `/status`, `/id`
- `core/command-parser.js` — parse `/command [args]` from `event.message.text`
- Command dispatch in `live-pipeline.js`
- Command dispatch in `dry-run-pipeline.js` (for testing)
- `outbound-client.js` — text-only response support (new `kind: 'text'` or similar)
- `live-pipeline.js` — expand `REPLY_UPDATE_TYPES` to include `bot_added`
- `/help` auto-response on `bot_added` events
- Unknown command reply for unrecognized input
- Tests for parser, registry, and pipeline integration

**Out:**
- Plugin-level command registration (future iteration if needed)
- Plugin interface changes (`commands` field)
- Plugin loader changes
- Arguments/parameters beyond the command name (no `/status --verbose` yet)
- Per-user or per-chat command state
- Command rate limiting or permissions
- Inline keyboard or button interactions

## Not Doing (and Why)

- **Plugin-level `commands` export** — Changes the ADR-0012 plugin contract. A static registry is simpler and sufficient for 3-5 commands. Revisit if plugin count exceeds ~8.
- **Command middleware chain** — Explicitly rejected in ADR-0012. The pipeline `if` branch achieves the same result without architectural overhead.
- **Plugin loader picking up `commands.js` files** — Convention-based discovery is elegant but adds loader complexity. Not worth it until multiple independent plugin authors need to add commands without coordinating.
- **Command arguments/parameters** — Scope creep. MVP validates whether users use `/` at all. Arguments are a Phase 2 feature.
- **Permission/ACL system** — The project serves a small team. Authorization can be added later if the bot is exposed to untrusted users.

## Open Questions (Resolved)

- **MAX API `bot_added` delivery:** Confirmed via MAX API docs (`https://dev.max.ru/docs-api/objects/Update`). The `bot_added` event is a supported update type, delivered via Long Polling and Webhook. Payload: `{ update_type: "bot_added", timestamp, chat_id, user: { user_id }, is_channel }`. The event is collected in `DEFAULT_MAX_POLL_TYPES` (`config.js:8`) и теперь обрабатывается — `REPLY_UPDATE_TYPES` в `pipeline-constants.js` расширено (ADR-0020). Нормализатор уже поддерживал этот тип (`event-normalizer.js:51-56`).
- **Identity behavior:** `/id` is the only way to get identity info. Non-command text returns "Unknown command. Send /help for available commands." — the current catch-all identity response is removed.
- **Welcome message:** `bot_added` triggers: `Ready to help.` (short welcome, no `/help` output inline — user runs `/help` explicitly after seeing the welcome).
