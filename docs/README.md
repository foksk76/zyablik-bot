# Documentation

Документация проекта разделена по назначению. Перед изменением поведения или границ сначала проверяются ADR.

## Быстрый Вход

- [`project-context.md`](project-context.md) — текущий scope, принятые части и открытые follow-up.
- [`project-acceptance.md`](project-acceptance.md) — единый источник project-level критериев завершения.
- [`live-identity-bot.md`](live-identity-bot.md) — текущий статус live MAX Identity Bot и Task 18.
- [`zabbix-media-type.md`](zabbix-media-type.md) — настройка Zabbix Media type `MAX`.
- [`test-runs/README.md`](test-runs/README.md) — карта обезличенных прогонов.
- [`decisions/README.md`](decisions/README.md) — индекс ADR.

## Эксплуатация

- [`runbooks/bot-platform-stand.md`](runbooks/bot-platform-stand.md) — WSL/LXC стенд, dry-run pipeline и ограничения ingress.
- [`runbooks/live-identity-bot.md`](runbooks/live-identity-bot.md) — live MAX Identity Bot, foreground запуск, systemd и rollback.

## Планы

- [`task-18-breakdown.md`](task-18-breakdown.md) — sprint breakdown для live MAX Identity Bot.

## Правила

- [`agent-skills-integration.md`](agent-skills-integration.md) — как использовать внешний набор skills.
- [`documentation-policy.md`](documentation-policy.md) — правила ведения документации и ADR.

## Важное Разделение

Zabbix -> МАХ доставка подтверждена отдельными прогонами.

Live MAX Identity Bot не считается принятым, пока не появится обезличенный live test-run по ADR-0010. Dry-run, synthetic fixtures и safe test bot подтверждают только готовность кода и формата ответа.
