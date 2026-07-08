# Task 14 safe test bot run

Документ фиксирует локальную реализацию safe test bot для outbound-only LXC и текущее состояние проверки.

## Статус

```text
Implemented locally / current operator host smoke pass / LXC manual run pending
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
timeout 1s node src/bot-platform/app.js: starts safe test service in long_polling mode with synthetic updates
long polling loop recovery: pass
src/zabbix-media-type/max-webhook.js: unchanged
real secrets: none
callback URL: none
chat_id/user_id: none
systemd unit: documented
current operator host: pass with /root checkout and nvm node path
target outbound-only LXC manual run: pending
```

## Вывод

```text
Safe test bot runtime is implemented and covered by local tests. The current operator host smoke check passed with /root checkout and the service is active; target outbound-only LXC verification remains pending.
```
