# Implementation Plan: Zabbix MAX Alert Bot

## Overview

План описывает развитие проекта в формате `planning-and-task-breakdown`. Задачи выполняются маленькими проверяемыми шагами, чтобы человек и AI-агент одинаково понимали порядок работ, проверки и границы текущего этапа.

Project-level критерии завершения проекта не дублируются в этом файле. Единый источник приемки проекта:

```text
docs/project-acceptance.md
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
- По ADR-0005 основной путь MVP `MAX Identity Bot` — Hubot-based MVP; Node-RED остается fallback-прототипом.
- Третий этап реализует MVP bot-platform без изменения текущего Zabbix Webhook.

## Task List

### Phase 1: Уточнение и базовая проверка

- [x] Task 1: Сверить параметры webhook с документацией проекта.
- [x] Task 2: Проверить MAX Media type на тестового получателя.
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

### Project acceptance

- [x] Исторический финальный прогон доставки зафиксирован в `docs/test-runs/final-acceptance-run.md`.
- [x] Zabbix -> МАХ доставка принята по историческому финальному прогону.
- [ ] Live-сценарий MAX Identity Bot требует отдельного обезличенного live test-run по ADR-0010.
- [x] Telegram-канал продолжает работать.
- [x] МАХ дублирует Telegram.
- [x] GitHub Actions green.

### Phase 5: Финальная приемка и закрытие

- [x] Task 15: Reconcile the project-acceptance checklist with existing evidence.
- [x] Task 16: Refresh and freeze the final acceptance run record.
- [x] Task 17: Separate post-acceptance follow-up from the accepted project scope.

### Checkpoint: После Phase 5

- [x] Every criterion in `docs/project-acceptance.md` has matching evidence or a documented status note.
- [x] `docs/test-runs/final-acceptance-run.md` marked as historical after ADR-0010.
- [x] Project status documents clearly separate accepted scope from post-acceptance follow-up.
- [x] `npm test` is confirmed after closeout edits.

### Second stage: Исследование и выбор платформы

Второй этап начинается после принятия первого этапа и не пересматривает текущую интеграцию Zabbix -> МАХ.

- [x] Task 11: Done — исследовать модульную bot-platform для МАХ и MVP получения `chat_id` / `user_id`.
- [x] Task 11.1: Done — найти и сравнить open source кандидатов для модульной bot-platform.

### Checkpoint: Перед реализацией второго этапа

- [x] Критерии меняются только через отдельное решение; live evidence для MAX Identity Bot уточнен в ADR-0010.
- [x] Исследовательская постановка Task 11 выполнена.
- [x] Поиск и сравнение кандидатов Task 11.1 выполнены.
- [x] Выполнен поиск в открытых источниках по open source кандидатам.
- [x] Подготовлена сравнительная таблица кандидатов и вариантов.
- [x] Выбран подход для MVP: Hubot-based MVP; Node-RED fallback-прототип.
- [x] Перед реализацией нового сервиса, runtime или входящих webhooks создан ADR-0005.
- [x] Текущий Zabbix Webhook не меняется без отдельного ADR.
- [x] `npm test` подтвержден после изменений Task 11 / Task 11.1 на commit `66a76e7f325ab9127d2cda3effa2a42cd4e92511`.

### Third stage: Реализация модульной bot-platform

Третий этап начинается после принятия второго этапа и реализует MVP `MAX Identity Bot` по ADR-0005.

- [x] Task 12.0: Done — baseline перед кодом зафиксирован, `npm test` подтвержден на commit `28cc6d901f7320fc47da317e428334945ef006c8`.
- [x] Task 12.1: Done — подготовить каркас `src/bot-platform`; CI подтвержден на commit `89f63c11ddda36da48ae773f682470710f4638d7`.
- [x] Task 12.2: Done — описать внутренний event contract; CI подтвержден на commit `89f63c11ddda36da48ae773f682470710f4638d7`.
- [x] Task 12.3: Done — добавить обезличенные fixtures входящих событий; CI подтвержден на commit `3c7c2494a80b5ad4560a65adf9fda295f69207e3`.
- [x] Task 12.4: Done — реализовать MAX event normalizer без сети; CI подтвержден на commit `abf0d734b421ba6687a8143e84adb6e0031928fb`.
- [x] Task 12.5: Done — реализовать identity formatter и handler; CI подтвержден на commit `24a0d5137af5b08f6b64ea1f5003bc6d7061dc2c`.
- [x] Task 12.6: Done — реализовать event router и dry-run pipeline; CI подтвержден на commit `61c3ba6220e7cd6dd3877590756c418728b06ab2`.
- [x] Task 12.7: Подготовить взаимозаменяемые WSL/LXC stand runbook и проверить выбранный стенд.
- [x] Task 12.8: Описать и применить Codex agent workflow.
- [x] Task 12.9: Реализовать config и безопасный logger; CI подтвержден в `docs/test-runs/task-12-9-config-logger-run.md`.
- [x] Task 12.10: Реализовать outbound client contract без реального API; CI подтвержден в `docs/test-runs/task-12-10-outbound-client-run.md`.
- [x] Task 12.11: Реализовать inbound webhook handler без публикации endpoint; CI подтвержден в `docs/test-runs/task-12-11-inbound-webhook-run.md`.
- [x] Task 12.12: Собрать app entrypoint для локального dry-run; CI подтвержден в `docs/test-runs/task-12-12-dry-run-cli-run.md`.
- [x] Task 12.13: Обновить документацию запуска dry-run.
- [x] Task 12.14: Security review перед реальным API; CI подтвержден в `docs/test-runs/task-12-dry-run.md`.

### Checkpoint: Перед кодом третьего этапа

- [x] Task 12 выполнена как dry-run/safe-test MVP bot-platform.
- [x] Baseline перед кодом был зафиксирован в рамках исторической работы.
- [x] `npm test` подтвержден на commit `28cc6d901f7320fc47da317e428334945ef006c8`.
- [x] Минимальный scaffold `src/bot-platform` реализован и проверен.
- [x] Internal event contract реализован и проверен.
- [x] Synthetic MAX fixtures добавлены и проверены.
- [x] MAX event normalizer реализован и проверен.
- [x] Identity formatter и handler реализованы и проверены.
- [x] Event router и dry-run pipeline реализованы и проверены.
- [x] Зафиксирована взаимозаменяемость WSL и LXC для продолжения работ.
- [x] Подтверждено, что текущий Zabbix Webhook не меняется.

### Follow-up: Режим транспорта bot-platform

Follow-up для режима транспорта разработки и продакшена выполнен.

- [x] Task 13: Добавить `MAX_TRANSPORT_MODE` с default `long_polling` для LXC dev/test и `webhook` для production ingress.

Этот follow-up находится вне gate исторической приемки Zabbix -> МАХ и используется как dependency для Task 18.

### Checkpoint: Before Task 13

- [x] ADR-0007 принят.
- [x] `MAX_TRANSPORT_MODE` определен как env-based switch.
- [x] Long polling подходит для outbound-only LXC.
- [x] Webhook остается production ingress path.

### Follow-up: Safe test bot in LXC

Подготовлен отдельный follow-up для безопасного тестового бота в current LXC.

- [ ] Task 14: Реализовать safe test bot в outbound-only LXC и зафиксировать prerequisites для webhook ingress.

Этот follow-up находится вне gate приемки проекта и не требуется для выполнения `docs/project-acceptance.md`.

### Checkpoint: Before Task 14

- [x] ADR-0008 принят.
- [x] Safe test bot может работать в long polling режиме.
- [x] Webhook ingress остается production-only.
- [x] Task 13: Добавить `MAX_TRANSPORT_MODE` с default `long_polling` для LXC dev/test и `webhook` для production ingress; CI подтвержден в `docs/test-runs/task-13-transport-mode-switch-run.md`.

### Phase 6: Live MAX Identity Bot

Фаза нужна для выполнения актуального project-level критерия по ADR-0010: dry-run и safe test bot не доказывают live-сценарий.

Детальная декомпозиция:

```text
docs/task-18-breakdown.md
```

#### Sprint 0: API Source And Contract

- [x] Task 18.1: Confirm MAX Bot API live transport contract.
- [x] Task 18.2: Write live transport spec and test plan.

Checkpoint:

- [x] `docs/specs/task-18-1-max-api-source.md` marked `Ready for Task 18.2`.
- [x] Official or approved local MAX Bot API source is documented.
- [x] Selected live transport mode is documented: `long_polling`.
- [x] No code performs live network calls yet.

#### Sprint 1: Live Boundaries

- [x] Task 18.3: Add live runtime config and secret validation.
- [x] Task 18.4: Implement live outbound MAX client behind an injectable HTTP boundary.

Checkpoint:

- [x] `npm test` passes.
- [x] Tests prove secrets are not logged.
- [x] Outbound client tests use fake HTTP only.

#### Sprint 2: Live Inbound

- [x] Task 18.5: Implement live inbound MAX updates client for the selected transport.
- [x] Task 18.6: Connect live inbound updates to the identity pipeline.

Checkpoint:

- [x] `npm test` passes.
- [x] Existing synthetic dry-run still works.
- [x] Live runtime can be exercised with fake MAX API responses.

#### Sprint 3: Runtime And Operations

- [x] Task 18.7: Add live service entrypoint and operational runbook.
- [x] Task 18.8: Add security review and failure-mode tests for live runtime.

Checkpoint:

- [x] `npm test` passes.
- [x] Runbook explains start, stop, logs and rollback.
- [x] `.env` and service docs do not contain real secrets.

#### Sprint 4: Live Acceptance

- [ ] Task 18.9: Run live personal-dialog `user_id` verification.
- [ ] Task 18.10: Run live chat `chat_id` verification and update acceptance evidence.

Checkpoint:

- [ ] Bot replies visibly in personal dialog.
- [ ] Bot replies visibly in chat scenario.
- [ ] Sanitized live test-run is committed.
- [ ] `docs/project-acceptance.md` evidence map references the live run.
- [ ] `npm test` passes.

### Checkpoint: Перед Task 18

- [x] ADR-0010 принят.
- [x] Task 18 decomposed into sprints in `docs/task-18-breakdown.md`.
- [x] Официальный MAX Bot API для inbound events подтвержден в Task 18.1.
- [x] Официальный MAX Bot API для outbound response подтвержден в Task 18.1.
- [x] Выбран live transport mode в Task 18.2: `long_polling`.
- [ ] Определен stand, в котором допустимо хранить runtime-секреты вне репозитория.

### Checkpoint: После Task 18

- [ ] Бот получил реальное входящее сообщение МАХ.
- [ ] Бот отправил реальный ответ через MAX Bot API.
- [ ] Ответ в личном диалоге содержит `RecipientType: user_id`.
- [ ] Ответ в chat-сценарии содержит `RecipientType: chat_id`.
- [ ] Обезличенный live test-run добавлен в `docs/test-runs/`.
- [ ] `npm test` подтвержден.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Формат MAX API или Zabbix runtime понят неправильно | High | Не писать код по предположениям; сначала уточнить документацию или создать ADR |
| В документацию попадут чувствительные значения | High | Использовать только обезличенные примеры и проверять `npm test` |
| AI-агент расширит проект за пределы этапа | High | Перед задачей проверять `docs/project-acceptance.md`, `docs/project-context.md`, `docs/decisions/README.md` и `AGENTS.md` |
| Задачи станут слишком крупными | Medium | Делить задачи до размера S/M и не выполнять L/XL без новой декомпозиции |
| Поведение webhook изменится без обновления документации | Medium | Любое изменение `max-webhook.js` сверять с `docs/zabbix-media-type.md` и ADR |
| Третий этап начнет промышленную реализацию вместо MVP | Medium | Ограничить scope identity-сценарием и criteria третьего этапа |
| WSL и LXC дадут разные результаты проверки | Medium | Считать стенды взаимозаменяемыми только при успешном прохождении одинакового verification checklist |

## Open Questions

- Какой минимальный delivery package нужен для Hubot-based MVP.
- Нужно ли делать короткий Node-RED fallback-прототип до Hubot implementation task.
- Какой формат входящего события МАХ использовать для локального тестового прогона MVP.
- Какой из взаимозаменяемых стендов будет доступен для ближайшего фактического прогона: WSL или LXC.

## Parallelization Opportunities

Безопасно выполнять параллельно:

- Подготовка обезличенных примеров входящих событий МАХ.
- Подготовка WSL/LXC runbook.
- Подготовка agent workflow для Task 12.x.

Последовательно выполнять:

- Task 1 -> Task 2 -> Task 3;
- Task 4 -> Task 5 -> Task 8 -> Task 9 -> Task 10;
- Task 11 -> Task 11.1 -> ADR -> Task 12.x;
- Task 12.0 -> Task 12.1 -> Task 12.2 -> Task 12.3 -> Task 12.4 -> Task 12.5 -> Task 12.6 -> Task 12.7 -> Task 12.8 -> Task 12.9 -> Task 12.10 -> Task 12.11 -> Task 12.12 -> Task 12.13 -> Task 12.14.

## Definition of Done для плана

- [x] Каждая задача имеет acceptance criteria.
- [x] Каждая задача имеет verification.
- [x] Указаны dependencies.
- [x] Указаны files likely touched.
- [x] Указан estimated scope.
- [x] Указаны method и skill.
- [x] После фаз есть checkpoints.
- [x] Project-level критерии не дублируются вне `docs/project-acceptance.md`.
