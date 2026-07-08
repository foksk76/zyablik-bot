# Task List: Zabbix MAX Alert Bot

Задачи ведутся по `planning-and-task-breakdown`. Project-level критерии завершения первого этапа хранятся только в `docs/project-acceptance.md`.

## Status summary

```text
Done: Task 1, Task 1.1, Task 2, Task 3, Task 4, Task 5, Task 6.1, Task 8, Task 9, Task 10
In progress: Task 14
Deferred/Future: Task 6, Task 7
```

Task 6 и Task 7 относятся к будущей локальной проверке форматирования вне Zabbix runtime. Они не блокируют завершение первого этапа, потому что ручной сценарий Zabbix -> МАХ уже подтвержден в Task 2 и Task 3.

---

## Task 1: Сверить параметры webhook с документацией проекта

**Status:** Done

**Description:** Сверить `docs/zabbix-media-type.md`, `examples/media-params.md` и `src/zabbix-media-type/max-webhook.js`.

**Method:** Static documentation check

**Skill:** `code-review-and-quality`

**Acceptance criteria:**

- [x] Список параметров в документации и примере совпадает.
- [x] Webhook-скрипт читает только описанные параметры.
- [x] Найденные расхождения оформлены или исправлены минимально.

**Verification:**

- [x] Выполнена ручная сверка файлов.
- [x] Выполнен `npm test` через GitHub Actions.

**Result:** Документация, пример и webhook-скрипт приведены к одному набору параметров. Расхождение по `HTTPProxy` закрыто в Task 1.1.

**Dependencies:** None

**Files likely touched:** `docs/zabbix-media-type.md`, `examples/media-params.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 1.1: Документировать необязательный параметр HTTPProxy

**Status:** Done

**Description:** Добавить `HTTPProxy` в документацию и пример параметров.

**Method:** Documentation update

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [x] `HTTPProxy` добавлен в список параметров Media type.
- [x] `HTTPProxy` добавлен в пример параметров.
- [x] Описано, что параметр необязательный.

**Verification:**

- [x] Сверены документация, пример и webhook-скрипт.
- [x] Выполнен `npm test` через GitHub Actions.

**Result:** `HTTPProxy` описан как необязательный параметр. Webhook-код не менялся.

**Dependencies:** Task 1

**Files likely touched:** `docs/zabbix-media-type.md`, `examples/media-params.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 2: Проверить MAX Media type на тестовом получателе

**Status:** Done

**Description:** Выполнить ручной тест Zabbix Media type `MAX` на тестового получателя МАХ.

**Method:** Integration run

**Skill:** `debugging-and-error-recovery`

**Acceptance criteria:**

- [x] Тест Media type в Zabbix выполнен.
- [x] Получен понятный результат.
- [x] Результат описан без чувствительных значений.

**Verification:**

- [x] Подготовлен `docs/test-runs/max-media-type-manual-run.md`.
- [x] Сообщение доставлено в тестового получателя.
- [x] Ошибок не зафиксировано.

**Result:** Ручной тест доставки выполнен успешно. Проверен транспорт Zabbix -> MAX и авторизация бота. Подстановка макросов в реальном Action проверяется отдельно в Task 3.

**Dependencies:** Task 1, Task 1.1

**Files likely touched:** `docs/test-runs/`, `docs/zabbix-media-type.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 3: Проверить Problem и Recovery

**Status:** Done

**Description:** Проверить доставку Problem и Recovery через реальный сценарий Zabbix Action.

**Method:** Problem/Recovery run

**Skill:** `debugging-and-error-recovery`

**Acceptance criteria:**

- [x] Проверено событие Problem.
- [x] Проверено событие Recovery.
- [x] Формат сообщений описан по фактическому результату.

**Verification:**

- [x] Проверен текст Problem-сообщения.
- [x] Проверен текст Recovery-сообщения.
- [x] Нераскрытые макросы не обнаружены.

**Result:** Problem и Recovery доставлены в МАХ. Результат зафиксирован в `docs/test-runs/max-problem-recovery-run.md`.

**Dependencies:** Task 2

**Files likely touched:** `docs/test-runs/max-problem-recovery-run.md`, `docs/test-runs/README.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 4: Описать получение идентификатора получателя в МАХ

