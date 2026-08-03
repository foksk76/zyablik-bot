# Sprint 38: Конфигурация (ADR-0045) — применение: staged, apply, rollback, авто-откат

**Цель:** реализовать жизненный цикл применения конфигурации (ADR-0045):
staged-снапшот, Apply (pre-validate → lkg → атомарная запись → рестарт),
стартовый детектор с pending-маркером и авто-откатом, ручной rollback,
аудит-события, systemd-семантика рестарта.

**ADR:** [ADR-0045](../../docs/decisions/ADR-0045-config-file-source-of-truth.md)
(разделы «Применение», «Авто-откат», «Служебные файлы»)
**Idea:** [docs/ideas/config-file-and-schema-driven-settings.md](../../docs/ideas/config-file-and-schema-driven-settings.md)

**Контекст:** ядро `loadConfig`/$VAR/version готово (Sprint 37). Здесь —
применение и восстановление. API `/api/config/*` поверх этого — Sprint 39,
UI — Sprint 40.

**Границы:** файловые артефакты и стартовый детектор; HTTP-слой и UI — не
трогаем (Sprint 39-40). Мерж конфигурации из нескольких секций —
без изменений.

## Architecture Decisions

- **Служебные файлы** (в каталоге активного конфига):
  - `zyablik.config.lkg` — last known good (копия активного перед Apply);
  - `zyablik.config.json.pending` — pending-маркер (содержит хеш применяемого
    конфига);
  - `zyablik.config.bad.json` — карантин невалидного файла;
  - `zyablik.config.staged.json` — полный снапшот (включая `version`) для
    Stage→Apply.
- **Apply (вариант A, детерминированный):** pre-validate (схема + version +
  $VAR + литеральные секреты + dry-run) → запись `lkg` → атомарный write
  (temp + rename) → снятие/запись staged → инициализация рестарта
  (SIGTERM graceful, ADR-0033). Write-back результата миграции — в этом
  шаге, `lkg` не мигрируется (идемпотентно).
- **Стартовый детектор:** на старте
  - валидационный отказ → карантин `bad.json` + восстановление `lkg`
    (lkg предварительно валидируется);
  - pending-маркер: процесс пишет хеш применяемого конфига, по готовности
    (ingress HTTP-сервер + dashboard подняты) — снятие маркера (`confirmed`),
    окно `StartupWait` = 30 с;
  - краш до ready без снятия маркера → при следующем запуске — авто-откат
    на `lkg`. Рантайм-краш без маркера (OOM/порт) откат НЕ вызывает.
- **Ручной rollback:** восстановление `lkg` + рестарт; staged очищается
  после успешного Apply, авто-отката и rollback.
- **Аудит** (ADR-0029): `config.applied`, `config.validate_failed`,
  `config.pending`, `config.confirmed`, `config.rollback`,
  `config.quarantine`, `config.import`.
- **systemd:** `Restart=always`, `RestartSec`, `StartLimitBurst` — fail
  loudly, без бесконечного цикла рестартов; каталог `./config` принадлежит
  пользователю сервиса (запись `lkg`/`staged`/маркера).

## Tasks

### Task 1: Staged storage

**Status:** Done

**Description:** Полный снапшот `zyablik.config.staged.json` (включая
`version`), атомарная запись (temp + rename), чтение, очистка. Секреты в
staged — `$VAR`-ссылки (не литералы).

**Acceptance criteria:**
- [ ] staged пишется/читается атомарно
- [ ] staged очищается: успешный Apply, авто-откат, ручной rollback
- [ ] Секреты в staged — только `$VAR`-ссылки
- [ ] unit-тесты

**Files:** `src/bot-platform/core/config.js` (или новый
`src/bot-platform/core/config-store.js`), `tests/bot-platform/config-store.test.js`

**Dependencies:** Sprint 37 (Task 2-3)

**Estimated scope:** M

---

### Task 2: Apply — pre-validate, lkg, атомарная запись, рестарт

**Status:** Done

**Description:** `applyConfig(config, { service })`: pre-validate (схема +
version + $VAR + reject литеральных секретов + dry-run) → `lkg` = копия
активного → атомарный write → write-back миграции → инициализация рестарта
(SIGTERM graceful, ADR-0033: `app.js` перезапускается service-менеджером,
`Restart=always`). Возвращает `202`-семантику инициирования.

**Acceptance criteria:**
- [ ] pre-validate перед записью; отказ не трогает активный конфиг
- [ ] `lkg` сохраняет предыдущий активный конфиг
- [ ] write атомарный (temp + rename)
- [ ] После apply — процесс рестартует (unit-тест с фейковым spawn; на
      стенде — реальный рестарт)
- [ ] write-back миграции выполнен в активном файле, `lkg` не мигрирован

**Files:** `src/bot-platform/core/config.js` / `config-store.js`,
`src/bot-platform/app.js`, `tests/bot-platform/config-apply.test.js`

