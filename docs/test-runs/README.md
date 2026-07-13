# Test runs

Раздел хранит инструкции и обезличенные результаты ручных прогонов.

Автоматический механизм тестирования здесь не определяется. Если потребуется локальный test harness, Zabbix container или другой runtime, сначала создается ADR в `docs/decisions/`.

## Приемка Zabbix -> МАХ

- [`max-media-type-manual-run.md`](max-media-type-manual-run.md) — ручная проверка Zabbix Media type `MAX` на тестового получателя.
- [`max-problem-recovery-run.md`](max-problem-recovery-run.md) — ручная проверка доставки Problem и Recovery уведомлений через Zabbix Action.
- [`final-acceptance-run.md`](final-acceptance-run.md) — исторический финальный прогон доставки Zabbix -> МАХ и dry-run/safe-test статуса bot-platform; не является live-приемкой MAX Identity Bot после ADR-0010.

## Live MAX Identity Bot

Live test-run для Task 18 пока отсутствует.

- [`task-18-8-live-runtime-security-review.md`](task-18-8-live-runtime-security-review.md) — security review и failure-mode coverage для live runtime до live acceptance.

Для приемки нужен отдельный обезличенный документ, который подтвердит:

- реальное входящее сообщение МАХ;
- реальный ответ через MAX Bot API;
- ответ `RecipientType: user_id` в личном диалоге;
- ответ `RecipientType: chat_id` в chat-сценарии;
- отсутствие реальных токенов и идентификаторов в репозитории.

## Bot-platform Dry-run И Safe-test

Tasks 12-14 выполнены и подтверждены. Промежуточные прогоны удалены из истории.
