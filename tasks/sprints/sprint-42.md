# Sprint 42: Конфигурация (ADR-0045/0046) — follow-up ревью PR #23 (раунд 5)

**Цель:** закрыть замечания auto-review PR #23 (раунд 5, Approve with
comments) перед боевым запуском long-polling режима: M1 (зависание start при
сетевом сбое poll), M2 (двойной инкремент `boots` в синтетическом режиме),
L1–L3 (plugin-`$VAR` в UI, рассинхрон `pendingRemainingMs`, stage-валидация
до слияния секретов). L5 (дрейф доков карантина) уже исправлен в PR.

**ADR:** [ADR-0045](../../docs/decisions/ADR-0045-config-file-source-of-truth.md)
[ADR-0046](../../docs/decisions/ADR-0046-schema-driven-config-webui.md)
**Источник:** ревью PR #23, комментарий `5186794443` (round 5)

**Контекст:** ревьюер подтвердил фиксы раундов 1–5 и вынес новые
замечания. Блокеров нет; M1–M2 и L1–L3 — задачи «до merge»/«до боевого
запуска» (M1 — обязательно перед long-polling на стенде). L5 поправлен в
этом же PR.

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

## Checkpoint: Sprint 42

- [ ] M1: start не висит при сетевом сбое poll
- [ ] M2: boots растёт 1 раз за boot (crash-loop откат после 5 boot)
- [ ] L1: plugin-`$VAR` документирован
- [ ] L2: pendingRemainingMs согласован с откатом
- [ ] L3: Stage валидирует после слияния секретов
- [ ] `npm test` зелёный; PR #23 merged

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| M1 «зомби»-процесс на боевом long-polling | High | Таймаут/N-неудач firstTick + exit/работа без подтверждения; задача до боевого запуска |
| M2 ложный откат по crash-loop на стенде | Medium | Гард-флаг/проброс app; симуляция boots |
| Дрейф доков (карантин) | Low | L5 исправлен в PR; doc-синк в конце спринта |

## Файлы для изменения (сводка)

```
src/bot-platform/core/live-service.js     (M1)
src/bot-platform/app.js                   (M1/M2)
src/bot-platform/core/index.js            (M2)
src/queue-monitor/api/config.js           (L1/L2/L3)
src/queue-monitor/ui/...                  (L1/L2)
docs/runbooks/*, docs/decisions/ADR-0046  (L1, M1-поведение)
tests/                                    (M1/M2/L3 регрессы)
```
