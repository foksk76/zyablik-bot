# Task List: Zabbix MAX Alert Bot

Задачи ведутся по `planning-and-task-breakdown`. Project-level критерии завершения проекта хранятся только в `docs/project-acceptance.md`.

## Status summary

```text
Done: Task 1, Task 1.1, Task 2, Task 3, Task 4, Task 5, Task 6.1, Task 8, Task 9, Task 10, Task 14
Deferred/Future: Task 6, Task 7
Done: Task 18.1, Task 18.2
Open: Task 18.3-18.10
```

Task 6 и Task 7 относятся к будущей локальной проверке форматирования вне Zabbix runtime. Они не блокируют завершение проекта, потому что ручной сценарий Zabbix -> МАХ уже проверен в Task 2 и Task 3.

Task 13 выполнена и подтверждена в `docs/test-runs/task-13-transport-mode-switch-run.md`.

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

**Description:** Описать повторное создание Media type `MAX` в Zabbix либо перенос в другую среду без публикации чувствительных значений.

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

**Blocking status:** Не блокирует завершение проекта. Ручные прогоны Media type, Problem и Recovery уже подтверждены через Zabbix в Task 2 и Task 3.

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

**Blocking status:** Заблокирована до Task 6 и не блокирует завершение проекта.

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
- [x] Проверено, что Task 6 и Task 7 явно отложены и не блокируют проект.

**Verification:**

- [x] Выполнен `npm test` после изменений Task 8: 14 тестов прошли, ошибок нет.
- [x] Чек-листы `.agents/checklists/` не являются обязательным источником задач; задачи и ADR находятся в каноничных местах.
- [x] Найденное замечание исправлено минимально: README обновлен по фактическому состоянию Phase 1/2.

**Result:** Review документации, задач, ADR, webhook и policy tests выполнен. README синхронизирован с фактическим статусом: Phase 1, Phase 2 и Task 8 выполнены; перед завершением проекта остается финальная сверка с `docs/project-acceptance.md`. Проверка запрещенных организационных формулировок выполнена без сохранения самих терминов в документации. Проверки структуры ADR/tasks и соответствия параметров webhook покрыты Node.js policy tests. CI подтвержден на commit `b43072cfffeb6c87af9d774e84a95ee077a1d515`.

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

**Result:** По результатам оценки отдельный delivery bot-service для Zabbix -> МАХ не требуется. Подтвержденный сценарий доставки покрывается прямым Zabbix Webhook. Входящие сообщения бота и получение `chat_id` / `user_id` позже выделены в отдельный identity-only live-сценарий по ADR-0010 и Task 18.

**Dependencies:** Task 8

**Files likely touched:** `docs/bot-service-evaluation.md`, `docs/project-context.md`, `docs/README.md`, `tasks/plan.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 10: Описать варианты повторной отправки и журнала доставки

**Status:** Done

**Description:** Описать возможное развитие после первого этапа: повторная отправка, журнал попыток доставки и отдельные маршруты по группам получателей.

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

**Result:** В `docs/delivery-reliability-options.md` описаны будущие варианты доставки: оставить прямой webhook без усложнения, использовать регламентную повторную отправку без нового сервиса, рассмотреть журнал доставки, автоматическую повторную отправку и маршрутизацию по группам получателей. Входящие сообщения для `chat_id` / `user_id` отделены от надежности доставки и ведутся через ADR-0010 / Task 18. CI подтвержден на commit `14933cdca4b43694a4e3bd4b33816b9443c8657b`.

**Dependencies:** Task 9

**Files likely touched:** `docs/delivery-reliability-options.md`, `docs/project-context.md`, `docs/README.md`, `tasks/plan.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 14: Реализовать safe test bot в outbound-only LXC и зафиксировать prerequisites для webhook ingress

**Status:** Done

**Description:** Реализовать safe test bot для outbound-only LXC в `long_polling` режиме, добавить `systemd` unit и зафиксировать prerequisites для перехода к webhook ingress.

**Method:** Incremental implementation + documentation update

**Skill:** `incremental-implementation`, `test-driven-development`, `documentation-and-adrs`

**Acceptance criteria:**

- [x] safe test bot runtime запускается в `long_polling` mode;
- [x] safe test bot использует local `.env`;
- [x] service lifecycle описан через `systemd`;
- [x] webhook ingress prerequisites задокументированы;
- [x] `npm test` проходит;
- [x] safe test bot manually verified in the target outbound-only LXC;
- [x] task status updated to Done after target LXC verification.

