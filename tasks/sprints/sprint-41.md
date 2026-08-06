# Sprint 41: Конфигурация (ADR-0045/0046) — интеграция, стенд и документация

**Цель:** собрать file-first конфигурацию в работающий стенд: docker
compose (дизайн-ограничение) с volume `./config`, переписать INSTALL/README
под конфиг-файл, runbook конфигурации, миграция живого `.env`-стенда через
`--generate-config`, расширение policy-тестов (секреты в API/export),
финальный e2e.

**ADR:** [ADR-0045](../../docs/decisions/ADR-0045-config-file-source-of-truth.md)
[ADR-0046](../../docs/decisions/ADR-0046-schema-driven-config-webui.md)
[ADR-0044](../../docs/decisions/ADR-0044-nginx-reverse-proxy.md)
**Idea:** [docs/ideas/config-file-and-schema-driven-settings.md](../../docs/ideas/config-file-and-schema-driven-settings.md)
**Стенд:** [docs/runbooks/nginx-reverse-proxy.md](../../docs/runbooks/nginx-reverse-proxy.md)

**Контекст:** код готов (Sprint 37-40). Здесь — интеграция и документация,
обязательные для завершения этапа (docs-leak-guard, непротиворечивость
документации).

**Границы:** без изменений поведения webhook (`src/zabbix-media-type/`).
Только бот-платформа/стенд/docs. Новые решения не вводим — фиксируем
принятые (ADR-0045/0046).

## Architecture Decisions

- **docker compose (дизайн-ограничение):** volume `./config` — writable
  (host-каталог), секреты — через env/docker secrets (не в compose-файле),
  `ZYABLIK_CONFIG` указывает на путь в volume.
- **Инвентаризация env** — маппинг env→файл из ADR-0045 переносится в
  INSTALL/runbook (управляемые — в файл, секреты — `$VAR`-ссылки,
  неизменяемая база + bootstrap + `NODE_EXTRA_CA_CERTS` — остаются в env).
- **Миграция стенда** — `--generate-config` на живом `.env`-стенде,
  результат — в `docs/test-runs/` (как принято в проекте).
- **Policy-тесты** — docs-leak-guard расширяется: литеральные секреты не
  появляются в API-ответах/export/UI-данных.

## Tasks

### Task 1: docker compose — volume ./config и секреты

**Status:** Done

**Description:** Проверить/обновить docker-стенд (дизайн-ограничение):
writable volume `./config` (host-каталог), `ZYABLIK_CONFIG` в env контейнера,
секреты — docker secrets/env (не литералы в compose/файле).

**Acceptance criteria:**
- [x] `./config` — writable volume в контейнере (`docker-compose.yml`, `VOLUME /opt/zyablik-bot/config`)
- [x] Секреты приходят из env/docker secrets (`env_file: .env`, `$VAR`-маппинг в `environment`)
- [x] Стенд стартует с `zyablik.config.json` (apply/rollback работает) — e2e в `docs/test-runs/config-apply-rollback-run.md`

**Files:** `docker-compose.yml`, `Dockerfile`, стенд, `INSTALL.md`

**Dependencies:** Sprint 38

**Estimated scope:** M

---

### Task 2: INSTALL/README/CHANGELOG/project-context под конфиг-файл

**Status:** In Progress

**Description:** Переписать INSTALL: конфиг-файл как основной способ
(структура, секции, `$VAR`, `version`, staged/apply/rollback,
`--generate-config`, маппинг env→файл). README — раздел конфигурации,
CHANGELOG — запись о переходе, `docs/project-context.md` — статус этапа.
Синхронизация с AGENTS.md (блок «меняется конфигурация» уже добавлен).

**Acceptance criteria:**
- [x] INSTALL описывает конфиг-файл без противоречий ADR-0045/0046 (раздел 10, `--generate-config`, структура, UI-управление)
- [x] README/CHANGELOG обновлены (README — runbook + Dockerfile/compose в списке, CHANGELOG — записи)
- [x] `docs/project-context.md` — статус этапа (§ «Статус этапа „Конфигурация файлом“»)
- [x] docs-leak-guard зелёный (без реальных адресов/секретов)

**Files:** `INSTALL.md`, `README.md`, `CHANGELOG.md`,
`docs/project-context.md`, `AGENTS.md` (при необходимости)

**Dependencies:** Task 1

**Estimated scope:** M

---

### Task 3: Runbook конфигурации + миграция стенда

**Status:** In Progress

**Description:** `docs/runbooks/config-file.md`: сценарии — миграция с
`.env` (через `--generate-config`), ежедневная правка, apply/rollback,
восстановление из `lkg`, карантин `bad.json`. Миграция живого стенда,
результаты — в `docs/test-runs/`.

**Acceptance criteria:**
- [x] Runbook покрывает: миграцию, apply/rollback, авто-откат,
      восстановление, права `./config` (`docs/runbooks/config-file.md`)
- [x] Живой стенд мигрирован на файл; результат зафиксирован в
      `docs/test-runs/` (`config-apply-rollback-run.md`, `task-36-nginx-reverse-proxy-run.md`)
