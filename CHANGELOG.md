# Changelog

Все заметные изменения проекта фиксируются в этом файле.

Формат: версия, дата, краткое описание изменений.

## [1.0.0] - 2026-07-20

### Added
- Convention-based plugin loader for bot-platform (ADR-0012)
- Auto-discovery of plugins from `src/bot-platform/plugins/{name}/`
- Bot command system with static command registry and pipeline dispatch (ADR-0018)
- Outbound response shape extensibility — text-only responses (ADR-0019)
- Welcome message on `bot_added` events (ADR-0020)
- Welcome message on `bot_started` events (ADR-0021)
- Multi-source HTTP-ingress: `POST /ingest` with JWT authentication (ADR-0022, ADR-0023)
- Ingress normalizer pipeline: generic ingest + Zabbix normalizers (ADR-0022)
- JWT verification via `@okta/jwt-verifier` (ADR-0024, exception from ADR-0015)
- SQLite-based delivery log via `better-sqlite3` (ADR-0025, exception from ADR-0015)
- Delivery queue with at-least-once guarantee, retry and exponential backoff (ADR-0028)
- Lifecycle audit trail: audit + trace logging for incident investigation (ADR-0029)
- Outbound rate limiter for 429 MAX API protection (ADR-0030)
- `src/zabbix-media-type/bot-platform-ingest.js` — Zabbix 7.2 webhook for ingress path
- NanoIDP setup for MVP stand (Docker Compose, OIDC, JWKS, client_credentials)
- IdP comparison and migration guide: NanoIDP → Keycloak / Authentik
- `format` field passthrough through entire pipeline: webhook → normalizer → event-contract → HTTP-server → outbound-client
- Manual `base64Encode()` function for Zabbix Duktape sandbox (no Buffer support)

### Changed
- Non-command text now returns "Unknown command" instead of identity response
- Pipeline dispatch replaces `router.route()` for all inbound events (ADR-0018)
- Removed dead `routeHandlers` parameter from pipeline callers and runtime
- Dry-run pipeline now accepts `outboundClient` and `commandRegistry` via options (DI parity with live pipeline)
- Removed stale `router.route()` references from documentation (ADR-0020, ADR-0021, project-context, bot-commands)
- Removed unnecessary shallow copy in command-registry `lookup()`
- Dry-run response now includes `event` field for parity with live pipeline
- `max-webhook.js` and `bot-platform-ingest.js` now inline `buildAlertMessage()` (no shared module)
- Deleted `src/shared/zabbix-message.js` after inlining into both webhooks
- Replaced `Buffer.from(...)`/`Buffer.toString('base64')` with manual `base64Encode()` for Zabbix 7.2 Duktape compatibility
- Simplified `httpRequest()` — always POST, removed dead GET branch
- Wrapped `JSON.parse()` calls in try/catch with descriptive error messages
- Fixed parameter typo `imestamps` → `Timestamps`
- License changed to Apache 2.0 with branding «Зяблик / Zyablik» (ADR-0031)
- Repository renamed from `max-bot-platform` to `zyablik-bot`
- Project re-licensed under Apache License 2.0 (EN + RU)

### Documentation
- Zabbix 7.2 compatibility notes for both webhook scripts
- Multi-source ingress architecture (ADR-0022) in project-context
- NanoIDP setup and management guide
- Delivery queue configuration guide
- Audit trail configuration (`LOG_AUDIT`, `LOG_TRACE` env vars)
- Outbound rate limiter configuration
- Updated `docs/zabbix-media-type.md` with `Audience` parameter, `bot-platform-ingest.js` reference
- Updated `INSTALL.md` with HTTP-ingress and queue setup sections

### Fixed
- Zabbix 7.2 Webhook sandbox compatibility: removed `async/await`, `Promise`, `require('node:*')`
- NanoIDP token request: added `client_id`, `client_secret`, `audience` to POST body
- `Buffer` API incompatibility in Duktape sandbox — replaced with manual base64 encoding
- HTML tags rendering in delivered messages — added `format` passthrough

### Completed
- Task 18.9: Live personal-dialog `user_id` verification (2026-07-15 10:50 UTC)
- Task 18.10: Live chat `chat_id` verification and acceptance (2026-07-15 10:51 UTC)

## [0.1.0] - 2026-07-13

### Added
- Zabbix Media type `MAX` webhook script for alert delivery to MAX messenger
- MAX Identity Bot platform with dry-run and live runtime modes
- Long polling transport for MAX Bot API integration
- Identity plugin for retrieving `user_id` / `chat_id` from MAX
- Live runtime config with secret validation
- Injectable HTTP boundaries for safe testing without real API calls
- Operational runbooks for bot-platform stand and live identity bot
- Node.js policy tests and GitHub Actions verification
- Security review and failure-mode tests for live runtime

### Changed
- Migrated repository verification from shell scripts to Node.js tests (ADR-0004)
- Separated accepted Zabbix->MAX delivery scope from live identity bot work (ADR-0010)
- Selected long polling as first live transport mode (ADR-0011)

### Documentation
- Comprehensive project documentation including installation, runbooks, and test-runs
- Architecture Decision Records (ADRs) for major technical decisions
- Sanitized test runs for all integration scenarios
- Project acceptance criteria and evidence maps

### Security
- Secret validation prevents runtime startup without required credentials
- Redacting logger boundary prevents secret leakage in logs
- Safe HTTP boundaries ensure tests never call real external APIs
- Webhook transport mode explicitly stubbed to prevent accidental use
