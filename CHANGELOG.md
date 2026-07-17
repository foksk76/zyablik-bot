# Changelog

Все заметные изменения проекта фиксируются в этом файле.

Формат: версия, дата, краткое описание изменений.

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

## [Unreleased]

### Added
- Convention-based plugin loader for bot-platform (ADR-0012)
- Auto-discovery of plugins from `src/bot-platform/plugins/{name}/`
- Bot command system with static command registry and pipeline dispatch (ADR-0018)
- Outbound response shape extensibility — text-only responses (ADR-0019)
- Welcome message on `bot_added` events (ADR-0020)
- Welcome message on `bot_started` events (ADR-0021)

### Changed
- Non-command text now returns "Unknown command" instead of identity response
- Pipeline dispatch replaces `router.route()` for all inbound events (ADR-0018)
- Removed dead `routeHandlers` parameter from pipeline callers and runtime
- Dry-run pipeline now accepts `outboundClient` and `commandRegistry` via options (DI parity with live pipeline)
- Removed stale `router.route()` references from documentation (ADR-0020, ADR-0021, project-context, bot-commands)
- Removed unnecessary shallow copy in command-registry `lookup()`
- Dry-run response now includes `event` field for parity with live pipeline

### Completed
- Task 18.9: Live personal-dialog `user_id` verification (2026-07-15 10:50 UTC)
- Task 18.10: Live chat `chat_id` verification and acceptance (2026-07-15 10:51 UTC)
