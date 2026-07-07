# Test runs

Раздел хранит инструкции и обезличенные результаты ручных прогонов.

Автоматический механизм тестирования здесь не определяется. Если потребуется локальный test harness, Zabbix container или другой runtime, сначала создается ADR в `docs/decisions/`.

## Текущие прогоны

- [`max-media-type-manual-run.md`](max-media-type-manual-run.md) — ручная проверка Zabbix Media type `MAX` на тестового получателя.
- [`max-problem-recovery-run.md`](max-problem-recovery-run.md) — ручная проверка доставки Problem и Recovery уведомлений через Zabbix Action.
- [`final-acceptance-run.md`](final-acceptance-run.md) — финальный приемочный прогон первого этапа по `docs/project-acceptance.md`.
- [`task-12-baseline.md`](task-12-baseline.md) — baseline перед кодом Task 12; `npm test` ожидает подтверждения локально или через GitHub Actions.
