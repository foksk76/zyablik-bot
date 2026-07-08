# Task 13 transport mode switch run

Документ фиксирует результат добавления `MAX_TRANSPORT_MODE` для bot-platform.

## Статус

```text
Done
```

## Дата

```text
2026-07-08
```

## Изменения

```text
src/bot-platform/core/config.js
src/bot-platform/core/index.js
src/bot-platform/core/README.md
src/bot-platform/transports/max/index.js
src/bot-platform/app.js
tests/bot-platform/config.test.js
tests/bot-platform/scaffold.test.js
examples/bot-platform/env.example
examples/bot-platform/README.md
docs/third-stage-stand-and-agent.md
docs/decisions/ADR-0007-use-long-polling-by-default-for-bot-platform-development.md
docs/task-13-breakdown.md
```

## Проверка

```text
npm test: pass
MAX_TRANSPORT_MODE default: long_polling
MAX_TRANSPORT_MODE webhook override: pass
LXC outbound-only suitability for long_polling: documented
webhook production path: documented
```

## Вывод

```text
Task 13 transport mode switch: pass
```
