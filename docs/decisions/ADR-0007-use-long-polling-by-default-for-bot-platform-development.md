# ADR-0007: Use long polling by default for bot-platform development and testing

## Status

Принято.

## Date

2026-07-08

## Context

The current LXC container in Proxmox is outbound-only:

- it has a gray IP behind NAT;
- it does not accept inbound connections;
- it has no DNS name;
- it does not expose a public port.

That setup is not suitable for a real inbound webhook callback path, but it is suitable for development and testing when the bot runtime uses outbound connectivity.

The bot-platform already has a safe local webhook handler and a dry-run pipeline. The remaining question is which transport mode should be the default for development and testing, and how to switch to the production webhook path later.

Node.js loads runtime configuration from environment variables via `process.env`, which makes an environment-based mode switch straightforward.

## Decision

Use `long_polling` as the default bot-platform transport mode for development and testing.

Use `webhook` only when the runtime is deployed into an ingress-capable production environment.

Expose the mode as a configuration value loaded from environment:

```text
MAX_TRANSPORT_MODE=long_polling
MAX_TRANSPORT_MODE=webhook
```

The selected mode is treated as a runtime configuration value, not as a compile-time branch. The default is `long_polling`.

## Why this fits the current LXC

The current LXC can reach the outside world, but it cannot receive inbound traffic. Long polling uses outbound connectivity, so it fits this environment for development and testing.

Webhook requires inbound reachability, DNS, and an exposed port. Those properties are not present in the current LXC, so webhook remains the production-only option.

## Consequences

- Development and testing can proceed in the current LXC without exposing an inbound endpoint.
- Production still requires a reachable webhook ingress path.
- The transport selection must be explicit in `.env` so the runtime behavior is obvious.
- The codebase must avoid assuming that webhook is available in every environment.

## Alternatives Considered

### Webhook as default

Rejected for the current LXC because inbound reachability is absent.

### Hard-coded transport mode

Rejected because it would make dev/test and production environments harder to separate cleanly.

### Separate binaries for long polling and webhook

Rejected for now because a single runtime with explicit env-based mode selection is simpler and easier to operate.

