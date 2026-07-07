# Task List: Zabbix MAX Alert Bot

Задачи оформлены по `planning-and-task-breakdown`: каждая задача небольшая, проверяемая и имеет явные критерии приемки.

Project-level критерии завершения первого этапа хранятся только в:

```text
docs/project-acceptance.md
```

## Task 1: Сверить параметры webhook с документацией проекта

**Status:** Done

**Description:** Проверить, что текущий `docs/zabbix-media-type.md`, `examples/media-params.md` и `src/zabbix-media-type/max-webhook.js` описывают один и тот же набор параметров без противоречий.

**Method:** Static documentation check

**Skill:** `code-review-and-quality`

**Acceptance criteria:**

- [x] Список параметров в документации и примере совпадает.
- [x] Webhook-скрипт читает только описанные параметры или найденные расхождения оформлены отдельной задачей.
- [x] Найденные расхождения оформлены как отдельная задача или исправлены минимальным изменением.

**Verification:**

- [x] Вручную сверены `docs/zabbix-media-type.md`, `examples/media-params.md`, `src/zabbix-media-type/max-webhook.js`.
- [ ] Выполнен `npm test`.

**Result:** Документация, пример и webhook-скрипт приведены к одному набору параметров. Найденное расхождение по необязательному параметру `HTTPProxy` закрыто в Task 1.1.

**Dependencies:** None

**Files likely touched:**

- `docs/zabbix-media-type.md`
- `examples/media-params.md`
- `tasks/todo.md`

**Estimated scope:** Small: 1-2 files

---

## Task 1.1: Документировать необязательный параметр HTTPProxy

**Status:** Done

**Description:** Добавить необязательный параметр `HTTPProxy` в `docs/zabbix-media-type.md` и `examples/media-params.md`, потому что webhook-скрипт уже поддерживает его через `request.setProxy()`.

**Method:** Documentation update

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [x] `HTTPProxy` добавлен в список параметров Media type.
- [x] `HTTPProxy` добавлен в пример параметров.
- [x] Описано, что параметр необязательный и используется только при необходимости исходящего прокси в среде Zabbix.

**Verification:**

- [x] Сверены `docs/zabbix-media-type.md`, `examples/media-params.md`, `src/zabbix-media-type/max-webhook.js`.
- [ ] Выполнен `npm test`.

**Result:** `HTTPProxy` добавлен в документацию и пример параметров. Webhook-код не менялся.

**Dependencies:** Task 1

**Files likely touched:**

- `docs/zabbix-media-type.md`
- `examples/media-params.md`
- `tasks/todo.md`

**Estimated scope:** Small: 1-2 files

---

## Task 2: Проверить MAX Media type на тестовом получателе

**Status:** Done

**Description:** Выполнить ручной тест Zabbix Media type `MAX` на тестового получателя МАХ и зафиксировать обезличенный результат проверки.

**Method:** Integration run

**Skill:** `debugging-and-error-recovery`

**Acceptance criteria:**

- [x] Тест Media type в Zabbix выполнен.
- [x] Получен понятный результат: успешно доставлено или зафиксирована конкретная ошибка.
- [x] Результат описан без публикации чувствительных значений.

**Verification:**

- [x] Подготовлен ручной runbook: `docs/test-runs/max-media-type-manual-run.md`.
- [x] Проверен результат в тестовом получателе МАХ.
- [x] Ошибок не зафиксировано; Zabbix показал успешное тестирование способа оповещения.
- [x] Документация обновлена только по фактически проверенному поведению.

**Result:** Ручной тест Zabbix Media type `MAX` выполнен успешно. Сообщение доставлено в МАХ. Результат зафиксирован обезличенно в `docs/test-runs/max-media-type-manual-run.md`. В доставленном тестовом сообщении остались `{ALERT.SUBJECT}` и `{ALERT.MESSAGE}`, потому что ручной тест был выполнен с макросами как с тестовыми строками. Этот прогон подтверждает транспорт Zabbix -> MAX и авторизацию бота, но не проверяет подстановку макросов в реальном Action.

