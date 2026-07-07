# Implementation Plan: Zabbix MAX Alert Bot

## Overview

План описывает развитие проекта в формате `planning-and-task-breakdown`. Задачи выполняются маленькими проверяемыми шагами, чтобы человек и AI-агент одинаково понимали порядок работ, проверки и границы текущего этапа.

Project-level критерии завершения первого этапа не дублируются в этом файле. Единый источник приемки первого этапа:

```text
docs/project-acceptance.md
```

Критерии завершения второго этапа:

```text
docs/second-stage-acceptance.md
```

## Architecture Decisions

- Основной рабочий артефакт первого этапа: `src/zabbix-media-type/max-webhook.js`.
- Telegram-канал не заменяется и не ломается. МАХ добавляется как дополнительный канал доставки.
- Архитектурные и процессные решения фиксируются только в `docs/decisions/`.
- Документация ведется по `docs/documentation-policy.md`.
- Внешний `agent-skills` используется ссылкой и локальной установкой, без submodule.
- Задачи ведутся в `tasks/plan.md` и `tasks/todo.md`; `.agents/` остается рабочим контекстом агента, а не местом хранения задач.
- Код меняется только на основании документации проекта, внешней документации или ADR.
- Проверки репозитория выполняются через `npm test` и GitHub Actions согласно ADR-0004.
- Второй этап начинается с Task 11 и не меняет текущий Zabbix Webhook без отдельного ADR.

## Task List

### Phase 1: Уточнение и базовая проверка

- [x] Task 1: Сверить параметры webhook с документацией проекта.
- [x] Task 2: Проверить MAX Media type на тестовом получателе.
- [x] Task 3: Проверить Problem и Recovery.

### Checkpoint: После Phase 1

- [x] Задачи 1-3 закрыты по своим verification.
- [x] Найденные расхождения оформлены как отдельные задачи или ADR.
- [x] Project-level статус сверяется только с `docs/project-acceptance.md`.

### Phase 2: Воспроизводимость настройки

- [x] Task 4: Описать получение идентификатора получателя в МАХ.
- [x] Task 5: Описать перенос или повторное создание Media type.

### Checkpoint: После Phase 2

- [x] Документация Task 4-5 подготовлена.
- [x] Документация не содержит чувствительных значений.
- [x] Project-level статус сверяется только с `docs/project-acceptance.md`.
- [x] `npm test` подтвержден после изменений Task 5.

### Phase 3: Проверки качества

- [ ] Task 6: Deferred/Future — ADR по локальной проверке форматирования.
- [x] Task 6.1: Перенести проверку репозитория на Node.js policy tests и GitHub Actions.
- [ ] Task 7: Deferred/Future — локальная проверка форматирования после ADR.
- [x] Task 8: Review документации, задач и webhook-логики.

### Checkpoint: После Phase 3

- [x] Task 8 закрыта по verification.
- [x] `npm test` подтвержден после изменений Task 8.
- [x] Task 6 и Task 7 явно отложены и не блокируют первый этап.
- [x] Код не содержит поведения, не подтвержденного документацией или ADR.
- [x] Project-level статус сверяется только с `docs/project-acceptance.md`.

### Phase 4: Решение о развитии после первого этапа

- [x] Task 9: Оценить необходимость отдельного bot-service.
- [x] Task 10: Описать варианты повторной отправки и журнала доставки.

### Checkpoint: После Phase 4

- [x] Есть результаты первого этапа или пилота.
- [x] Перед изменением архитектуры создан ADR или зафиксировано, что изменение архитектуры не требуется.
- [x] Текущий webhook-вариант не усложнен без решения.
- [x] Будущие варианты повторной отправки, журнала доставки и маршрутизации описаны без немедленной реализации.
- [x] `npm test` подтвержден после изменений Task 10.

### First-stage acceptance

- [x] Финальный приемочный прогон зафиксирован в `docs/test-runs/final-acceptance-run.md`.
- [x] Первый этап принят по `docs/project-acceptance.md`.
- [x] Telegram-канал продолжает работать.
- [x] МАХ дублирует Telegram.
- [x] GitHub Actions green.

### Second stage: Исследование и выбор платформы

Второй этап начинается после принятия первого этапа и не пересматривает текущую интеграцию Zabbix -> МАХ.

- [ ] Task 11: Исследовать модульную bot-platform для МАХ и MVP получения `chat_id` / `user_id`.

### Checkpoint: Перед реализацией второго этапа

- [x] Первый этап принят и не меняется.
- [x] Старт второго этапа и критерии завершения описаны в `docs/second-stage-acceptance.md`.
- [x] Исследовательская постановка Task 11 описана в `docs/modular-bot-platform-research.md`.
- [ ] Выполнен поиск в открытых источниках по open source кандидатам.
- [ ] Подготовлена сравнительная таблица кандидатов и вариантов.
- [ ] Выбран подход для MVP: собственный сервис, open source framework, workflow-прототип или отказ от реализации.
- [ ] Перед реализацией нового сервиса, runtime или входящих webhooks создан ADR.
- [ ] Текущий Zabbix Webhook не меняется без отдельного ADR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Формат MAX API или Zabbix runtime понят неправильно | High | Не писать код по предположениям; сначала уточнить документацию или создать ADR |
| В документацию попадут чувствительные значения | High | Использовать только обезличенные примеры и проверять `npm test` |
| AI-агент расширит проект за пределы этапа | High | Перед задачей проверять `docs/project-acceptance.md`, `docs/second-stage-acceptance.md`, `docs/decisions/README.md` и `AGENTS.md` |
| Задачи станут слишком крупными | Medium | Делить задачи до размера S/M и не выполнять L/XL без новой декомпозиции |
| Поведение webhook изменится без обновления документации | Medium | Любое изменение `max-webhook.js` сверять с `docs/zabbix-media-type.md` и ADR |
| Второй этап начнет реализацию без выбора платформы | Medium | Сначала research и ADR, затем код |

## Open Questions

- Какой test runtime выбрать для MVP MAX Identity Bot.
- Искать готовый open source bot framework или сразу проектировать минимальный собственный сервис.
- Достаточно ли identity-only MVP без журнала доставки, retry и маршрутизации.

## Parallelization Opportunities

Безопасно выполнять параллельно:

- Поиск open source кандидатов для Task 11.
- Подготовка черновика ADR для MVP без изменения текущего webhook.

Последовательно выполнять:

- Task 1 -> Task 2 -> Task 3;
- Task 4 -> Task 5 -> Task 8 -> Task 9 -> Task 10;
- Task 6 -> Task 7, только если принято решение развивать локальный format harness;
- Task 11 research -> ADR -> MVP implementation.

## Definition of Done для плана

- [ ] Каждая задача имеет acceptance criteria.
- [ ] Каждая задача имеет verification.
- [ ] Указаны dependencies.
- [ ] Указаны files likely touched.
- [ ] Указан estimated scope.
- [ ] Указаны method и skill.
- [ ] После фаз есть checkpoints.
- [ ] Project-level критерии не дублируются вне `docs/project-acceptance.md`.
