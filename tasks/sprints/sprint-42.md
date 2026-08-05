# Sprint 42: Конфигурация (ADR-0045/0046) — follow-up ревью PR #23 (раунды 5–7)

**Цель:** закрыть замечания auto-review PR #23 (раунды 5–7, Approve with
comments) перед боевым запуском long-polling режима: M1 (зависание start при
сетевом сбое poll), M2 (двойной инкремент `boots` в синтетическом режиме),
R5-M3 (required отсутствующих plugin-веток), L1–L3 (plugin-`$VAR` в UI,
рассинхрон `pendingRemainingMs`, stage-валидация до слияния секретов), L5
(дрейф доков карантина), R6-M1 (rollback 500 на битом lkg) и R7 L1–L4
(необъявленные system-ключи в diff/stage, карантин при ручном rollback,
асинхронный контракт рестарта, нормализация `version: null`). R5–R6 и R7
уже исправлены в PR.

**ADR:** [ADR-0045](../../docs/decisions/ADR-0045-config-file-source-of-truth.md)
[ADR-0046](../../docs/decisions/ADR-0046-schema-driven-config-webui.md)
**Источник:** ревью PR #23, комментарии `5186794443` (round 5),
`5186875105` (round 6)

**Контекст:** ревьюер подтвердил фиксы раундов 1–5 и вынес новые
замечания. Блокеров нет; M1–M2, R5-M3 и L1–L3 — задачи «до merge»/«до
боевого запуска» (M1 — обязательно перед long-polling на стенде). L5 и
R6-M1 поправлены в этом же PR.

**Границы:** без изменений поведения webhook (`src/zabbix-media-type/`).
Только бот-платформа/UI/docs.

## Architecture Decisions

- **M1 (зависание firstTick):** ожидание первого успешного poll ограничено
  (таймаут / N неудач). При устойчивом сетевом сбое процесс либо корректно
  выходит с ненулевым кодом (рестарт-политика + счётчик `boots` дают
  авто-откат), либо продолжает работу без подтверждения — поведение
  фиксируется в runbook.
- **M2 (двойной boots):** `runStartupConfigDetector` выполняется ровно один
  раз за boot в любом режиме (передача созданного app/конфига в
  `startBotPlatformService` или гард-флаг). Crash-loop откат — по честным
  `boots` (5 попыток), не 3.
- **L1:** до первого реального плагина с configSchema фиксируем документацию:
  несекретные plugin-поля не резолвят `$VAR` на runtime, UI предупреждает о
  литерале. Позже — fail-fast на резолв/предупреждение.
- **L2:** `pendingRemainingMs` считается от той же базы, что и откат
  (`lastBoot` + `boots`), либо отображается без числа (только отображение).
- **L3:** Stage валидирует staged после слияния секретов
  (`mergePreservedSecrets`), а не до — литеральный секрет из активного файла
  отклоняется на Stage (400), а не всплывает только на Apply.
- **R5-M3 (required отсутствующих plugin-веток):** required-поля валидируются
  и для веток плагинов, отсутствующих в `rawConfig.plugins` (сейчас
  `validateConfigFile` и клиент итерируют только присутствующие ветки — для
  плагина с обязательными полями это «тихая» неконфигурация).
- **R6-M1 (rollback 500):** битый lkg читается толерантно
  (`readJsonFileSafe`) и превращается в `CONFIG_VALIDATION_ERROR` (400),
  а не raw SyntaxError (500). Уже исправлено в PR.
- **R7-L1 (утечка system-ключей):** необъявленные схемой ключи системных
  секций (и целиком необъявленные секции) — те же потенциальные секреты,
  что и необъявленные ключи плагинов (m4): в `stage`/`diff` не попадают,
  в `maskStagedSecrets` маскируются (литерал/$VAR → `{ secret, set }`).
  `GET /api/config` не затронут (отдаёт только ключи схемы).
- **R7-L2 (карантин при ручном rollback):** текущий активный файл перед
  записью lkg карантинится (`quarantineActiveFile`), как при авто-откате —
  битый JSON активного файла не затирается без улики. Результат отдаёт
  `quarantinePath`.
- **R7-L3 (асинхронный контракт рестарта):** делегированный `configRestart`
  обязан завершать процесс после отправки `202` и установки `state.pending`
  (next tick / setImmediate). Сейчас `restart=null` во всех прод-путях —
  путь дремлет; контракт зафиксирован в ADR-0046 и runbook §3.
- **R7-L4 (нормализация version: null):** `version: null` трактуется как
  отсутствующий (`readVersion` отображает null → 1); `withExplicitVersion`
  добавляет явный `version` — round-trip Apply/import не сохраняет `null`.

## Tasks

### Task 1: M1 — зависание `start()` при устойчивом сетевом сбое poll

**Status:** Pending

**Description:** `live-service.js` — `await service.firstTick`
(`firstTick` резолвится только после первого успешного `pollUpdates`). При
неверном `MAX_BOT_TOKEN`/`MAX_API_URL` (401, connection refused) poll падает
всегда → `firstTick` не резолвится → `main()` не доходит до `confirm()` →
pending-маркер висит вечно. Процесс не падает → systemd не рестартует →
`boots` не растёт → авто-откат для сетевых сбоев не срабатывает.

