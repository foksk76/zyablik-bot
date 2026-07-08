# ADR-0006: Use LXC integration stand for MVP callback path

## Status

Принято.

## Date

2026-07-08

## Context

We need a repeatable integration run for the MVP `MAX Identity Bot` that goes beyond synthetic fixtures and verifies the real MAX callback path end to end.

This ADR is about the inbound `webhook` callback path only. Development and testing may use `long_polling` in the outbound-only LXC, but that does not satisfy the real callback-path requirement.

The current operator environment is a separate LXC container in Proxmox. That is a suitable place to host the integration stand because:

- it is already Linux-native;
- it supports a long-running service model;
- it can be kept reachable while integration tests are running;
- it is separate from the workstation used for day-to-day development.

The MVP codebase already has:

- a dry-run pipeline;
- a local inbound webhook handler;
- an outbound client contract;
- documentation for WSL/LXC stand usage.

What remains open is a safe, repeatable integration setup that uses a real MAX callback path without putting real secrets into the repository.

## Decision

Use the Proxmox LXC container as the integration stand for the MVP callback-path run.

The integration stand will:

- run the bot service as a long-lived process under `systemd`;
- keep secrets in a local `.env` file in the repository checkout;
- keep that `.env` file out of version control via `.gitignore`;
- expose the inbound webhook on a known local listener port;
- make that listener reachable through the selected network path for the MAX callback;
- use an explicit DNS name or routable address for the callback endpoint;
- verify the callback path first with a safe test bot, then with the real MAX callback flow.

## What “network, DNS, and ports are defined” means

For this project, “defined” means the integration stand has a concrete, documented answer to all three questions:

- **Network** — how the MAX service reaches the container and how the container reaches the MAX API or related services.
- **DNS** — which hostname or resolvable name points to the webhook endpoint used by MAX.
- **Ports** — which inbound port the service listens on and which port, NAT, or firewall rule exposes it externally.

If any of these are not known, the callback path is not ready and the integration run stays deferred.

## Implementation sequence

1. Provision or reuse the LXC container in Proxmox.
2. Install the runtime prerequisites for the MVP service.
3. Create a local `.env` file with synthetic or non-committable secrets.
4. Add or confirm `.gitignore` coverage for `.env`.
5. Decide the listener port and the external exposure path.
6. Configure DNS so the callback hostname resolves to the integration stand.
7. Install and enable a `systemd` unit for the bot process.
8. Run the safe test bot path and verify the synthetic flow.
9. Run the real MAX callback path.
10. Record the result in `docs/test-runs/`.

## Alternatives Considered

### WSL

WSL is good for development and local unit tests, but it is not the preferred integration stand for the real callback path because inbound reachability and long-running service behavior are less explicit than in the dedicated LXC container.

### Ad hoc shell process

Running the service manually in a shell is too fragile for a callback-path verification. It does not provide a stable service lifecycle or clear restart behavior.

### Docker-in-LXC

Not chosen for the MVP integration stand because it adds extra layers of setup that are not necessary for the current verification goal.

## Consequences

- The integration run becomes repeatable on the operator LXC container.
- Real secrets stay local to the stand and out of the repository.
- `systemd` becomes the documented service manager for the MVP integration run.
- The callback path must be explicitly provisioned before the run can proceed.
- If DNS, network reachability, or ports are not defined, the run stays deferred.
- `long_polling` remains a valid dev/test mode, but it does not replace the webhook ingress path.
