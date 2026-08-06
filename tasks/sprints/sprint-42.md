# Sprint 42: Конфигурация (ADR-0045/0046) — follow-up ревью PR #23 (раунды 5–17)

**Цель:** закрыть замечания auto-review PR #23 (раунды 5–9, Approve with
comments) перед боевым запуском long-polling режима: M1 (зависание start при
сетевом сбое poll), M2 (двойной инкремент `boots` в синтетическом режиме),
R5-M3 (required отсутствующих plugin-веток), L1–L3 (plugin-`$VAR` в UI,
рассинхрон `pendingRemainingMs`, stage-валидация до слияния секретов), L5
(дрейф доков карантина), R6-M1 (rollback 500 на битом lkg), R7 L1–L4
(необъявленные system-ключи в diff/stage, карантин при ручном rollback,
асинхронный контракт рестарта, нормализация `version: null`), R8-L1
(нестроковые необъявленные значения в stage-ответах) и R9 N1/N2
(утечка нестроковых необъявленных значений веток плагинов в `GET /api/config`,
валидация `default` в `validateConfigSchema`). R5–R9 уже исправлены в PR.
Раунды 16–17 добавили не отслеживавшиеся Low (R11-L3, R5-L1, R5-L6),
trade-off R13-M2 и doc-задачу про связку systemd StartLimit ↔ детектор
(Tasks 11–13).

**ADR:** [ADR-0045](../../docs/decisions/ADR-0045-config-file-source-of-truth.md)
[ADR-0046](../../docs/decisions/ADR-0046-schema-driven-config-webui.md)
**Источник:** ревью PR #23, комментарии `5186794443` (round 5),
`5186875105` (round 6), `5190202811` (round 16), `5190332751` (round 17)

**Контекст:** ревьюер подтвердил фиксы раундов 1–5 и вынес новые
замечания. Блокеров нет; M1–M2, R5-M3 и L1–L3 — задачи «до merge»/«до
боевого запуска» (M1 — обязательно перед long-polling на стенде). L5 и
R6-M1 поправлены в этом же PR. Sprint закрыт: все задачи Done, `npm test`
зелёный (994).

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
- **R8-L1 (нестроковые необъявленные значения):** в `maskStagedSecrets`
  необъявленный ключ с нестроковым значением (объект/массив/число/булево)
  отбрасывается целиком — структура/значение не утекают в
  `GET/POST /api/config/stage`. Политика единая для системных секций и
  веток плагинов (строки маскируются до `{ secret, set }`, как раньше;
  объявленные поля не трогаются). `computeConfigDiff` такие ключи уже
  выкидывал (`isDeclaredSystemField`) — теперь согласован и stage-ответ.
- **R9-N1 (утечка в GET /api/config):** R8-фикс применялся только к
  `maskStagedSecrets`; `buildEffectiveSections` копировал ветку плагина
  целиком (`{ ...pluginValue }`) и нестроковые необъявленные значения
  утекали в `GET /api/config`. Единая политика необъявленных ключей
  перенесена и туда (нестроковое → `delete`); цикл унифицирован по
  `schema[key]` (как `maskStagedSecrets`), а не `isDeclaredPluginField`.
- **R9-N2 (валидация default):** `validateConfigSchema` (plugin-loader)
  теперь валидирует `default` полей configSchema той же проверкой, что и
  значения (`validateFieldValue` — type/enum/min/max, согласована с UI
  `coerceValue`/`validateValue`). Схема `{ type: 'number', default: 'x' }`
  отклоняется при загрузке, а не ломает UI-поле при первом реальном плагине.

## Tasks

### Task 1: M1 — зависание `start()` при устойчивом сетевом сбое poll

**Status:** Done

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
- [x] При неверных MAX_BOT_TOKEN/MAX_API_URL процесс не висит бесконечно: таймаут/N-неудач → exit != 0 или работа без подтверждения
- [x] Покрыто тестом (симуляция: N неудачных poll без резолва firstTick)
- [x] Поведение зафиксировано в `docs/runbooks/config-file.md` (или профильном runbook)
- [x] `npm test` зелёный

