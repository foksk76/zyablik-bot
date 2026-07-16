# Test runs

Раздел хранит инструкции и обезличенные результаты ручных прогонов.

Автоматический механизм тестирования здесь не определяется. Если потребуется локальный test harness, Zabbix container или другой runtime, сначала создается ADR в `docs/decisions/`.

## Приемка Zabbix -> МАХ

- [`max-media-type-manual-run.md`](max-media-type-manual-run.md) — ручная проверка Zabbix Media type `MAX` на тестового получателя.
- [`max-problem-recovery-run.md`](max-problem-recovery-run.md) — ручная проверка доставки Problem и Recovery уведомлений через Zabbix Action.
- [`final-acceptance-run.md`](final-acceptance-run.md) — исторический финальный прогон доставки Zabbix -> МАХ и dry-run/safe-test статуса bot-platform; не является live-приемкой MAX Identity Bot после ADR-0010.

## Live MAX Identity Bot

- [`task-18-live-acceptance-run.md`](task-18-live-acceptance-run.md) — live-приемка MAX Identity Bot: user_id и chat_id подтверждены (2026-07-15).

Live-приемка выполнена. Бот получает входящие сообщения и отправляет ответы через MAX Bot API.

## Bot-platform Dry-run И Safe-test

Tasks 12-14 выполнены и подтверждены. Промежуточные прогоны удалены из истории.
