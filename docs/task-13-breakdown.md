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

Method:

```text
Config boundary update
```

Scope:

- добавить `MAX_TRANSPORT_MODE`;
- default = `long_polling`;
- допустимые значения: `long_polling`, `webhook`;
- не добавлять runtime polling loop.

Skill:

```text
agent-skills:api-and-interface-design
agent-skills:source-driven-development
```

Acceptance criteria:

- [x] config читает `MAX_TRANSPORT_MODE`;
- [x] invalid value rejected at config boundary;
- [x] default остается `long_polling`;
- [x] `npm test` проходит.

Verification:

- [x] unit-тест default mode;
- [x] unit-тест webhook override;
- [x] unit-тест invalid mode;
- [x] `npm test`.

Dependencies:

- Task 12.9.

Files likely touched:

```text
src/bot-platform/core/config.js
examples/bot-platform/env.example
tests/bot-platform/config.test.js
```

Estimated scope: S

Result:

```text
src/bot-platform/core/config.js
examples/bot-platform/env.example
tests/bot-platform/config.test.js
```

```text
npm test: pass
MAX_TRANSPORT_MODE default: long_polling
MAX_TRANSPORT_MODE webhook override: pass
```

```text
Task 13.1 config mode switch: pass
```

## Task 13.2: Протянуть mode в app и transport metadata

Goal:

Показать выбранный режим в `app` и `MAX transport` metadata.

Method:

```text
Incremental implementation
```

Scope:

- прокинуть mode из config в app;
- отразить mode в `createMaxTransport()`;
- не менять текущий dry-run pipeline behavior.

Skill:

```text
agent-skills:api-and-interface-design
agent-skills:incremental-implementation
```

Acceptance criteria:

- [x] app exposes selected transport mode;
- [x] transport exposes selected transport mode;
- [x] default mode visible in scaffold tests;
- [x] `npm test` проходит.

Verification:

- [x] unit-тест app default mode;
- [x] unit-тест webhook mode;
- [x] `npm test`.

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

Result:

```text
src/bot-platform/app.js
src/bot-platform/core/index.js
src/bot-platform/transports/max/index.js
tests/bot-platform/scaffold.test.js
```

```text
npm test: pass
default mode visible: pass
webhook mode visible: pass
```

```text
Task 13.2 app/transport mode metadata: pass
```

## Task 13.3: Обновить docs для dev/test long polling и prod webhook

Goal:

Явно описать, что long polling — default для разработки и тестирования в текущем LXC, а webhook нужен для production ingress.

Method:

```text
Documentation update
```

Scope:

- обновить ADR и runbook notes;
- описать `.env` switch;
- не добавлять входящий webhook runtime.

Skill:

```text
agent-skills:documentation-and-adrs
agent-skills:source-driven-development
```

Acceptance criteria:

- [x] docs explain long_polling default;
- [x] docs explain webhook production path;
- [x] docs explain `.env` switch;
- [x] `npm test` проходит.

Verification:

- [x] docs review;
- [x] `npm test`.

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

Result:

```text
docs/decisions/ADR-0007-use-long-polling-by-default-for-bot-platform-development.md
docs/third-stage-stand-and-agent.md
docs/runbooks/bot-platform-stand.md
examples/bot-platform/README.md
```

```text
npm test: pass
long_polling default documented: pass
webhook ingress documented: pass
```

```text
Task 13.3 docs update: pass
```

## Checkpoint: After Task 13.2

- [x] `MAX_TRANSPORT_MODE` is implemented and validated.
- [x] Scaffold exposes the selected mode.
- [x] `npm test` passes.

## Checkpoint: After Task 13.3

- [x] Development/testing docs describe long polling default.
- [x] Production docs describe webhook ingress.
- [x] `npm test` passes.

## Conclusion

```text
Task 13 transport mode switch: complete
```