**Files:** `src/bot-platform/runtime/live-service.js`,
`src/bot-platform/app.js`, тесты `tests/bot-platform/*`,
`docs/runbooks/*`

**Dependencies:** — (фикс R4-L1 уже в коде)

**Estimated scope:** M

---

### Task 2: M2 — двойной инкремент `boots` в синтетическом режиме

**Status:** Done

**Description:** `main()` создаёт app/core один раз (`app.js`), затем
`startBotPlatformService` создаёт второй app → `runStartupConfigDetector`
запускается дважды за boot. Симуляция: boot1→boots=1,2; boot2→3,4;
boot3→5 — откат по crash-loop после 3 boot вместо 5. Live-режим не
затронут.

Фикс: передавать созданный app/конфиг в `startBotPlatformService` или
гард-флаг, чтобы детектор выполнялся ровно один раз за boot.

**Acceptance criteria:**
- [x] Детектор выполняется ровно один раз за boot в синтетическом режиме (симуляция: откат по crash-loop после 5 boot)
- [x] Live-режим без изменений (регресс-тест)
- [x] `npm test` зелёный

**Files:** `src/bot-platform/app.js`,
`src/bot-platform/core/index.js`,
тесты `tests/bot-platform/config-recovery.test.js`

**Dependencies:** —

**Estimated scope:** S

---

### Task 3: L1 — несекретные plugin-`$VAR` в UI (документация до первого плагина)

**Status:** Done

**Description:** Несекретные объявленные plugin-поля отдают `$VAR` в UI
(`getConfig` маскирует только секреты). Runtime не резолвит plugin-`$VAR` —
плагин получит литерал. Нет fail-fast и предупреждения. До первого реального
плагина с configSchema зафиксировать поведение в документации; в UI — пометку
«значение не резолвится»/warning при необходимости.

**Acceptance criteria:**
- [x] Поведение описано в документации плагинов/configSchema (ADR-0046 или профильный док)
- [ ] (Опционально) UI предупреждает о нерезолвящемся `$VAR` в несекретном plugin-поле
- [x] `npm test` зелёный

**Files:** `docs/decisions/ADR-0046-schema-driven-config-webui.md`,
`src/queue-monitor/api/config.js`, `src/queue-monitor/ui/src/lib/configSchemaModel.js`

**Dependencies:** —

**Estimated scope:** S

---

### Task 4: L2 — рассинхрон `pendingRemainingMs`

**Status:** Done

**Description:** `pendingRemainingMs` отсчитывается от `appliedAt`
(`config.js`), а откат — от `lastBoot` + `boots`. После медленного
авто-рестарта UI показывает ~0 сек, пока окно реально ещё живо. Только
отображение. Привести к общей базе (`lastBoot` + `boots`) или скрывать
число, когда базы расходятся.

**Acceptance criteria:**
- [x] UI-таймер и фактический откат используют согласованную базу (или число скрывается)
- [x] `npm test` зелёный

**Files:** `src/queue-monitor/api/config.js`,
`src/queue-monitor/ui/src/pages/SettingsPage.jsx` (или компонент таймера)

**Dependencies:** —

**Estimated scope:** S

---

### Task 5: L3 — Stage валидирует staged до слияния секретов

**Status:** Done

**Description:** Литеральный секрет в активном файле (ручная правка)
переезжает в staged через `mergePreservedSecrets` при Stage (200 OK) и
всплывает только на Apply (400) — оператор не может его увидеть/исправить
в UI. Stage должен валидировать staged после слияния секретов (как Apply),
отклоняя литерал на этапе редактирования.

**Acceptance criteria:**
- [x] Stage отклоняет литеральный секрет из активного файла (400 со списком полей)
- [x] Регресс-тест в `tests/queue-monitor/api/config.test.js`
- [x] `npm test` зелёный

