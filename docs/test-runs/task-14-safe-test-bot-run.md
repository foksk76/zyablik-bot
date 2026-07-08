# Task 14 safe test bot run

Документ фиксирует локальную реализацию safe test bot для outbound-only LXC и текущее состояние проверки.

## Статус

```text
Implemented locally / LXC manual run pending
```

## Дата

```text
2026-07-08
```

## Изменения

```text
src/bot-platform/runtime/long-polling.js
src/bot-platform/runtime/index.js
src/bot-platform/app.js
tests/bot-platform/long-polling-runtime.test.js
systemd/max-identity-bot.service
examples/bot-platform/README.md
examples/bot-platform/env.example
docs/runbooks/bot-platform-stand.md
docs/third-stage-stand-and-agent.md
```

## Проверка

```text
npm test: pass
node src/bot-platform/app.js: starts safe test service in long_polling mode
long polling loop recovery: pass
src/zabbix-media-type/max-webhook.js: unchanged
real secrets: none
callback URL: none
chat_id/user_id: none
systemd unit: documented
LXC manual run: pending in target outbound-only container
```

## Вывод

```text
Safe test bot runtime is implemented and covered by local tests. Manual LXC verification remains a follow-up step for the target outbound-only container.
```
