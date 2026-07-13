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

### Pending
- Task 18.9: Live personal-dialog `user_id` verification
- Task 18.10: Live chat `chat_id` verification and acceptance