**Status:** Done

**Description:** Описать порядок получения идентификатора получателя для личной отправки и группового чата.

**Method:** Documentation update

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [x] Описан общий порядок получения идентификатора получателя.
- [x] Разделены сценарии личного получателя и группового чата.
- [x] Примеры обезличены.

**Verification:**

- [x] Документ можно использовать для повторной настройки.
- [x] Нет реальных идентификаторов, внутренних адресов и организационных названий.
- [x] Проверено соответствие `docs/documentation-policy.md`.

**Result:** В `docs/zabbix-media-type.md` добавлено описание пары `RecipientType` и `To`. Добавлен обезличенный пример `examples/recipient-id.md`. В `examples/media-params.md` добавлена ссылка на пример и указано соответствие `user_id` / `chat_id`.

**Dependencies:** None

**Files likely touched:** `docs/zabbix-media-type.md`, `examples/media-params.md`, `examples/recipient-id.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 5: Описать перенос или повторное создание Media type

**Status:** Done

**Description:** Описать повторное создание Media type `MAX` в Zabbix или перенос в другую среду без публикации чувствительных значений.

**Method:** Documentation update

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [x] Описан ручной способ создания Media type.
- [x] Описан порядок проверки параметров после переноса.
- [x] Указано, какие значения задаются только в целевой системе, включая `Token`, `RecipientType` и `To`.

**Verification:**

- [x] Инструкция сверена с `docs/zabbix-media-type.md`.
- [x] README не дублирует project-level критерии.
- [x] Выполнен `npm test` через GitHub Actions: 14 тестов прошли, ошибок нет.

**Result:** В `docs/zabbix-media-type.md` добавлен раздел о повторном создании или переносе Media type. Создан чек-лист `examples/media-type-recreate-checklist.md`. В `examples/media-params.md` добавлена ссылка на чек-лист. Реальные токены, идентификаторы получателей и чувствительные значения не добавлены. CI подтвержден на commit `6031688ca4a157d500b4ee09f441dec67448747d`.

**Dependencies:** Task 1, Task 4

**Files likely touched:** `docs/zabbix-media-type.md`, `examples/media-params.md`, `examples/recipient-id.md`, `examples/media-type-recreate-checklist.md`, `tasks/todo.md`

**Estimated scope:** Medium

---

## Task 6: Принять техническое решение по локальной проверке форматирования

**Status:** Deferred / Future

**Description:** До написания кода определить, как проверять формирование текста webhook-сообщения вне Zabbix runtime.

**Method:** ADR before implementation

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [ ] Создан ADR в `docs/decisions/`.
- [ ] В ADR указан выбранный способ проверки форматирования.
- [ ] В ADR указано, какие ограничения Zabbix runtime не эмулируются.
- [ ] До принятия ADR код test harness не добавляется.

**Verification:**

- [ ] ADR содержит контекст, решение, альтернативы и последствия.
- [ ] Решение не требует реального подключения к МАХ.
- [ ] Решение не меняет поведение `max-webhook.js` без отдельной задачи.

**Dependencies:** Task 1

**Blocking status:** Не блокирует завершение первого этапа. Ручные прогоны Media type, Problem и Recovery уже подтверждены через Zabbix в Task 2 и Task 3.

**Files likely touched:** `docs/decisions/`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 6.1: Перенести проверку репозитория на Node.js policy tests и GitHub Actions

**Status:** Done

**Description:** Перенести базовую проверку репозитория из shell-скрипта в Node.js policy tests с автоматическим запуском через GitHub Actions.

**Method:** Technical decision + repository policy tests

**Skill:** `documentation-and-adrs`, `test-driven-development`, `code-review-and-quality`

**Acceptance criteria:**

- [x] Создан ADR по миграции проверки репозитория.
- [x] Добавлены Node.js policy tests в `tests/`.
- [x] Добавлен GitHub Actions workflow для запуска `npm test`.
- [x] `package.json` использует `node --test` для `test` и `verify`.
- [x] Старый shell-скрипт проверки удален.
- [x] Документация больше не ссылается на старую команду проверки.

**Verification:**

- [x] Добавлен `docs/decisions/ADR-0004-use-node-policy-tests-and-github-actions.md`.
- [x] Добавлен `.github/workflows/verify.yml`.
- [x] Добавлены policy tests.
- [x] Выполнен `npm test` через GitHub Actions: 14 тестов прошли, ошибок нет.

**Result:** Миграция проверки репозитория выполнена. Основная команда проверки теперь `npm test`.

**Dependencies:** ADR-0004

**Files likely touched:** `docs/decisions/`, `.github/workflows/`, `tests/`, `package.json`, `README.md`, `AGENTS.md`, `DEVELOPMENT.md`, `docs/project-acceptance.md`, `tasks/plan.md`, `tasks/todo.md`

**Estimated scope:** Medium

---

## Task 7: Реализовать локальную проверку форматирования после ADR

**Status:** Deferred / Future

**Description:** Реализовать минимальную локальную проверку формирования текста сообщения только после принятия ADR из Task 6.

**Method:** Format harness

**Skill:** `test-driven-development`

**Acceptance criteria:**

- [ ] Проверка реализована строго в соответствии с ADR.
- [ ] Проверяется обычное сообщение.
- [ ] Проверяется Recovery-сообщение.
- [ ] Проверка не требует реального подключения к МАХ.

**Verification:**

- [ ] Проверка запускается локальной командой, указанной в документации.
- [ ] Выполнен `npm test`.
- [ ] Документация обновлена только в части реально добавленной команды.

**Dependencies:** Task 6

**Blocking status:** Заблокирована до Task 6 и не блокирует завершение первого этапа.

**Files likely touched:** `tests/`, `package.json`, `docs/decisions/`

**Estimated scope:** Medium

---

## Task 8: Провести review документации, задач и webhook-логики

**Status:** Done

**Description:** Проверить согласованность документации, задач, ADR и webhook-логики для завершения базовой интеграции Zabbix -> МАХ.

**Method:** Code and documentation review

**Skill:** `code-review-and-quality`

**Acceptance criteria:**

- [x] Проверены `README.md`, `AGENTS.md`, `DEVELOPMENT.md`, `docs/`, `tasks/`.
- [x] Проверено, что ADR находятся только в `docs/decisions/`.
- [x] Проверено, что задачи находятся только в `tasks/plan.md` и `tasks/todo.md`.
- [x] Проверено, что project-level критерии не дублируются вне `docs/project-acceptance.md`.
- [x] Проверено, что Task 6 и Task 7 явно отложены и не блокируют первый этап.

**Verification:**

- [x] Выполнен `npm test` после изменений Task 8: 14 тестов прошли, ошибок нет.
- [x] Чек-листы `.agents/checklists/` не являются обязательным источником задач; задачи и ADR находятся в каноничных местах.
- [x] Найденное замечание исправлено минимально: README обновлен по фактическому состоянию Phase 1/2.

**Result:** Review документации, задач, ADR, webhook и policy tests выполнен. README приведен к фактическому статусу: Phase 1, Phase 2 и Task 8 выполнены; перед завершением первого этапа остается финальная сверка с `docs/project-acceptance.md`. Проверка запрещенных организационных формулировок выполнена без сохранения самих терминов в документации. Проверки структуры ADR/tasks и соответствия параметров webhook покрыты Node.js policy tests. CI подтвержден на commit `b43072cfffeb6c87af9d774e84a95ee077a1d515`.

**Dependencies:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6.1

**Optional future dependency:** Task 6 нужна только если принимается решение о локальном format harness.

**Files likely touched:** `README.md`, `tasks/todo.md`, `tasks/plan.md`

**Estimated scope:** Medium

---

## Task 9: Оценить необходимость отдельного bot-service

**Status:** Done

**Description:** После первого этапа оценить, достаточно ли прямого Zabbix Webhook или нужен отдельный сервис для будущего развития.

**Method:** Technical decision review

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [x] Описаны признаки, при которых прямого webhook недостаточно.
- [x] Описаны плюсы и минусы отдельного сервиса.
- [x] При необходимости создан ADR до начала реализации.

**Verification:**

- [x] Есть результаты первого этапа или пилота.
- [x] Решение не реализуется без ADR.
- [x] Граница текущего этапа не изменена незаметно.

**Result:** По результатам оценки отдельный bot-service на текущем этапе не требуется. Подтвержденный сценарий Zabbix -> МАХ закрывается прямым Zabbix Webhook. Отдельный сервис рассматривается как будущее развитие только при появлении требований к обработке входящих сообщений бота, получению `chat_id` / `user_id`, повторной отправке, журналу доставки или более сложной маршрутизации уведомлений.

**Dependencies:** Task 8

**Files likely touched:** `docs/bot-service-evaluation.md`, `docs/project-context.md`, `docs/README.md`, `tasks/plan.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 10: Описать варианты повторной отправки и журнала доставки