- [x] docs-leak-guard зелёный

**Files:** `docs/runbooks/config-file.md` (новый), `docs/test-runs/*`

**Dependencies:** Task 2, Sprint 38

**Estimated scope:** M

---

### Task 4: Policy-тесты — секреты в API/export

**Status:** Done

**Description:** Расширить `tests/docs-leak-guard.test.js` (и/или
policy-тесты): литеральные секреты не встречаются в ответах API
(`/api/config*`), в export, в UI-данных; `$VAR`-ссылки — единственный
формат секретов в файлах конфигурации.

**Acceptance criteria:**
- [x] Policy-тест на отсутствие литеральных секретов в API/export/UI (`tests/policy/config-secrets.test.js`)
- [x] Policy-тест на `$VAR`-формат в конфиг-файлах (`tests/policy/config-secrets.test.js`)
- [x] Полный `npm test` зелёный (861 pass / 0 fail)

**Files:** `tests/docs-leak-guard.test.js`, `tests/policy/*` (при наличии)

**Dependencies:** Sprint 39-40

**Estimated scope:** S

---

### Task 5: Финальный e2e и чек-лист этапа

**Status:** Done

**Description:** Полный прогон на стенде: старт из файла → правка → apply →
confirmed; сломанный конфиг → авто-откат; rollback; export/import; UI-флоу.
Проверка чек-листа `docs/project-acceptance.md`.

**Acceptance criteria:**
- [x] Apply → restart → confirmed (штатный цикл) — `docs/test-runs/config-apply-rollback-run.md`
- [x] Авто-откат из lkg при неподтверждённом Apply — `docs/test-runs/config-apply-rollback-run.md`
- [x] Rollback, export/import, UI-флоу — оставшиеся сценарии прогона (`config-apply-rollback-run.md`)
- [x] Чек-лист acceptance обновлён (статус этапа) — `docs/project-acceptance.md` § «Приёмка этапа „Конфигурация файлом“ (ADR-0045/0046)»
- [x] Документация непротиворечива; `npm test` зелёный (861 pass / 0 fail)

**Files:** `docs/project-acceptance.md`, `docs/test-runs/*`

**Dependencies:** Tasks 1-4

**Estimated scope:** S

---

## Checkpoint: Sprint 41

- [x] Стенд работает из файла (без управляемых env)
- [x] INSTALL/README/CHANGELOG/runbook непротиворечивы ADR-0045/0046
- [x] docs-leak-guard + policy-тесты зелёные; `npm test` зелёный (861 pass / 0 fail)
- [ ] Ревью с человеком; этап закрыт

## Найденные и исправленные дефекты (Task 1/5)

1. Детектор подтверждающего режима (`runStartupConfigDetector`) при любом
   pending-маркере откатывал конфиг на `lkg`, ломая штатный Apply → restart
   (ADR-0045). Воспроизведён на изолированной копии и на стенде.

   Исправление в `src/bot-platform/core/config-store.js`: pending-маркер
   получает `appliedAt` (`writePending`), детектор различает свежий маркер
   (age < `startupWaitMs`, default `DEFAULT_STARTUP_WAIT_MS = 30_000`) — штатный
   restart, продолжаем; старый (age >= окна) — авто-откат на `lkg`. Отсутствие
   `appliedAt` трактуется как старый. Обновлены тесты config-store/config-recovery/
   config-audit. Заодно прокинут логгер в `createCore` для аудита `config.rollback`.

2. Apply через UI/import затирал секретные `$VAR`-поля активного файла
   (UI не отправляет секреты, `buildStagedConfig` пропускает `field.secret`,
   `applyConfig` писал staged поверх активного) — на стенде сервис не стартовал
   (`MONITOR_ENABLED=true requires METRICS_API_KEY`). Исправление:
   `mergePreservedSecrets` переносит `$VAR`-ссылки секретов из активного
   конфига при stage/import/apply (до pre-validate; литералы по-прежнему
   режектятся). Тесты в config-store.test.js и queue-monitor/api/config.test.js.

3. Тесты подхватывали `config/zyablik.config.json` стенда из CWD
   (`CONFIG_SECRET_VAR_UNRESOLVED`). Изоляция — `tests/setup.js`
   (`node --require`) + `tests/helpers/env-no-config.js`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Стенд ломается при миграции | High | `--generate-config` + lkg; runbook с откатом |
| Документация расходится с кодом | High | ADR-0045/0046 — приоритет; doc-синк в конце этапа |
| Секреты протекают в export/логи | High | policy-тесты + redaction (ADR-0013) |

## Файлы для изменения (сводка)

```
docker-compose*.yml                     (volume ./config, секреты)
INSTALL.md                              (конфиг-файл как основной способ)
README.md, CHANGELOG.md, docs/project-context.md
docs/runbooks/config-file.md            (новый)
docs/project-acceptance.md              (статус этапа)
docs/test-runs/*                        (результаты прогонов)
tests/docs-leak-guard.test.js           (policy-расширения)
```
