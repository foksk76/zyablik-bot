# Task 13 breakdown: transport mode switch for bot-platform

Документ подготовлен после ADR-0007.

Цель — сделать явный переключатель режима bot-platform через `MAX_TRANSPORT_MODE`:

```text
long_polling (default for development/testing)
webhook (production ingress path)
```

## Контекст

Текущий LXC в Proxmox пригоден для outbound-only разработки и тестирования, но не для входящего webhook path. Поэтому режим транспорта должен быть конфигурируемым и безопасным по умолчанию.

## Task 13.1: Добавить `MAX_TRANSPORT_MODE` в config

Goal:

Считать режим транспорта из environment и валидировать допустимые значения.

Scope:

- добавить `MAX_TRANSPORT_MODE`;
- default = `long_polling`;
- допустимые значения: `long_polling`, `webhook`;
- не добавлять runtime polling loop.

Acceptance criteria:

- [ ] config читает `MAX_TRANSPORT_MODE`;
- [ ] invalid value rejected at config boundary;
- [ ] default остается `long_polling`;
- [ ] `npm test` проходит.

Verification:

- [ ] unit-тест default mode;
- [ ] unit-тест webhook override;
- [ ] unit-тест invalid mode;
- [ ] `npm test`.

Dependencies:

- Task 12.9.

Files likely touched:

```text
src/bot-platform/core/config.js
examples/bot-platform/env.example
tests/bot-platform/config.test.js
```

Estimated scope: S

## Task 13.2: Протянуть mode в app и transport metadata

Goal:

Показать выбранный режим в `app` и `MAX transport` metadata.

Scope:

- прокинуть mode из config в app;
- отразить mode в `createMaxTransport()`;
- не менять текущий dry-run pipeline behavior.

Acceptance criteria:

- [ ] app exposes selected transport mode;
- [ ] transport exposes selected transport mode;
- [ ] default mode visible in scaffold tests;
- [ ] `npm test` проходит.

Verification:

- [ ] unit-тест app default mode;
- [ ] unit-тест webhook mode;
- [ ] `npm test`.

Dependencies:

- Task 13.1.

Files likely touched:

```text
src/bot-platform/app.js
src/bot-platform/core/index.js
src/bot-platform/transports/max/index.js
tests/bot-platform/scaffold.test.js
```

Estimated scope: S

## Task 13.3: Обновить docs для dev/test long polling и prod webhook

Goal:

Явно описать, что long polling — default для разработки и тестирования в текущем LXC, а webhook нужен для production ingress.

Scope:

- обновить ADR и runbook notes;
- описать `.env` switch;
- не добавлять входящий webhook runtime.

Acceptance criteria:

- [ ] docs explain long_polling default;
- [ ] docs explain webhook production path;
- [ ] docs explain `.env` switch;
- [ ] `npm test` проходит.

Verification:

- [ ] docs review;
- [ ] `npm test`.

Dependencies:

- Task 13.2.

Files likely touched:

```text
docs/decisions/ADR-0007-use-long-polling-by-default-for-bot-platform-development.md
docs/third-stage-stand-and-agent.md
docs/runbooks/bot-platform-stand.md
examples/bot-platform/README.md
```

Estimated scope: S

## Checkpoint: After Task 13.2

- [ ] `MAX_TRANSPORT_MODE` is implemented and validated.
- [ ] Scaffold exposes the selected mode.
- [ ] `npm test` passes.

## Checkpoint: After Task 13.3

- [ ] Development/testing docs describe long polling default.
- [ ] Production docs describe webhook ingress.
- [ ] `npm test` passes.