**Verification:**

- [x] unit-test for long polling mode;
- [x] local service-start check via `timeout 1s node src/bot-platform/app.js`;
- [x] verification that `src/zabbix-media-type/max-webhook.js` is unchanged;
- [x] `npm test`.
- [x] manual run in target outbound-only LXC.

**Blocking status:** Not blocked. Local implementation and tests are complete; target LXC manual verification passed.

**Result:** Safe test bot long polling runtime, `systemd` unit, and webhook ingress prerequisite docs are added. Local verification passes. The manual LXC run passed and the task is complete.

**Dependencies:** ADR-0007, ADR-0008, ADR-0009, Task 13

**Files likely touched:** `src/bot-platform/runtime/`, `src/bot-platform/app.js`, `tests/bot-platform/`, `systemd/`, `examples/bot-platform/`, `docs/runbooks/`, `docs/third-stage-stand-and-agent.md`, `docs/test-runs/`, `tasks/todo.md`

**Estimated scope:** M

---

## Task 15: Сверить критерии приемки с фактическими доказательствами

**Status:** Done

**Description:** Сопоставить каждый критерий из `docs/project-acceptance.md` с существующим доказательством в документации, test runs и статусных файлах. Отметить только те пункты, которые действительно подтверждены, и зафиксировать оставшиеся gaps как отдельные follow-up notes.

**Method:** Documentation review

**Skill:** `documentation-and-adrs`, `code-review-and-quality`

**Acceptance criteria:**

- [x] Каждый критерий из `docs/project-acceptance.md` имеет ссылку на подтверждающее доказательство или явную status note.
- [x] В процессе сверки не появляются новые требования или расширение scope.
- [x] В документации не появляются чувствительные значения.

**Verification:**

- [x] Документация acceptance сопоставлена с `docs/test-runs/`, `README.md` и `docs/project-context.md`.
- [x] Выполнен `npm test`.

**Dependencies:** Task 2, Task 3, Task 4, Task 5, Task 8, Task 9, Task 10, Task 14

**Files likely touched:** `docs/project-acceptance.md`, `docs/project-context.md`, `docs/test-runs/final-acceptance-run.md`, `tasks/plan.md`, `tasks/todo.md`

**Estimated scope:** Small

**Result:** В `docs/project-acceptance.md` добавлена карта доказательств. После ADR-0010 live identity criteria требуют отдельного обезличенного live test-run и не закрываются dry-run/safe-test evidence. CI подтвержден текущим `npm test`.

---

## Task 16: Обновить и зафиксировать финальный приемочный прогон

**Status:** Done

**Description:** Обновить `docs/test-runs/final-acceptance-run.md`, чтобы он соответствовал состоянию проекта на момент исторической приемки, и зафиксировать ограничения этого прогона после ADR-0010.

**Method:** Documentation update

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [x] `docs/test-runs/final-acceptance-run.md` соответствует исторической приемке доставки Zabbix -> МАХ.
- [x] В документе зафиксированы дата, статус и граница приемки без чувствительных значений.
- [x] Документ однозначно привязан к `docs/project-acceptance.md`.

**Verification:**

- [x] Документ сверен с `docs/project-acceptance.md` и `docs/project-context.md`.
- [x] Выполнен `npm test`.

**Dependencies:** Task 15

**Files likely touched:** `docs/test-runs/final-acceptance-run.md`, `docs/test-runs/README.md`, `tasks/todo.md`

**Estimated scope:** Small

**Result:** Финальный приемочный прогон сохранен как историческое доказательство доставки Zabbix -> МАХ и dry-run/safe-test готовности bot-platform. После ADR-0010 он не считается live-приемкой MAX Identity Bot. CI подтвержден текущим `npm test`.

---

## Task 17: Разделить принятую область и post-acceptance follow-up

**Status:** Done

**Description:** Синхронизировать `tasks/plan.md`, `tasks/todo.md`, `README.md` и контекстные документы так, чтобы принятый scope проекта был отделен от follow-up задач после приемки.

**Method:** Documentation update

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [x] Принятый scope проекта и post-acceptance follow-up явно разделены.
- [x] `docs/project-acceptance.md` остается единственным source of truth для project-level критериев.
- [x] Документация не дублирует критерии приемки вне каноничного файла.

