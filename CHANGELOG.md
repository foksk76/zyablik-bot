# Changelog

Все заметные изменения проекта фиксируются в этом файле.

Формат: версия, дата, краткое описание изменений.

## [Unreleased]

### Added
- Queue Monitor Dashboard (ADR-0034): readonly SQLite replica, `/api/metrics/*` endpoints (summary, discovery, timeseries, top, errors), `/readyz`, Bearer Token auth, stdlib HTTP server, React SPA UI
- Session auth как альтернатива Bearer для dashboard metrics (ADR-0035)
- Дизайн-система для React UI queue-monitor: design tokens, shadcn/ui, Lucide, Storybook (ADR-0036)
- SSRF-защита IdP-эндпоинтов + `IDP_RELAX_SSRF` для MVP стенда (ADR-0037)
- Hand-rolled JWT-verifier для ingress layer, RS256/384/512, JWKS cache (ADR-0038)
- Rate limiting для auth-эндпоинтов dashboard, sliding window + concurrency cap (ADR-0039)
- Улучшения UI: error drill-down, session redirect, alert cleanup, configurable limits, countdown, error boundary, dark/light theme (ADR-0040)
- Глобальный фильтр времени: TimeRangeBar, предустановки 1ч–30д, absolute range, drag-to-pan (ADR-0041)
- Web interface: navigation shell + archive (React Router hash-based, archive API, retry через queueStore, backend export) (ADR-0042)
- Zabbix Monitoring Template: agent-less LLD-шаблон 7.0+ на `/api/metrics/*` и `/readyz`, смена `{#METRIC}` на `pending`, триггеры/графики/дашборд, тестовый Zabbix 7.2 в Docker (ADR-0043)

### Changed
- HTTP-серверы бота (ingress `8443`, dashboard `9000`) публикуются по HTTPS через Nginx reverse proxy на порту `443` (ADR-0044); `IDP_REDIRECT_URI` переводится на `https://` (Secure cookie)
- `{#METRIC}` discovery: префикс `queue.` удалён — ключи совпадают с полями `/summary` (ADR-0043, breaking change)
- Dashboard-сервер объединён с bot-platform через `src/queue-monitor/` facade и координацию shutdown

### Documentation
- ADR-0034..0043 добавлены в `docs/decisions/`
- `docs/zabbix-monitoring-template.md` — импорт шаблона, макросы, триггеры, quirka Zabbix
- `INSTALL.md` — разделы dashboard, мониторинг Zabbix, очередь, ingress
- `docs/runbooks/nginx-reverse-proxy.md` — установка и настройка Nginx reverse proxy для HTTP-серверов бота (ingress `8443`, dashboard `9000`, TLS-терминирование, ADR-0044)
- ADR-0044 — Nginx reverse proxy для HTTP-серверов bot-platform
- Design tokens и компоненты задокументированы (Storybook)

### Fixed
- Ограничение `limit` в SQLite-запросах (clamp, защита от `LIMIT -1`)
- Парсинг malformed URI в `parseQuery` — не роняет процесс
- Graceful shutdown: координация worker/queue/ingress (BUG C)
- Stale processing-строки после краша процесса (BUG A, ADR-0028)
- Skip failed update вместо блокировки батча в long polling (BUG B)

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
