# ADR-0008: Use the outbound-only LXC for safe test-bot development

## Status

Принято.

## Date

2026-07-08

## Context

The current operator environment is a separate LXC container in Proxmox with these properties:

- gray IP behind NAT;
- no inbound connections;
- no DNS name;
- no public port exposure.

This makes the container unsuitable for a real inbound `webhook` callback path, but suitable for outbound-only development and testing of a safe test bot.

The MVP needs two distinct operating modes:

- `long_polling` for development and testing in the current LXC;
- `webhook` for production ingress when a reachable endpoint exists.

The runtime also needs a durable service lifecycle and local-only secrets handling.

## Decision

Use the outbound-only LXC as the default integration stand for safe test-bot development.

The stand will:

- run the bot as a long-lived service under `systemd`;
- keep secrets in a local `.env` file in the repository checkout;
- exclude that `.env` file from version control with `.gitignore`;
- use `long_polling` for development and testing;
- keep `webhook` reserved for environments with explicit ingress.

## What “network, DNS, and ports are defined” means

For the `webhook` path, the stand is only valid if all three are explicitly known and documented:

- **Network** — how traffic reaches the container and how the container reaches the required external services.
- **DNS** — which hostname resolves to the webhook endpoint.
- **Ports** — which local listener port is used and how it is exposed externally.

If any of these are missing, the webhook callback path is not ready.

## Implementation sequence

1. Keep development and testing on `long_polling` in the current LXC.
2. Store all runtime secrets in a local `.env` file.
3. Add or confirm `.gitignore` coverage for `.env`.
4. Run the bot under `systemd` for repeatable start/stop behavior.
5. Verify the safe test-bot flow end to end.
6. Keep webhook ingress deferred until network, DNS, and ports are explicitly defined.

## Alternatives Considered

### Webhook in the current LXC

Rejected because the container cannot receive inbound traffic.

### Ad hoc shell process

Rejected because it is not stable enough for repeatable verification.

### Docker-in-LXC

Rejected for the current stage because it adds unnecessary complexity.

## Consequences

- Development and testing are possible in the current LXC without exposing inbound traffic.
- Secrets remain local to the stand and out of the repository.
- `systemd` becomes the documented service manager for the safe test bot.
- Webhook ingress stays a separate production concern.