Фикс: ограничить ожидание (firstTick после первого успеха ИЛИ таймаут /
N неудач); при сбое — либо корректный exit != 0 (рестарт-политика + boots
дадут rollback), либо продолжение работы без подтверждения. Поведение
задокументировать в runbook.

**Acceptance criteria:**
- [ ] При неверных MAX_BOT_TOKEN/MAX_API_URL процесс не висит бесконечно: таймаут/N-неудач → exit != 0 или работа без подтверждения
- [ ] Покрыто тестом (симуляция: N неудачных poll без резолва firstTick)
- [ ] Поведение зафиксировано в `docs/runbooks/config-file.md` (или профильном runbook)
- [ ] `npm test` зелёный

**Files:** `src/bot-platform/core/live-service.js`,
`src/bot-platform/app.js`, тесты `tests/bot-platform/*`,
`docs/runbooks/*`

**Dependencies:** — (фикс R4-L1 уже в коде)

**Estimated scope:** M

---

### Task 2: M2 — двойной инкремент `boots` в синтетическом режиме

**Status:** Pending

**Description:** `main()` создаёт app/core один раз (`app.js`), затем
`startBotPlatformService` создаёт второй app → `runStartupConfigDetector`
запускается дважды за boot. Симуляция: boot1→boots=1,2; boot2→3,4;
boot3→5 — откат по crash-loop после 3 boot вместо 5. Live-режим не
затронут.

Фикс: передавать созданный app/конфиг в `startBotPlatformService` или
гард-флаг, чтобы детектор выполнялся ровно один раз за boot.

**Acceptance criteria:**
- [ ] Детектор выполняется ровно один раз за boot в синтетическом режиме (симуляция: откат по crash-loop после 5 boot)
- [ ] Live-режим без изменений (регресс-тест)
- [ ] `npm test` зелёный

**Files:** `src/bot-platform/app.js`,
`src/bot-platform/core/index.js`,
тесты `tests/bot-platform/config-recovery.test.js`

**Dependencies:** —

**Estimated scope:** S

---

### Task 3: L1 — несекретные plugin-`$VAR` в UI (документация до первого плагина)

**Status:** Pending

**Description:** Несекретные объявленные plugin-поля отдают `$VAR` в UI
(`getConfig` маскирует только секреты). Runtime не резолвит plugin-`$VAR` —
плагин получит литерал. Нет fail-fast и предупреждения. До первого реального
плагина с configSchema зафиксировать поведение в документации; в UI — пометку
«значение не резолвится»/warning при необходимости.

**Acceptance criteria:**
- [ ] Поведение описано в документации плагинов/configSchema (ADR-0046 или профильный док)
- [ ] (Опционально) UI предупреждает о нерезолвящемся `$VAR` в несекретном plugin-поле
- [ ] `npm test` зелёный

**Files:** `docs/decisions/ADR-0046-schema-driven-config-webui.md`,
`src/queue-monitor/api/config.js`, `src/queue-monitor/ui/src/lib/configSchemaModel.js`

**Dependencies:** —

**Estimated scope:** S

---

### Task 4: L2 — рассинхрон `pendingRemainingMs`

**Status:** Pending

**Description:** `pendingRemainingMs` отсчитывается от `appliedAt`
(`config.js`), а откат — от `lastBoot` + `boots`. После медленного
авто-рестарта UI показывает ~0 сек, пока окно реально ещё живо. Только
отображение. Привести к общей базе (`lastBoot` + `boots`) или скрывать
число, когда базы расходятся.

**Acceptance criteria:**
- [ ] UI-таймер и фактический откат используют согласованную базу (или число скрывается)
- [ ] `npm test` зелёный

**Files:** `src/queue-monitor/api/config.js`,
`src/queue-monitor/ui/src/pages/SettingsPage.jsx` (или компонент таймера)

**Dependencies:** —

**Estimated scope:** S

---

### Task 5: L3 — Stage валидирует staged до слияния секретов

**Status:** Pending

**Description:** Литеральный секрет в активном файле (ручная правка)
переезжает в staged через `mergePreservedSecrets` при Stage (200 OK) и
всплывает только на Apply (400) — оператор не может его увидеть/исправить
в UI. Stage должен валидировать staged после слияния секретов (как Apply),
отклоняя литерал на этапе редактирования.

**Acceptance criteria:**
- [ ] Stage отклоняет литеральный секрет из активного файла (400 со списком полей)
- [ ] Регресс-тест в `tests/queue-monitor/api/config.test.js`
- [ ] `npm test` зелёный

**Files:** `src/queue-monitor/api/config.js`,
`src/bot-platform/core/config-store.js`,
`tests/queue-monitor/api/config.test.js`

**Dependencies:** —

**Estimated scope:** S

---

### Task 6: R5-M3 — required-поля целиком отсутствующих plugin-веток

**Status:** Pending