**Verification:**

- [x] Выполнен текстовый поиск по проектным статусам и критериям приемки.
- [x] Выполнен `npm test`.

**Dependencies:** Task 16

**Files likely touched:** `README.md`, `docs/project-context.md`, `docs/README.md`, `tasks/plan.md`, `tasks/todo.md`

**Estimated scope:** Small

**Result:** Принятый scope проекта и post-acceptance follow-up разделены в README, project-context и plan/todo файлах. `docs/project-acceptance.md` остается единственным источником критериев завершения проекта.

---

## Task 18: Реализовать live MAX Identity Bot для `user_id` / `chat_id`

**Status:** Epic / Open

**Description:** Epic для live MAX Identity Bot. Исполняемые задачи разбиты на Task 18.1-18.10 и sprint checkpoints в `docs/task-18-breakdown.md`.

**Method:** Sprint-based implementation plan

**Skill:** `planning-and-task-breakdown`

**Acceptance criteria:**

- [ ] Tasks 18.1-18.10 созданы с acceptance criteria и verification.
- [ ] Sprint checkpoints добавлены в `tasks/plan.md`.
- [ ] Детальная декомпозиция создана в `docs/task-18-breakdown.md`.

**Verification:**

- [ ] Выполнен `npm test`.
- [ ] План сверяется с `docs/project-acceptance.md` и ADR-0010.

**Dependencies:** ADR-0010, Task 13, Task 14, официальная документация MAX Bot API или подтвержденная локальная спецификация API

**Files likely touched:** `docs/task-18-breakdown.md`, `tasks/plan.md`, `tasks/todo.md`, `docs/live-identity-bot.md`

**Estimated scope:** Medium

---

## Task 18.1: Confirm MAX Bot API live transport contract

**Status:** Done

**Description:** Найти и зафиксировать официальный или утвержденный локальный источник MAX Bot API для входящих событий, отправки сообщений и read/ack semantics. Эта задача блокирует live-код: реализация сетевых вызовов не начинается по догадкам.

**Method:** Source-driven documentation review

**Skill:** `source-driven-development`, `documentation-and-adrs`

**Acceptance criteria:**

- [x] Подтвержден источник API для получения входящих событий.
- [x] Подтвержден источник API для отправки сообщения пользователю или в чат.
- [x] Зафиксирован статус read/ack: supported, unsupported или unknown.

**Verification:**

- [x] Обновлен `docs/specs/task-18-1-max-api-source.md`.
- [x] Spec status changed from `Blocked` to `Ready for Task 18.2`.
- [x] В spec есть ссылки или указание approved local source.
- [x] В spec нет токенов, реальных IDs, внутренних URL.

**Result:** Официальный источник MAX Bot API подтвержден через `dev.max.ru`. Зафиксированы contracts для `POST /messages`, `GET /updates`, `POST /subscriptions`, объектов `Update`, `Message`, `NewMessageBody`, auth header, HTTP error codes, 30 rps guidance, Long Polling marker ack и Webhook HTTP 200 ack. Dedicated API для пользовательского статуса "прочитано" в официальном API index не найден; это не блокирует live identity acceptance.

**Dependencies:** ADR-0010

**Files likely touched:** `docs/specs/task-18-1-max-api-source.md`, `docs/live-identity-bot.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 18.2: Write live transport spec and test plan

**Status:** Done

**Description:** На основании Task 18.1 выбрать live transport mode для первой реализации и описать test plan: fake API tests, local service run, live personal-dialog run, live chat run.

**Method:** Spec-driven planning

**Skill:** `spec-driven-development`, `planning-and-task-breakdown`

**Acceptance criteria:**

- [x] Выбран первый live transport mode: `long_polling` или `webhook`.
- [x] Описаны inbound/outbound contracts без секретов.
- [x] Описан test plan для fake API и live run.

**Verification:**

- [x] Spec review confirms no API behavior is guessed.
- [x] `tasks/plan.md` checkpoints match selected mode.
- [x] `npm test` проходит после документационных изменений.

**Result:** Создан `docs/specs/task-18-2-live-transport-spec.md`. Первым live transport mode выбран `long_polling`; `webhook` зафиксирован как явная заглушка `Не реализовано: transport mode webhook` без fallback и live network calls. Решение оформлено в ADR-0011.

**Dependencies:** Task 18.1

**Files likely touched:** `docs/specs/task-18-2-live-transport-spec.md`, `docs/decisions/ADR-0011-use-long-polling-for-first-live-max-identity-bot.md`, `docs/task-18-breakdown.md`, `tasks/plan.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 18.3: Add live runtime config and secret validation