**Files:** `src/queue-monitor/api/config.js`,
`src/bot-platform/core/config-store.js`,
`tests/queue-monitor/api/config.test.js`

**Dependencies:** —

**Estimated scope:** S

---

### Task 6: R5-M3 — required-поля целиком отсутствующих plugin-веток

**Status:** Done

**Description:** `validateConfigFile` (сервер) и `validateSectionValues`
(клиент) обходят только ветки, присутствующие в `rawConfig.plugins` / в
форме. Импорт конфига без ветки `plugins.<name>` при схеме с
`required: true` проходит без ошибок — «тихая» неконфигурация до первого
плагина с обязательными полями. Требуется: required-поля валидируются и для
отсутствующих веток объявленных плагинов (наличие ветки тоже становится
частью валидации), согласованно сервер/клиент.

**Acceptance criteria:**
- [x] Сервер: `plugins: {}` при схеме плагина с `required`-полем → ошибка валидации (поле указано)
- [x] Клиент: `validateSectionValues` даёт ту же ошибку при отсутствующей ветке плагина
- [x] Плагин без required-полей не ломается при отсутствующей ветке (регресс)
- [x] Регресс-тесты в `config-schema`/UI-тестах; `npm test` зелёный

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

### Task 8: R8-L1 — нестроковые необъявленные значения в stage-ответах