**Status:** Done

**Description:** Описать возможное развитие после первого этапа: повторная отправка, журнал попыток доставки, отдельные маршруты по группам получателей.

**Method:** Future options documentation

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [x] Описаны варианты без немедленной реализации.
- [x] Указаны ограничения прямого webhook-подхода.
- [x] Решение о реализации вынесено в будущий ADR.

**Verification:**

- [x] Документ не требует изменения текущего webhook.
- [x] Не добавлены новые компоненты без решения.
- [x] Формулировки соответствуют `docs/documentation-policy.md`.
- [x] Выполнен `npm test` после изменений Task 10: 14 тестов прошли, ошибок нет.

**Result:** В `docs/delivery-reliability-options.md` описаны будущие варианты: оставить прямой webhook без усложнения, использовать регламентную повторную отправку без нового сервиса, рассмотреть журнал доставки, автоматическую повторную отправку, маршрутизацию по группам получателей и обработку входящих сообщений бота для получения `chat_id` / `user_id`. Зафиксировано, что текущий webhook-код не меняется, очередь, база данных, журнал доставки, автоматическая повторная отправка и маршрутизация вне Zabbix не реализуются, а перед реализацией любого из этих вариантов нужен ADR. CI подтвержден на commit `14933cdca4b43694a4e3bd4b33816b9443c8657b`.