**Dependencies:** Task 1, Task 1.1

**Files likely touched:**

- `docs/test-runs/`
- `docs/zabbix-media-type.md`
- `examples/media-params.md`
- `tasks/todo.md`

**Estimated scope:** Small: 1-2 files

---

## Task 3: Проверить Problem и Recovery

**Description:** Проверить доставку уведомления о проблеме и уведомления о восстановлении через тот же Media type `MAX`.

**Method:** Problem/Recovery run

**Skill:** `debugging-and-error-recovery`

**Acceptance criteria:**

- [ ] Проверено событие Problem.
- [ ] Проверено событие Recovery.
- [ ] Формат сообщений описан только по фактическому результату проверки.

**Verification:**

- [ ] Проверен текст Problem-сообщения.
- [ ] Проверен текст Recovery-сообщения.
- [ ] При расхождении между ожидаемым и фактическим поведением создана отдельная задача или ADR.

**Dependencies:** Task 2

**Files likely touched:**

- `docs/zabbix-media-type.md`
- `tasks/todo.md`

**Estimated scope:** Small: 1-2 files

---

## Task 4: Описать получение идентификатора получателя в МАХ

**Description:** Подготовить нейтральное описание порядка получения идентификатора получателя в МАХ для личной или групповой отправки.

**Method:** Documentation update

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [ ] Описан общий порядок получения идентификатора получателя.
- [ ] Разделены сценарии личного получателя и группового чата.
- [ ] Примеры обезличены.

**Verification:**

- [ ] Документ можно использовать для повторной настройки.
- [ ] Нет реальных идентификаторов, внутренних адресов и организационных названий.
- [ ] Проверено соответствие `docs/documentation-policy.md`.

**Dependencies:** None

**Files likely touched:**

- `docs/zabbix-media-type.md`
- `examples/media-params.md`

**Estimated scope:** Small: 1-2 files

---

## Task 5: Описать перенос или повторное создание Media type

**Description:** Описать, как повторно создать Media type `MAX` в Zabbix или перенести его в другую среду без публикации чувствительных значений.

**Method:** Documentation update

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [ ] Описан ручной способ создания Media type.
- [ ] Описан порядок проверки параметров после переноса.
- [ ] Отдельно указано, какие значения задаются только в целевой системе.

**Verification:**

- [ ] Инструкция сверена с текущим `docs/zabbix-media-type.md`.
- [ ] README не дублирует критерии завершения проекта.
- [ ] Выполнен `npm test`.

**Dependencies:** Task 1

**Files likely touched:**

- `docs/zabbix-media-type.md`
- `examples/`

**Estimated scope:** Medium: 2-3 files

---

## Task 6: Принять техническое решение по локальной проверке форматирования

**Description:** До написания кода определить, как именно проверять формирование текста webhook-сообщения вне Zabbix runtime. Решение должно быть зафиксировано в ADR.

**Method:** ADR before implementation

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [ ] Создан ADR в `docs/decisions/`.
- [ ] В ADR указан выбранный способ проверки форматирования.
- [ ] В ADR указано, какие ограничения Zabbix runtime не эмулируются.
- [ ] До принятия ADR код тестового harness не добавляется.

**Verification:**

- [ ] ADR содержит контекст, решение, альтернативы и последствия.
- [ ] Решение не требует реального подключения к МАХ.
- [ ] Решение не меняет поведение `max-webhook.js` без отдельной задачи.

**Dependencies:** Task 1

**Files likely touched:**

- `docs/decisions/`
- `tasks/todo.md`

**Estimated scope:** Small: 1-2 files

---

## Task 6.1: Перенести проверку репозитория на Node.js policy tests и GitHub Actions

**Status:** Done