**Status:** Open

**Description:** Добавить конфигурационные границы для live runtime по Task 18.2: `long_polling` как первый supported live mode, `webhook` как явная заглушка `Не реализовано: transport mode webhook`, обязательные переменные, mode-specific validation, безопасные defaults и запрет запуска live mode без токена и API URL.

**Method:** Incremental implementation

**Skill:** `api-and-interface-design`, `test-driven-development`, `security-and-hardening`

**Acceptance criteria:**

- [ ] Live runtime валидирует обязательные переменные окружения.
- [ ] `MAX_TRANSPORT_MODE=webhook` завершает runtime ошибкой `Не реализовано: transport mode webhook` без сетевых вызовов.
- [ ] Ошибки конфигурации не раскрывают секреты.
- [ ] Existing dry-run/safe-test behavior не ломается.

**Verification:**

- [ ] Unit tests for valid live config.
- [ ] Unit tests for missing/invalid live config.
- [ ] `npm test`.

**Dependencies:** Task 18.2, ADR-0011

**Files likely touched:** `src/bot-platform/core/config.js`, `tests/bot-platform/config.test.js`, `examples/bot-platform/env.example`, `docs/runbooks/`

**Estimated scope:** Medium

---

## Task 18.4: Implement live outbound MAX client behind an injectable HTTP boundary

**Status:** Open

**Description:** Реализовать отправку ответа через MAX Bot API за injectable HTTP boundary по outbound contract Task 18.2, чтобы тесты не использовали реальную сеть и реальные секреты.

**Method:** Test-driven implementation

**Skill:** `test-driven-development`, `security-and-hardening`

**Acceptance criteria:**

- [ ] Outbound client строит live request по spec Task 18.2.
- [ ] HTTP transport injectable and fakeable in tests.
- [ ] Logs and errors redact token, `user_id`, `chat_id`.

**Verification:**

- [ ] Unit tests with fake HTTP success.
- [ ] Unit tests with fake HTTP error.
- [ ] Secret redaction tests.
- [ ] `npm test`.

**Dependencies:** Task 18.2, Task 18.3

**Files likely touched:** `src/bot-platform/transports/max/outbound-client.js`, `tests/bot-platform/max-outbound-client.test.js`, `src/bot-platform/core/logger.js`

**Estimated scope:** Medium

---

## Task 18.5: Implement live inbound MAX updates client for the selected transport

**Status:** Open

**Description:** Реализовать получение live updates через `GET /updates` для выбранного в Task 18.2 режима `long_polling`. `webhook` в рамках этой задачи не реализуется и остается заглушкой из Task 18.3.

**Method:** Test-driven implementation

**Skill:** `test-driven-development`, `api-and-interface-design`

**Acceptance criteria:**

- [ ] Inbound client получает updates через `GET /updates` по spec Task 18.2.
- [ ] Inbound client передает `marker` в следующий poll для ack предыдущих событий.
- [ ] HTTP transport injectable and fakeable in tests.
- [ ] Invalid API responses fail safely without leaking payload secrets.

**Verification:**

- [ ] Unit tests with fake update response.
- [ ] Unit tests with empty response.
- [ ] Unit tests with API error response.
- [ ] `npm test`.

**Dependencies:** Task 18.2, Task 18.3

**Files likely touched:** `src/bot-platform/transports/max/`, `src/bot-platform/runtime/`, `tests/bot-platform/`

**Estimated scope:** Medium

---

## Task 18.6: Connect live inbound updates to the identity pipeline

**Status:** Open

**Description:** Подключить live inbound updates к существующему flow `normalizeMaxEvent -> event-router -> identity handler -> outbound client`, сохранив synthetic dry-run path.

**Method:** Incremental vertical slice

**Skill:** `incremental-implementation`, `test-driven-development`

**Acceptance criteria:**

- [ ] Live update проходит через normalizer and identity plugin.
- [ ] Live response отправляется через outbound client boundary.
- [ ] Existing `runMaxIdentityDryRun` and synthetic long polling tests continue to pass.

**Verification:**

