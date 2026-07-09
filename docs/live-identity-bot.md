# Live MAX Identity Bot

Документ фиксирует текущий статус live-сценария бота МАХ для получения `user_id` / `chat_id`.

## Текущий статус

Live-сценарий пока не принят.

Принято и проверено:

- Zabbix отправляет уведомления в МАХ через Media type `Webhook`;
- bot-platform умеет обрабатывать synthetic fixtures;
- identity plugin формирует текст ответа с `RecipientType` и `To`;
- safe test bot запускается в `long_polling` режиме с synthetic updates;
- секреты и реальные идентификаторы не хранятся в репозитории.

Не подтверждено для live-приемки:

- получение реального входящего сообщения от МАХ;
- отправка реального ответа через MAX Bot API;
- видимый ответ пользователю с `RecipientType: user_id`;
- видимый ответ в chat-сценарии с `RecipientType: chat_id`.

## Критерий приемки

Актуальное правило зафиксировано в:

```text
docs/decisions/ADR-0010-require-live-evidence-for-max-identity-bot-acceptance.md
docs/project-acceptance.md
```

Dry-run, synthetic fixtures и safe test bot не считаются достаточным доказательством live-приемки.

## Рабочая задача

Live-реализация ведется отдельной задачей:

```text
docs/task-18-breakdown.md -> sprint breakdown
tasks/todo.md -> Task 18.1-18.10
tasks/plan.md -> Phase 6: Live MAX Identity Bot
```

Перед кодом нужно подтвердить официальный способ MAX Bot API для:

- получения входящих событий;
- отправки ответа;
- read/ack, если этот признак должен поддерживаться.

Если read/ack не подтвержден официальной документацией, отсутствие отметки "прочитано" не блокирует приемку. Блокирует отсутствие видимого ответа бота.

## Что проверять при отладке

Если пользователь отправил сообщение боту, но ответа нет:

1. Проверить, запущен ли runtime в режиме, который реально получает события от MAX.
2. Проверить, что источник входящих событий не synthetic fixtures.
3. Проверить, что outbound client делает сетевой вызов MAX Bot API.
4. Проверить, что `MAX_BOT_TOKEN` и другие секреты заданы только локально.
5. Проверить логи без раскрытия токенов, `user_id`, `chat_id`, внутренних URL и организационных названий.

## Документы по теме

- [`third-stage-acceptance.md`](third-stage-acceptance.md) — исторические критерии dry-run/safe-test MVP bot-platform.
- [`third-stage-implementation-plan.md`](third-stage-implementation-plan.md) — план третьего этапа и dry-run pipeline.
- [`runbooks/INSTALL.md`](runbooks/INSTALL.md) — установка safe test bot в outbound-only LXC.
- [`test-runs/task-14-safe-test-bot-run.md`](test-runs/task-14-safe-test-bot-run.md) — проверка safe test bot.
- [`test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) — историческая приемка доставки Zabbix -> МАХ, не live-приемка identity bot.
