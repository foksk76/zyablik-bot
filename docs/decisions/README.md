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