- [ ] Integration-style test with fake inbound and fake outbound.
- [ ] Regression tests for dry-run.
- [ ] `npm test`.

**Dependencies:** Task 18.4, Task 18.5

**Files likely touched:** `src/bot-platform/runtime/long-polling.js`, `src/bot-platform/core/`, `src/bot-platform/app.js`, `tests/bot-platform/`

**Estimated scope:** Medium

---

## Task 18.7: Add live service entrypoint and operational runbook

**Status:** Open

**Description:** Добавить документированный способ запуска live bot в operator/LXC среде: foreground command, systemd guidance, log inspection, rollback to dry-run/safe-test.

**Method:** Operational documentation and small entrypoint update

**Skill:** `documentation-and-adrs`, `shipping-and-launch`

**Acceptance criteria:**

- [ ] Live startup command documented.
- [ ] systemd guidance separates safe-test and live mode.
- [ ] Rollback and log inspection documented without exposing secrets.

**Verification:**

- [ ] Foreground startup can be tested without real network using fake mode or dry-run guard.
- [ ] `npm test`.
- [ ] Documentation contains no real secrets or IDs.

**Dependencies:** Task 18.6

**Files likely touched:** `src/bot-platform/app.js`, `systemd/`, `docs/runbooks/`, `examples/bot-platform/env.example`

**Estimated scope:** Medium

---

## Task 18.8: Add security review and failure-mode tests for live runtime

**Status:** Open

**Description:** Проверить live runtime на безопасную обработку ошибок: API failures, malformed updates, missing config, redaction, no raw payload leaks.

**Method:** Security and failure-mode review

**Skill:** `security-and-hardening`, `code-review-and-quality`

**Acceptance criteria:**

- [ ] Ошибки API классифицированы без раскрытия секретов.
- [ ] Malformed updates do not crash the long-running service permanently.
- [ ] Raw live payload is not logged by default.

**Verification:**

- [ ] Failure-mode tests pass.
- [ ] Manual code review notes recorded in `docs/test-runs/`.
- [ ] `npm test`.

**Dependencies:** Task 18.6

**Files likely touched:** `tests/bot-platform/`, `src/bot-platform/runtime/`, `src/bot-platform/core/logger.js`, `docs/test-runs/`

**Estimated scope:** Medium

---

## Task 18.9: Run live personal-dialog `user_id` verification

**Status:** Open

**Description:** Выполнить live run: пользователь отправляет сообщение боту МАХ в личном диалоге, бот отвечает `RecipientType: user_id` и обезличенным `To`.

**Method:** Live integration run

**Skill:** `debugging-and-error-recovery`, `documentation-and-adrs`

**Acceptance criteria:**

- [ ] Бот получил реальное личное сообщение.
- [ ] Бот отправил видимый ответ через MAX Bot API.
- [ ] Ответ содержит `RecipientType: user_id` and sanitized `To`.

**Verification:**

- [ ] Обезличенный live test-run добавлен в `docs/test-runs/`.
- [ ] Реальные токены and IDs are not committed.
- [ ] `npm test`.

**Dependencies:** Task 18.7, Task 18.8

**Files likely touched:** `docs/test-runs/`, `docs/live-identity-bot.md`, `tasks/todo.md`

**Estimated scope:** Small

---

## Task 18.10: Run live chat `chat_id` verification and update acceptance evidence

**Status:** Open

**Description:** Выполнить live chat-сценарий и закрыть evidence map: бот отвечает в групповом или другом поддержанном chat-сценарии с `RecipientType: chat_id`, затем обновляются acceptance документы.

**Method:** Live acceptance run

**Skill:** `debugging-and-error-recovery`, `documentation-and-adrs`

**Acceptance criteria:**

- [ ] Бот получил реальное chat-сообщение или supported chat event.
- [ ] Бот отправил видимый ответ through MAX Bot API.
- [ ] `docs/project-acceptance.md` evidence map references sanitized live run.

**Verification:**

- [ ] Обезличенный live test-run добавлен или обновлен в `docs/test-runs/`.
- [ ] `docs/live-identity-bot.md` marks live scenario accepted.
- [ ] `npm test`.

**Dependencies:** Task 18.9

**Files likely touched:** `docs/test-runs/`, `docs/project-acceptance.md`, `docs/live-identity-bot.md`, `tasks/plan.md`, `tasks/todo.md`

**Estimated scope:** Small
