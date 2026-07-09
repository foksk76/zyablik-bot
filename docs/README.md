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

- [`runbooks/INSTALL.md`](runbooks/INSTALL.md) — установка safe test bot для текущего operator host и outbound-only LXC.
- [`runbooks/bot-platform-stand.md`](runbooks/bot-platform-stand.md) — WSL/LXC стенд, dry-run pipeline и ограничения ingress.

## Этапы И Планы

- [`second-stage-acceptance.md`](second-stage-acceptance.md) — граница и критерии завершения исследовательского второго этапа.
- [`third-stage-acceptance.md`](third-stage-acceptance.md) — исторические критерии dry-run/safe-test MVP bot-platform.
- [`third-stage-implementation-plan.md`](third-stage-implementation-plan.md) — план третьего этапа и Task 12.x.
- [`third-stage-stand-and-agent.md`](third-stage-stand-and-agent.md) — WSL/LXC стенд и правила применения Codex agent или аналога.
- [`task-12-breakdown.md`](task-12-breakdown.md) — декомпозиция Task 12.
- [`task-13-breakdown.md`](task-13-breakdown.md) — `MAX_TRANSPORT_MODE`.
- [`task-14-breakdown.md`](task-14-breakdown.md) — safe test bot в outbound-only LXC.
- [`task-18-breakdown.md`](task-18-breakdown.md) — sprint breakdown для live MAX Identity Bot.

## Исследования И Опции

- [`bot-service-evaluation.md`](bot-service-evaluation.md) — оценка отдельного bot-service для доставки и входящих сообщений.
- [`delivery-reliability-options.md`](delivery-reliability-options.md) — будущие варианты повторной отправки, журнала доставки и маршрутизации.
- [`modular-bot-platform-research.md`](modular-bot-platform-research.md) — Task 11: исследование bot-platform для получения `chat_id` / `user_id`.
- [`modular-bot-platform-candidates.md`](modular-bot-platform-candidates.md) — Task 11.1: сравнение open source кандидатов.

## Правила

- [`agent-skills-integration.md`](agent-skills-integration.md) — как использовать внешний набор skills.
- [`documentation-policy.md`](documentation-policy.md) — правила ведения документации и ADR.

## Важное Разделение

Zabbix -> МАХ доставка подтверждена отдельными прогонами.

Live MAX Identity Bot не считается принятым, пока не появится обезличенный live test-run по ADR-0010. Dry-run, synthetic fixtures и safe test bot подтверждают только готовность кода и формата ответа.