**Description:** Зафиксировать ADR и перенести базовую проверку репозитория из shell-скрипта в Node.js policy tests с автоматическим запуском через GitHub Actions.

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
- [x] Добавлены `tests/repo-structure.test.js`, `tests/docs-wording.test.js`, `tests/media-params.test.js`, `tests/webhook-static.test.js`.
- [ ] Выполнен `npm test` локально или дождаться успешного GitHub Actions.

**Result:** Миграция проверки репозитория выполнена. Основная команда проверки теперь `npm test`; GitHub Actions запускает ее автоматически. Старый shell-скрипт удален.

**Dependencies:** ADR-0004

**Files likely touched:**

- `docs/decisions/`
- `.github/workflows/`
- `tests/`
- `package.json`
- `README.md`
- `AGENTS.md`
- `DEVELOPMENT.md`
- `docs/project-acceptance.md`
- `tasks/plan.md`
- `tasks/todo.md`

**Estimated scope:** Medium: 5-10 files

---

## Task 7: Реализовать локальную проверку форматирования после ADR

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

**Files likely touched:**

- `tests/`
- `package.json`
- `docs/decisions/`

**Estimated scope:** Medium: 3-5 files

---

## Task 8: Провести review документации, задач и webhook-логики

**Description:** Проверить, что документация, задачи, ADR и webhook-логика согласованы между собой, а project-level критерии завершения находятся только в `docs/project-acceptance.md`.

**Method:** Code and documentation review

**Skill:** `code-review-and-quality`

**Acceptance criteria:**

- [ ] Проверены `README.md`, `AGENTS.md`, `DEVELOPMENT.md`, `docs/`, `tasks/`.
- [ ] Проверено, что ADR находятся только в `docs/decisions/`.
- [ ] Проверено, что задачи находятся только в `tasks/plan.md` и `tasks/todo.md`.
- [ ] Проверено, что project-level критерии завершения не дублируются вне `docs/project-acceptance.md`.

**Verification:**

- [ ] Выполнен `npm test`.
- [ ] Проверены чек-листы `.agents/checklists/`.
- [ ] Найденные замечания оформлены отдельными задачами или исправлены минимально.

**Dependencies:** Task 1, Task 4, Task 5, Task 6

**Files likely touched:**

- `README.md`
- `AGENTS.md`
- `DEVELOPMENT.md`
- `docs/`
- `tasks/`

**Estimated scope:** Medium: 3-5 files

---

## Task 9: Оценить необходимость отдельного bot-service

**Description:** После первого этапа и фактических прогонов оценить, достаточно ли прямого Zabbix Webhook или нужен отдельный сервис для будущего развития.

**Method:** Technical decision review

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [ ] Описаны признаки, при которых прямого webhook недостаточно.
- [ ] Описаны плюсы и минусы отдельного сервиса.
- [ ] При необходимости создан ADR до начала реализации.

**Verification:**

- [ ] Есть результаты первого этапа или пилота.
- [ ] Решение не реализуется без ADR.
- [ ] Граница текущего этапа не изменена незаметно.

**Dependencies:** Task 8

**Files likely touched:**

- `docs/decisions/`
- `docs/project-context.md`
- `tasks/plan.md`

**Estimated scope:** Small: 1-2 files

---

## Task 10: Описать варианты повторной отправки и журнала доставки

**Description:** Подготовить описание возможного развития после первого этапа: повторная отправка, журнал попыток доставки, отдельные маршруты по группам получателей.

**Method:** Future options documentation

**Skill:** `documentation-and-adrs`

**Acceptance criteria:**

- [ ] Описаны варианты без немедленной реализации.
- [ ] Указаны ограничения прямого webhook-подхода.
- [ ] Решение о реализации вынесено в будущий ADR.

**Verification:**

- [ ] Документ не требует изменения текущего webhook.
- [ ] Не добавлены новые компоненты без решения.
- [ ] Формулировки соответствуют `docs/documentation-policy.md`.

**Dependencies:** Task 9

**Files likely touched:**

- `docs/project-context.md`
- `docs/decisions/`
- `tasks/plan.md`

**Estimated scope:** Small: 1-2 files