**Description:** `validateConfigFile` (сервер) и `validateSectionValues`
(клиент) обходят только ветки, присутствующие в `rawConfig.plugins` / в
форме. Импорт конфига без ветки `plugins.<name>` при схеме с
`required: true` проходит без ошибок — «тихая» неконфигурация до первого
плагина с обязательными полями. Требуется: required-поля валидируются и для
отсутствующих веток объявленных плагинов (наличие ветки тоже становится
частью валидации), согласованно сервер/клиент.

**Acceptance criteria:**
- [ ] Сервер: `plugins: {}` при схеме плагина с `required`-полем → ошибка валидации (поле указано)
- [ ] Клиент: `validateSectionValues` даёт ту же ошибку при отсутствующей ветке плагина
- [ ] Плагин без required-полей не ломается при отсутствующей ветке (регресс)
- [ ] Регресс-тесты в `config-schema`/UI-тестах; `npm test` зелёный

**Files:** `src/bot-platform/core/config-schema.js`,
`src/queue-monitor/ui/src/lib/configSchemaModel.js`,
тесты `tests/bot-platform/config-store.test.js`,
`src/queue-monitor/ui/test/configSchemaModel.test.js`

**Dependencies:** —

**Estimated scope:** M

---

### Task 7: R7 L1–L4 — утечка system-ключей, карантин rollback, async-контракт рестарта, version: null

**Status:** Done (в PR #23)

**Description:** закрыть Low-замечания round-7 (review id `4860616364`):

- **L1:** `computeConfigDiff` и `maskStagedSecrets` пропускали только
  объявленные `SYSTEM_SCHEMA` ключи — необъявленные (ручная правка, `$VAR`
  или литерал) утекали в `stage`/`diff`-ответы (асимметрия с плагинами m4).
  Фикс: `isDeclaredSystemField` — необъявленные ключи в diff не попадают;
  в `maskStagedSecrets` маскируются до `{ secret, set }`.
- **L2:** `rollbackConfig` молча затирал текущий активный файл (в худшем
  случае битый JSON) без улики. Фикс: карантин через `quarantineActiveFile`,
  путь в результате и audit-логе.
- **L3:** `applyConfig` вызывает `options.restart` синхронно внутри — при
  подключённом рестарте потерялся бы ответ 202 и `state.pending`. Сейчас
  `restart=null` во всех прод-путях (дремлет); контракт асинхронности
  зафиксирован в ADR-0046 и runbook §3.
- **L4:** `version: null` не нормализовался (`withExplicitVersion` проверял
  только `!== undefined`) — round-trip сохранял `null` в файле. Фикс:
  null трактуется как отсутствующий, добавляется явный `version`.

**Acceptance criteria:**
- [x] L1: необъявленные system-ключи/секции не в diff; в stage маскируются (3 регресса)
- [x] L2: ручной rollback карантинит активный файл (регресс + `quarantinePath`)
- [x] L3: async-контракт `configRestart` в ADR-0046 + runbook §3
- [x] L4: `version: null` → явный `version` (регресс)
- [x] `npm test` зелёный

**Files:** `src/queue-monitor/api/config.js`, `src/bot-platform/core/config-store.js`,
`src/bot-platform/core/config-migrations.js`, `docs/decisions/ADR-0046*`,
`docs/runbooks/config-file.md`, тесты `tests/queue-monitor/api/config.test.js`,
`tests/bot-platform/config-store.test.js`, `tests/bot-platform/config-migrations.test.js`

**Dependencies:** —

**Estimated scope:** S (уже сделано в PR #23)

---

## Checkpoint: Sprint 42

- [ ] M1: start не висит при сетевом сбое poll
- [ ] M2: boots растёт 1 раз за boot (crash-loop откат после 5 boot)
- [ ] R5-M3: required отсутствующих plugin-веток (сервер и клиент)
- [ ] L1: plugin-`$VAR` документирован
- [ ] L2: pendingRemainingMs согласован с откатом
- [ ] L3: Stage валидирует после слияния секретов
- [x] R7 L1–L4: утечка system-ключей, карантин rollback, async-контракт рестарта, `version: null`
- [ ] `npm test` зелёный; PR #23 merged

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| M1 «зомби»-процесс на боевом long-polling | High | Таймаут/N-неудач firstTick + exit/работа без подтверждения; задача до боевого запуска |
| M2 ложный откат по crash-loop на стенде | Medium | Гард-флаг/проброс app; симуляция boots |
| R5-M3 «тихая» неконфигурация плагина | Medium | Валидация required для отсутствующих веток; до первого плагина с required-полями |
| Дрейф доков (карантин) | Low | L5 исправлен в PR; doc-синк в конце спринта |

## Файлы для изменения (сводка)

```
src/bot-platform/core/live-service.js     (M1)
src/bot-platform/app.js                   (M1/M2)
src/bot-platform/core/index.js            (M2)
src/bot-platform/core/config-schema.js    (R5-M3)
src/queue-monitor/api/config.js           (L1/L2/L3)
src/queue-monitor/ui/...                  (L1/L2, R5-M3 клиент)
docs/runbooks/*, docs/decisions/ADR-0046  (L1, M1-поведение)
tests/                                    (M1/M2/R5-M3/L3 регрессы)
```