**Dependencies:** Task 9

**Files likely touched:** `docs/delivery-reliability-options.md`, `docs/project-context.md`, `docs/README.md`, `tasks/plan.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 14: Реализовать safe test bot в outbound-only LXC и зафиксировать prerequisites для webhook ingress

**Status:** In Progress

**Description:** Реализовать safe test bot для outbound-only LXC в `long_polling` режиме, добавить `systemd` unit и зафиксировать prerequisites для перехода к webhook ingress.

**Method:** Incremental implementation + documentation update

**Skill:** `incremental-implementation`, `test-driven-development`, `documentation-and-adrs`

**Acceptance criteria:**

- [x] safe test bot runtime запускается в `long_polling` mode;
- [x] safe test bot использует local `.env`;
- [x] service lifecycle описан через `systemd`;
- [x] webhook ingress prerequisites задокументированы;
- [x] `npm test` проходит;
- [ ] safe test bot manually verified in the target outbound-only LXC;
- [ ] task status updated to Done after target LXC verification.

**Verification:**

- [x] unit-test for long polling mode;
- [x] local service-start check via `timeout 1s node src/bot-platform/app.js`;
- [x] verification that `src/zabbix-media-type/max-webhook.js` is unchanged;
- [x] `npm test`.
- [ ] manual run in target outbound-only LXC.

**Blocking status:** Not blocked. Local implementation and tests are complete; target LXC manual verification is pending.

**Result:** Safe test bot long polling runtime, `systemd` unit, and webhook ingress prerequisite docs are added. Local verification passes. The final manual LXC run remains a follow-up step.

**Dependencies:** ADR-0007, ADR-0008, ADR-0009, Task 13

**Files likely touched:** `src/bot-platform/runtime/`, `src/bot-platform/app.js`, `tests/bot-platform/`, `systemd/`, `examples/bot-platform/`, `docs/runbooks/`, `docs/third-stage-stand-and-agent.md`, `docs/test-runs/`, `tasks/todo.md`

**Estimated scope:** M
