# Architecture Decision Records

Этот раздел — каноничное место для архитектурных решений проекта.

ADR фиксируют не только принятое решение, но и контекст, ограничения, рассмотренные альтернативы и последствия. Это нужно, чтобы будущие инженеры и AI-агенты понимали, почему проект устроен именно так, и не переизобретали уже принятые решения.

## Правила

- ADR не удаляются из истории решений.
- Если решение изменилось, создается новый ADR со ссылкой на старый.
- Существенные изменения архитектуры, границ проекта, процесса разработки или документации фиксируются через ADR.
- Служебный каталог `.agents/` может ссылаться на ADR, но не является каноничным хранилищем решений.

## Список решений

| ADR | Статус | Решение |
|---|---|---|
| [ADR-0001](ADR-0001-ai-assisted-dev.md) | Принято | Использовать явный AI-assisted каркас разработки |
| [ADR-0002](ADR-0002-use-external-agent-skills.md) | Принято | Использовать внешний `agent-skills` без submodule |
| [ADR-0003](ADR-0003-project-acceptance-and-run-methods.md) | Принято | Выделить критерии завершения проекта и методы прогонов |
| [ADR-0004](ADR-0004-use-node-policy-tests-and-github-actions.md) | Принято | Использовать Node.js policy tests и GitHub Actions вместо bash-проверки |
| [ADR-0005](ADR-0005-use-hubot-for-max-identity-bot-mvp.md) | Принято | Выбрать платформу MVP MAX Identity Bot |
| [ADR-0006](ADR-0006-use-lxc-integration-stand-for-mvp-callback-path.md) | Принято | Использовать LXC integration stand для callback-path прогона MVP |
| [ADR-0007](ADR-0007-use-long-polling-by-default-for-bot-platform-development.md) | Принято | Использовать long polling по умолчанию для разработки и тестирования bot-platform |
| [ADR-0008](ADR-0008-use-outbound-only-lxc-for-safe-test-bot-development.md) | Принято | Использовать outbound-only LXC для safe test bot development |
| [ADR-0009](ADR-0009-place-long-polling-loop-in-the-bot-platform-runtime-entrypoint.md) | Принято | Разместить long polling loop в runtime entrypoint bot-platform |
| [ADR-0010](ADR-0010-require-live-evidence-for-max-identity-bot-acceptance.md) | Принято | Требовать live evidence для приемки MAX Identity Bot |
| [ADR-0011](ADR-0011-use-long-polling-for-first-live-max-identity-bot.md) | Принято | Использовать Long Polling для первой live-реализации MAX Identity Bot |
| [ADR-0012](ADR-0012-use-convention-based-plugin-loader.md) | Принято | Использовать convention-based plugin loader для bot-platform |
| [ADR-0013](ADR-0013-safe-logger-secret-redaction.md) | Принято | Использовать многоуровневую safe logger для маскировки секретов |
| [ADR-0014](ADR-0014-async-http-via-child-process.md) | Принято | Использовать async HTTP через child_process.spawn |
| [ADR-0015](ADR-0015-zero-external-dependencies.md) | Принято | Использовать нулевые внешние зависимости для bot-platform |
| [ADR-0016](ADR-0016-injectable-dependency-injection.md) | Принято | Использовать инъекцию зависимостей через options объект |
| [ADR-0017](ADR-0017-internal-event-contract.md) | Принято | Ввести внутренний контракт событий (canonical event model) |
