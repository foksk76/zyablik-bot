# ADR-0009: Place the long-polling loop in the bot-platform runtime entrypoint

## Status
Accepted

## Date
2026-07-08

## Context
Task 14.1 will add a safe test bot that runs in the current outbound-only LXC. That runtime uses `long_polling` for development and testing, while `webhook` remains a separate ingress-only path for production.

The remaining architectural question is where the long-polling loop should live:

- inside the existing bot-platform runtime entrypoint;
- or in a separate adapter/process boundary.

The current codebase already has a single bot-platform runtime entrypoint and a transport-mode switch. Adding a second runtime boundary for long polling would introduce unnecessary process and dependency split for a mode that does not need inbound ingress.

## Decision
Keep the long-polling loop in the existing bot-platform runtime entrypoint path, not in a separate adapter process.

The implementation may split internal logic into helpers or runner modules, but the operational boundary remains one bot-platform runtime that chooses `long_polling` or `webhook` from configuration.

## Minimal Runtime Flow

For `Task 14.1`, the minimal live flow is:

1. Read `MAX_TRANSPORT_MODE` from environment.
2. Start the existing bot-platform entrypoint in `long_polling` mode.
3. Receive MAX updates through outbound polling only.
4. Normalize the payload with `normalizeMaxEvent()`.
5. Route the internal event through `event-router`.
6. Handle the event with the identity plugin.
7. Build the synthetic outbound payload.
8. Keep the flow inside the same runtime process and do not introduce a separate polling adapter or process boundary.

## Alternatives Considered

### Separate long-polling adapter/process

- Pros: isolates transport-specific logic.
- Cons: adds another runtime boundary, more wiring, and a second place for mode selection.
- Rejected: unnecessary complexity for the safe test-bot path.

### Separate service for long polling

- Pros: strong isolation.
- Cons: duplicates service lifecycle management and fragments the runtime model.
- Rejected: the bot-platform already has a shared runtime entrypoint and a clear mode switch.

## Consequences

- `Task 14.1` should extend the existing runtime path instead of creating a new adapter layer.
- `systemd` can manage one service for the safe test bot.
- `webhook` remains a separate ingress concern and does not inherit the long-polling loop boundary.
- Future refactoring may extract helper modules, but not a second runtime/process boundary unless a new ADR justifies it.