**Status:** Done (в PR #23)

**Description:** Low-замечание round-8 (comment `5187126607`): фикс R7-L1
маскировал в `maskStagedSecrets` только строковые необъявленные ключи
системных секций — объектные/массивные значения уходили в ответы
`GET/POST /api/config/stage` в открытом виде
(`extraNested: { token: 'sk-nested' }`). `computeConfigDiff` такие ключи уже
выкидывал — рассинхрон был только в stage-ответе.

Фикс: единая политика необъявленных ключей для системных секций и веток
плагинов — непустая строка ($VAR/литерал) маскируется до `{ secret, set }`;
нестроковое значение (объект/массив/число/булево) отбрасывается целиком.
Объявленные поля схемы не трогаются (в т.ч. уже замаскированные секреты —
ключ пропускается по наличию в схеме, а не по `isDeclaredPluginField`).
`isVarReference` больше не используется в маскировании (строковый
прецедент покрыт `typeof === 'string'`).

**Acceptance criteria:**
- [x] R8: объект/массив/число/булево в необъявленном ключе не утекают в stage-ответ (регрессы)
- [x] R8: объявленные секреты плагинов не отбрасываются (регресс `putStage` зелёный)
- [x] R8: пустая строка не маскируется (не секрет)
- [x] `npm test` зелёный

**Files:** `src/queue-monitor/api/config.js`,
тесты `tests/queue-monitor/api/config.test.js`

**Dependencies:** —

**Estimated scope:** S (уже сделано в PR #23)

---

### Task 9: R9 N1/N2 — утечка в GET /api/config, валидация default в configSchema

**Status:** Done (в PR #23)

**Description:** закрыть findings round-9 (comment `5187207500`, Approve with
comments):

- **N1 (LOW→MEDIUM):** R8-фикс применялся только к `maskStagedSecrets`
  (stage/diff/import), но `buildEffectiveSections` (строки 450–461 до фикса)
  копировал ветку плагина целиком — нестроковые необъявленные значения
  утекали в `GET /api/config`
  (`plugins.legacy.nested = { token: 'sk-nested' }, retries: 3`).
  Тесис R7-L1 «GET /api/config не затронут» верен только для системных
  секций. Фикс: единая политика необъявленных ключей перенесена в
  `buildEffectiveSections` (нестроковое значение → `delete`; непустая строка
  → `{ secret, set }`). Стиль/семантика цикла унифицированы с
  `maskStagedSecrets` (skip по `schema[key]`, а не `isDeclaredPluginField`);
  `isVarReference` из импортов `api/config.js` удалён (не используется).
- **N2 (LOW):** `validateConfigSchema` (plugin-loader) не валидировал
  `default` против `type`/`enum`/`min`/`max` — схема
  `{ type: 'number', default: 'x' }` принималась при загрузке, но поле в UI
  становилось нередактируемым/несохраняемым (`fieldDefault` неверного типа,
  `coerceValue` → undefined, `validateValue` — неразрешимая ошибка). Фикс:
  `default` валидируется `validateFieldValue` (та же проверка, что и реальные
  значения, — не может разойтись с runtime).

**Acceptance criteria:**
- [x] N1: `GET /api/config` не отдаёт нестроковые необъявленные значения веток плагинов (регрессы: schemaless + с configSchema)
- [x] N1: объявленные поля плагинов видимы, секреты — статус (регресс)
- [x] N2: `default` неверного типа / вне enum / вне min-max → ошибка загрузки; валидные дефолты проходят (регрессы)
- [x] `npm test` зелёный

**Files:** `src/queue-monitor/api/config.js`, `src/bot-platform/core/plugin-loader.js`,
тесты `tests/queue-monitor/api/config.test.js`, `tests/bot-platform/plugin-loader.test.js`

**Dependencies:** —

**Estimated scope:** S (уже сделано в PR #23)

---

### Task 10: F10-L1 — предупреждение о потерях необъявленных ключей при Import/Save

**Status:** Done (в PR #23)

**Description:** закрыть finding round-10 **F10-L1 (LOW)** — «Import → Save
в UI молча теряет необъявленные значения плагинов (в т.ч. `$VAR`-секреты),
которых нет в активном конфиге». Решение пользователя: предупреждение в
import-ответе + документация (рунбук). Обратная сторона политики
R8/R9 «маскировать/удалять»: `mergePreservedSecrets` возвращает только
ключи, уже присутствующие в активном конфиге, поэтому пришедшие с
импортом `plugins.legacy = { retries: 3, token: '$LEGACY' }` при пустой
схеме после round-trip «форма → Save» превращаются в `{}`.

**Выполнено:**
- `findUndeclaredMaskedKeys(fileConfig, activeConfig, plugins)` в
  `src/queue-monitor/api/config.js` — собирает `section.key` /
  `plugins.<name>.<key>` для необъявленных ключей, ОТСУТСТВУЮЩИХ в активном
  конфиге (ключи из активного переживут Save — не в warnings).
- `warnings` добавлены в ответы `PUT /api/config/stage`,
  `GET /api/config/stage`, `POST /api/config/import` (вычисляются ДО
  `mergePreservedSecrets`, т.к. тот мутирует `fileConfig`).
- UI (`SettingsPage.handleImportFile`): при непустых `warnings` — toast
  `warning` со списком ключей; новый стиль `warning` в `showToast.js`
  (токены `--warning` из `index.css`).
- Документация: рунбук `docs/runbooks/config-file.md` §3 (когда ключи
  теряются, как сохранить) и ADR-0046 (контракт поля `warnings`).

**Acceptance criteria:**
- [x] import с необъявленными ключами (нет в active) → `data.warnings` их перечисляет; ключи в staged-файле целы (теряются только при Save из формы)
- [x] ключи, присутствующие в active, в `warnings` не попадают
- [x] необъявленные ключи системных секций (`bot.extraKey`) тоже в `warnings`
- [x] putStage/getStage отдают `warnings` так же, как import
- [x] `npm test` зелёный (957)

**Files:** `src/queue-monitor/api/config.js`, `src/queue-monitor/ui/src/pages/SettingsPage.jsx`,
`src/queue-monitor/ui/src/lib/showToast.js`, `docs/runbooks/config-file.md`,
`docs/decisions/ADR-0046-schema-driven-config-webui.md`,
тесты `tests/queue-monitor/api/config.test.js`

**Dependencies:** —

**Estimated scope:** S

---

### Task 11: R13-M2 — авто-откат на следующем boot после ручного Apply

**Status:** Done

**Description:** trade-off из round 13, нигде не отслеживался (заведён
round 17). `config-store.js:563-586`: после ручного Apply первый boot пишет
`lastBoot` без окна StartupWait (`pendingAgeMs = 0`, `boots = 1`) и
продолжает с нового конфига. Но любой следующий boot с интервалом
≥ `startupWaitMs` (30s) от `lastBoot` устаревает окно → авто-откат к lkg
даже при **одиночном** краше до подтверждения конфига.

Требуется зафиксировать решение: либо оставить как есть (окно — защита
только от crash-loop, не от одиночного краша; подтверждение конфига — забота
оператора/`confirmConfig`), либо расширить (учитывать confirm-статус / не
откатывать при единичном краше). Минимум — документировать trade-off.

**Acceptance criteria:**
- [x] Решение зафиксировано в `docs/runbooks/config-file.md` (или ADR-0046)
- [x] Текущее поведение покрыто тестом (регресс на `runStartupConfigDetector`: 2-й boot через >30s от lastBoot → откат)
- [x] `npm test` зелёный

**Files:** `src/bot-platform/core/config-store.js`,
`docs/runbooks/config-file.md`,
тесты `tests/bot-platform/config-store.test.js`

**Dependencies:** —

**Estimated scope:** S

---

### Task 12: R17-doc — связка systemd StartLimit и детектора maxStartupAttempts

**Status:** Done

**Description:** systemd unit (`StartLimitIntervalSec=120` /
`StartLimitBurst=5`) и стартовый детектор
(`maxStartupAttempts=5` / окно 30s) — это **два разных лимита**, порядок
срабатывания согласован: детектор откатывает конфиг к lkg на 6-м boot
(~t+25s) раньше, чем systemd сдаётся и оставляет сервис dead (~t+120s).
Без описания связка читается как дублирование независимых механизмов.

Требуется явно описать в `docs/runbooks/config-file.md`: кто за что
отвечает, в каком порядке срабатывает, что произойдёт при исчерпании
каждого лимита.

**Acceptance criteria:**
- [x] Runbook описывает порядок срабатывания (детектор → systemd) и ответственность каждого лимита
- [x] `npm test` зелёный

**Files:** `docs/runbooks/config-file.md`,
`systemd/` (unit-файл, если в описании есть точные значения)

**Dependencies:** —

**Estimated scope:** XS

---

### Task 13: R16-Low — R11-L3, R5-L1, R5-L6 (не отслеживались, заведены round 16)

**Status:** Done

**Description:** Low-замечания, добавленные в checkpoint round 16 (коммит
раунда упал с «Author identity unknown», пункты потерялись; переприменено
вручную round 17):

- **R11-L3 (warnings `loadConfig` в UI):** `loadConfig` возвращает
  `warnings` (валидация файла: `src/bot-platform/core/config.js:286,313`),
  `core/index.js:54` сохраняет их как `configWarnings`, но dashboard
  `/api/config/*` и UI их не показывают. Решить: прокинуть warnings в
  `/api/config` (и/или в `/api/config/status`) и отрисовать баннером.
- **R5-L1 (`export` отдаёт литеральные секреты):** `GET /api/config/export` —
  сырой дамп активного файла (`buildExportConfig`, `api/config.js:536`).
  Инвариант «в файле нет литеральных секретов» держится только на валидации
  (Stage/Apply/детектор): при ручной правке файла с литералом export (и
  просмотр) его отдадут. Решить: маскировать в export или документировать
  как известное ограничение.
- **R5-L6 (CLI `--rollback-config` без plugins):** CLI-rollback
  (`src/bot-platform/app.js:173`, `rollbackConfigFile`) вызывает
  `rollbackConfig` без `plugins` — валидация lkg по configSchema плагинов
  не выполняется (dashboard-rollback плагины передаёт: `api/config.js:939`).
  Прокинуть `app.plugins` в `rollbackConfigFile`.

Пункт round 16 про мёртвый `createQueueMonitorConfigFromConfig` **устарел** —
символ удалён ещё в R13-M3 (`src/queue-monitor/config.js` экспортирует только
`createQueueMonitorConfig`, env-fallback в `index.js:27`), в checkpoint не
вносится.

**Acceptance criteria:**
- [x] R11-L3: warnings из loadConfig видны в dashboard (или решение «не показывать» зафиксировано в доке)
- [x] R5-L1: export не отдаёт литеральные секреты (маскирование) ИЛИ ограничение задокументировано
- [x] R5-L6: CLI `--rollback-config` валидирует lkg с configSchema плагинов (регресс)
- [x] `npm test` зелёный

**Files:** `src/queue-monitor/api/config.js`, `src/bot-platform/core/index.js`,
`src/bot-platform/app.js`, `src/queue-monitor/ui/src/pages/SettingsPage.jsx`,
`docs/runbooks/config-file.md`,
тесты `tests/queue-monitor/api/config.test.js`,
`tests/bot-platform/config-store.test.js`

**Dependencies:** —

**Estimated scope:** S

---

## Checkpoint: Sprint 42

- [x] M1: start не висит при сетевом сбое poll
- [x] M2: boots растёт 1 раз за boot (crash-loop откат после 5 boot)
- [x] R5-M3: required отсутствующих plugin-веток (сервер и клиент)
- [x] L1: plugin-`$VAR` документирован
- [x] L2: pendingRemainingMs согласован с откатом
- [x] L3: Stage валидирует после слияния секретов
- [x] R7 L1–L4: утечка system-ключей, карантин rollback, async-контракт рестарта, `version: null`
- [x] R8-L1: нестроковые необъявленные значения в stage-ответах отброшены
- [x] R9 N1/N2: утечка в `GET /api/config` закрыта, `default` валидируется
- [x] R10 F10-L1: предупреждение о потерях необъявленных ключей при Import/Save
- [x] R11-L3: warnings `loadConfig` поднимаются в UI
- [x] R5-L1: `export` не отдаёт литеральные секреты (решение)
- [x] R5-L6: CLI `--rollback-config` валидирует lkg с plugins
- [x] R13-M2: trade-off авто-отката после ручного Apply зафиксирован
- [x] R17-doc: связка systemd StartLimit ↔ детектор `maxStartupAttempts` в runbook
- [x] `npm test` зелёный (994)
- [ ] PR #23 merged — внешнее действие (push/merge без креденшелов в этом окружении)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| M1 «зомби»-процесс на боевом long-polling | High | Таймаут/N-неудач firstTick + exit/работа без подтверждения; задача до боевого запуска. Закрыто: firstTick-таймаут (60s) + exit != 0 + остановка сервисов |
| M2 ложный откат по crash-loop на стенде | Medium | Гард-флаг/проброс app; симуляция boots |
| R5-M3 «тихая» неконфигурация плагина | Medium | Валидация required для отсутствующих веток; до первого плагина с required-полями |
| Дрейф доков (карантин) | Low | L5 исправлен в PR; doc-синк в конце спринта |

## Файлы для изменения (сводка)

```
src/bot-platform/runtime/live-service.js (M1)
src/bot-platform/app.js                   (M1/M2)
src/bot-platform/core/index.js            (M2)
src/bot-platform/core/config-schema.js    (R5-M3)
src/queue-monitor/api/config.js           (L1/L2/L3)
src/queue-monitor/ui/...                  (L1/L2, R5-M3 клиент)
src/bot-platform/core/index.js            (R11-L3: configWarnings)
src/bot-platform/app.js                   (R5-L6: CLI rollback с plugins)
docs/runbooks/*, docs/decisions/ADR-0046  (L1, M1-поведение, R13-M2, R17-doc)
tests/                                    (M1/M2/R5-M3/L3/R13-M2/R5-L6 регрессы)
```
