# Documentation

Документация проекта разделена по назначению. Перед изменением поведения или границ сначала проверяются ADR.

## Быстрый Вход

- [`live-identity-bot.md`](live-identity-bot.md) — текущий статус проекта.
- [`identity-plugin/`](identity-plugin/) — Identity Plugin документация и sprint plan.
- [`project-context.md`](project-context.md) — текущий scope, принятые части и открытые follow-up.
- [`zabbix-media-type.md`](zabbix-media-type.md) — настройка Zabbix Media type `MAX`.
- [`test-runs/README.md`](test-runs/README.md) — карта обезличенных прогонов.
- [`decisions/README.md`](decisions/README.md) — индекс ADR.

## Эксплуатация

- [`runbooks/bot-platform-stand.md`](runbooks/bot-platform-stand.md) — WSL/LXC стенд, dry-run pipeline и ограничения ingress.
- [`runbooks/live-identity-bot.md`](runbooks/live-identity-bot.md) — live MAX Identity Bot, foreground запуск, systemd и rollback.
- [`nanoidp-setup.md`](nanoidp-setup.md) — установка и настройка NanoIDP/Keycloak/Authentik.

## Планы

- [`../tasks/sprints/`](../tasks/sprints/) — sprint plans для Identity Plugin live реализации.

## Важное Разделение

Zabbix -> МАХ доставка подтверждена отдельными прогонами.

Live MAX Identity Bot не считается принятым, пока не появится обезличенный live test-run по ADR-0010. Dry-run, synthetic fixtures и safe test bot подтверждают только готовность кода и формата ответа.