**Dependencies:** Task 1

**Estimated scope:** M

---

### Task 3: Стартовый детектор + авто-откат

**Status:** Done

**Description:** На старте `loadConfig`: 1) невалидный файл → карантин
`bad.json` + восстановление `lkg` (lkg валидируется); 2) pending-маркер —
запись хеша применяемого конфига, снятие по ready в окне `StartupWait` 30 с
(`confirmed`); 3) маркер без confirmed (краш) → авто-откат на `lkg` при
следующем запуске. `app.js` ставит ready по факту поднятия ingress- и
dashboard-серверов.

**Acceptance criteria:**
- [ ] Валидационный отказ → `bad.json` + восстановление `lkg`
- [ ] Краш до ready → при следующем запуске откат на `lkg`
- [ ] Рантайм-краш без маркера → отката нет
- [ ] lkg невалиден → отказ восстановления с понятной ошибкой (карантин)
- [ ] unit-тесты всех веток детектора

**Files:** `src/bot-platform/core/config.js` / `config-store.js`,
`src/bot-platform/app.js`, `tests/bot-platform/config-recovery.test.js`

**Dependencies:** Tasks 1-2

**Estimated scope:** L

---

### Task 4: Ручной rollback

**Status:** Done

**Description:** `rollbackConfig()`: восстановление `lkg` + рестарт, очистка
staged, **снятие pending-маркера** (если был установлен незавершённым
Apply — откат это явное решение оператора, повторный авто-откат не нужен).
Триггер — из API (Sprint 39); здесь — внутренняя функция и её вызов из
CLI-флага (например `--rollback-config` для ручного восстановления без UI).

**Acceptance criteria:**
- [ ] rollback восстанавливает `lkg` и рестартует процесс
- [ ] staged и pending-маркер очищаются
- [ ] CLI-триггер `--rollback-config` работает (для ручного сценария)

**Files:** `src/bot-platform/core/config.js` / `config-store.js`,
`src/bot-platform/app.js`, `tests/bot-platform/config-rollback.test.js`

**Dependencies:** Task 3

**Estimated scope:** M

---

### Task 5: Аудит-события конфигурации

**Status:** Done

**Description:** Аудит-события (ADR-0029): `config.applied`,
`config.validate_failed`, `config.pending`, `config.confirmed`,
`config.rollback`, `config.quarantine`, `config.import`. Формат —
как в существующем audit (примеры: delivery, auth). Без литеральных
секретов в аудите.

**Acceptance criteria:**
- [ ] Все события пишутся в audit-журнал
- [ ] Секреты не попадают в аудит (redaction)
- [ ] unit-тесты на формат и redaction

**Files:** `src/bot-platform/core/config.js` / `config-store.js`,
`tests/bot-platform/config-audit.test.js`

**Dependencies:** Tasks 2-4

**Estimated scope:** S

---

### Task 6: systemd-семантика рестарта + права на ./config

**Status:** Done

**Description:** Проверить/обновить `systemd/zyablik-bot.service`:
`Restart=always`, `RestartSec`, `StartLimitBurst` (fail loudly, без
циклов). Каталог `./config` принадлежит пользователю сервиса (запись
`lkg`/`staged`/`pending`). Проверка на стенде.

**Acceptance criteria:**
- [ ] unit-файл отражает семантику рестарта ADR-0045
- [ ] Пользователь сервиса может писать в `./config`
- [ ] Проверка на стенде: краш во время apply → откат, не цикл рестартов

**Files:** `systemd/zyablik-bot.service`, `docs/runbooks/nginx-reverse-proxy.md`
(если затрагивает config-каталог), стенд

**Dependencies:** Task 3

**Estimated scope:** S

---

## Checkpoint: Sprint 38

- [ ] e2e на стенде: Apply → рестарт → confirmed; сломанный конфиг →
      авто-откат; ручной rollback
- [ ] Аудит содержит все события, без секретов
- [ ] `npm test` зелёный
- [ ] Ревью с человеком

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Авто-откат удаляет пользовательские правки | High | откат только при pending-маркере; lkg валидируется перед восстановлением |
| Цикл рестартов при стабильно-сломанном конфиге | High | StartLimitBurst + карантин bad.json (fail loudly, не бесконечно) |
| `ready` определён неверно (серверы не подняты, но процесс жив) | Medium | ready = ingress + dashboard приняли соединения; unit-тест окна StartupWait |
| Атомарность записи (краш в середине write) | Medium | temp + rename; lkg сохраняется до записи |

## Файлы для изменения (сводка)

```
src/bot-platform/core/config.js            (apply/rollback/детектор/аудит)
src/bot-platform/core/config-store.js      (новый — staged/lkg/pending/bad)
src/bot-platform/app.js                     (ready, --rollback-config, рестарт)
systemd/zyablik-bot.service                 (Restart=always, StartLimitBurst)
tests/bot-platform/config-{store,apply,recovery,rollback,audit}.test.js
```
