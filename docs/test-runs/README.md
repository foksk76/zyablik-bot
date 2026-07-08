# Test runs

Раздел хранит инструкции и обезличенные результаты ручных прогонов.

Автоматический механизм тестирования здесь не определяется. Если потребуется локальный test harness, Zabbix container или другой runtime, сначала создается ADR в `docs/decisions/`.

## Текущие прогоны

- [`max-media-type-manual-run.md`](max-media-type-manual-run.md) — ручная проверка Zabbix Media type `MAX` на тестового получателя.
- [`max-problem-recovery-run.md`](max-problem-recovery-run.md) — ручная проверка доставки Problem и Recovery уведомлений через Zabbix Action.
- [`final-acceptance-run.md`](final-acceptance-run.md) — финальный приемочный прогон первого этапа по `docs/project-acceptance.md`.
- [`task-12-baseline.md`](task-12-baseline.md) — baseline перед кодом Task 12.
- [`task-12-3-fixtures-run.md`](task-12-3-fixtures-run.md) — CI-прогон Task 12.3 после добавления synthetic MAX fixtures.
- [`task-12-4-normalizer-run.md`](task-12-4-normalizer-run.md) — CI-прогон Task 12.4 после реализации MAX event normalizer без сети.
- [`task-12-5-identity-run.md`](task-12-5-identity-run.md) — CI-прогон Task 12.5 после реализации identity formatter и handler.
- [`task-12-6-router-dry-run.md`](task-12-6-router-dry-run.md) — CI-прогон Task 12.6 после реализации event router и dry-run pipeline.
- [`task-12-7-stand-verification.md`](task-12-7-stand-verification.md) — проверка взаимозаменяемого WSL/LXC стенда для Task 12.7.
- [`task-12-8-agent-workflow-run.md`](task-12-8-agent-workflow-run.md) — проверка Codex agent workflow для Task 12.8.
- [`task-12-9-integration-deferred.md`](task-12-9-integration-deferred.md) — отложенный статус интеграционного прогона MVP без привязки к номеру задачи.
- [`task-12-9-config-logger-run.md`](task-12-9-config-logger-run.md) — реализация config и safe logger для breakdown `Task 12.9`.
- [`task-12-10-outbound-client-run.md`](task-12-10-outbound-client-run.md) — реализация outbound client contract для Task 12.10.
- [`task-12-11-inbound-webhook-run.md`](task-12-11-inbound-webhook-run.md) — реализация inbound webhook handler для Task 12.11.
- [`task-12-12-dry-run-cli-run.md`](task-12-12-dry-run-cli-run.md) — реализация app entrypoint для локального dry-run в Task 12.12.
- [`task-12-13-dry-run-docs-run.md`](task-12-13-dry-run-docs-run.md) — обновление документации запуска dry-run для Task 12.13.
- [`task-12-dry-run.md`](task-12-dry-run.md) — security review перед реальным API для Task 12.14.
- [`task-13-transport-mode-switch-run.md`](task-13-transport-mode-switch-run.md) — добавление `MAX_TRANSPORT_MODE` для bot-platform.
- [`task-14-safe-test-bot-planned.md`](task-14-safe-test-bot-planned.md) — placeholder для будущего safe test bot run в outbound-only LXC.
- [`task-14-safe-test-bot-run.md`](task-14-safe-test-bot-run.md) — локальная реализация safe test bot и текущий статус LXC manual run.
