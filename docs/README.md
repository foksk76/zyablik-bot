# Documentation

Документация проекта разделена по назначению.

## Быстрый вход

- [`project-context.md`](project-context.md) — что делает проект, почему выбран текущий подход и где границы первого этапа.
- [`project-acceptance.md`](project-acceptance.md) — единый источник критериев завершения первого этапа.
- [`zabbix-media-type.md`](zabbix-media-type.md) — параметры и проверка Zabbix Media type `MAX`.
- [`bot-service-evaluation.md`](bot-service-evaluation.md) — оценка необходимости отдельного bot-service после базовой проверки Zabbix -> МАХ.
- [`delivery-reliability-options.md`](delivery-reliability-options.md) — будущие варианты повторной отправки, журнала доставки и маршрутизации без немедленной реализации.
- [`modular-bot-platform-research.md`](modular-bot-platform-research.md) — Task 11: исследование модульной bot-platform для МАХ и MVP получения `chat_id` / `user_id`.
- [`test-runs/README.md`](test-runs/README.md) — ручные прогоны и обезличенная фиксация результатов.
- [`agent-skills-integration.md`](agent-skills-integration.md) — как использовать внешний набор skills.
- [`documentation-policy.md`](documentation-policy.md) — правила ведения документации и ADR.

## Решения

- [`decisions/README.md`](decisions/README.md) — индекс архитектурных решений.

Перед предложением нового подхода сначала проверить ADR. Это помогает не возвращаться к уже отклоненным вариантам и не расширять проект за пределы текущего этапа.
