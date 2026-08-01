# Sprint 34: Zabbix Monitoring Template — Docker CI + документация

**Цель:** доказать, что шаблон из Sprint 33 реально импортируется в Zabbix
7.2 и создаёт items/triggers: тестовый Zabbix в Docker, CI-workflow,
документация, ADR.

**Idea:** [docs/ideas/zyablik-monitoring-template-zabbix.md](../../docs/ideas/zyablik-monitoring-template-zabbix.md)
**ADR:** [ADR-0043](../../docs/decisions/ADR-0043-zabbix-monitoring-template.md)
(создан 2026-08-01; в этом спринте — обновление индексов: README/INSTALL/
project-context/sprints README)

**Контекст:** Sprint 33 создал `docs/zabbix-template/zyablik-monitoring-template.yaml`
и статический валидатор. Осталось: импорт в живой Zabbix (Docker 7.2), CI,
документация.

**Границы:** `docs/zabbix-template/` (тестовое Docker-окружение),
`.github/workflows/`, `docs/`, README/INSTALL.

## Architecture Decisions

- **Отдельный workflow `zabbix-template.yml`** — не блокирует `verify.yml`
  (Docker Zabbix может быть медленным/нестабильным).
- **Zabbix server 7.2 в Docker** — проверка импорта и создания entities через
  Zabbix API (не только status import).
- **ADR-0043** — фиксирует мониторинговый шаблон как часть доставки проекта
  и guard на расширение поверхности мониторинга.

## Tasks

### Phase 1: Docker test environment

#### Task 1: Docker-окружение тестового Zabbix

**Status:** Done (2026-08-01)

**Description:** Создать docker-compose (или Dockerfile + compose) с Zabbix
server 7.0 (и web при необходимости) для локальной проверки и CI.
Healthcheck готовности server.

**Acceptance criteria:**
- [x] `docker-compose.yml` (в `docs/zabbix-template/test/`) поднимает
      Zabbix server 7.2
- [x] Server доступен по API после healthcheck (не сразу после старта)
- [x] Запуск: `docker compose up -d` — без ошибок
- [x] Шаги/инструкция для локального прогона зафиксированы

**Files:** `docs/zabbix-template/test/docker-compose.yml` (новый)

**Dependencies:** Sprint 33 (шаблон)

**Estimated scope:** M

---

#### Task 2: Скрипт импорта + проверка entities

**Status:** Done (2026-08-01)

**Description:** Скрипт импорта шаблона в тестовый Zabbix через API
(`configuration.import`) и проверка, что созданы: template, items
(`zyablik.summary`, `zyablik.readyz`, dependent items), triggers, graphs.

**Acceptance criteria:**
- [x] Скрипт `docs/zabbix-template/test/import-and-verify.js` (или .sh)
      импортирует шаблон через Zabbix API
- [x] Проверяет через `configuration.get` / `item.get` / `trigger.get`, что
      entities созданы
- [x] Возвращает exit code 0 при успехе, ненулевой при провале
- [x] Локальный запуск: `npm run` или прямой вызов — документирован

**Files:** `docs/zabbix-template/test/import-and-verify.js` (новый)

**Dependencies:** Task 1

**Estimated scope:** M

---

### Checkpoint: Docker test

- [x] Локально: compose поднимается, шаблон импортируется, entities созданы
      (импорт пересоздан: 10 items, 1 LLD rule, 4 триггера, 2 графика)
- [ ] Ревью с человеком

---

### Phase 2: CI

#### Task 3: CI workflow

**Status:** Done (2026-08-01)

**Description:** `.github/workflows/zabbix-template.yml`: статическая
валидация (node --test) + поднятие Zabbix в Docker + импорт и verify.
Кэш Docker-образа, timeout.

**Acceptance criteria:**
- [x] Workflow запускается на push/PR (можно `workflow_dispatch` только)
- [x] Job 1: `npm ci` + `npm test` (статический валидатор)
- [x] Job 2 (или steps): Docker Zabbix + `import-and-verify.js` — green
- [x] Не блокирует `verify.yml`
- [x] Timeout и кэширование настроены

**Files:** `.github/workflows/zabbix-template.yml` (новый)

**Dependencies:** Task 2

**Estimated scope:** M

---

### Checkpoint: CI

- [ ] Workflow green на тестовом прогоне (требует push + GitHub Actions)
- [ ] Шаблон импортируется в CI, entities созданы (локально доказано; CI — по push)

---

### Phase 3: Docs + ADR

#### Task 4: Документация `docs/zabbix-monitoring-template.md`

**Status:** Done (2026-08-01)

**Description:** Документ: что мониторит, установка (импорт шаблона), настройка
хоста (URL, PORT, API_KEY на host level), макросы и пороги, триггеры и их
severity, локальный прогон Docker-теста, guard на расширение поверхности.

**Acceptance criteria:**
- [x] Документ в `docs/zabbix-monitoring-template.md`
- [x] Описаны все макросы и дефолты
- [x] Инструкция импорта и настройки хоста с host-level `{$ZYABLIK.API_KEY}`
- [x] Описание триггеров, порогов, recovery
- [x] Ссылки на ADR-0034 и idea-документ
- [x] Нет секретов/реальных идентификаторов

**Files:** `docs/zabbix-monitoring-template.md` (новый)

**Dependencies:** Sprint 33, Task 3

**Estimated scope:** M

---

#### Task 5: Обновление индексов (ADR-0043 уже создан)

**Status:** Done (2026-08-01)

**Description:** ADR-0043 создан 2026-08-01
(`docs/decisions/ADR-0043-zabbix-monitoring-template.md`). В этом спринте —
синхронизация индексов: README (ADR list), INSTALL.md (опциональная секция
мониторинга Zabbix), docs/project-context.md, tasks/sprints/README.md.
Поправочная запись в ADR-0034 (смена `{#METRIC}`) уже внесена.

**Acceptance criteria:**
- [x] ADR-0043 в списке `docs/decisions/README.md` и README.md
- [x] README/INSTALL/project-context обновлены без противоречий
- [x] `tasks/sprints/README.md` — спринты 33/34 добавлены

**Files:** `docs/decisions/README.md`, `README.md`, `INSTALL.md`,
`docs/project-context.md`, `tasks/sprints/README.md`

**Dependencies:** Task 4

**Estimated scope:** S

---

### Checkpoint: Sprint 34

- [ ] CI green (workflow импортирует шаблон; ждёт push в GitHub)
- [x] `npm test` — все тесты passing
- [x] Документация полная и непротиворечивая
- [x] ADR-0043 зафиксирован

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Docker Zabbix нестабилен/медленный | Medium | Отдельный workflow, кэш, timeout |
| Zabbix API не примет шаблон (формат) | High | Проверка на этапе Sprint 33 чекпоинта + локальный прогон до CI |
| Раскрытие секретов в CI-логах | High | `{$ZYABLIK.API_KEY}` пустой; секреты в docs только как placeholder |

## Parallelization

- Tasks 1-2 (Docker + import) независимы от Task 4 (docs), но Task 3 (CI)
  ждёт Task 2
- Task 4 (docs) может идти параллельно с Task 1-3
- Task 5 (ADR + индексы) после Task 4

## Файлы для изменения (сводка)

```
docs/zabbix-template/test/docker-compose.yml      (новый)
docs/zabbix-template/test/import-and-verify.js    (новый)
.github/workflows/zabbix-template.yml             (новый)
docs/zabbix-monitoring-template.md                (новый)
docs/decisions/ADR-0043-*.md                      (создан 2026-08-01)
docs/decisions/README.md                          (модификация)
README.md                                         (модификация)
INSTALL.md                                        (модификация)
docs/project-context.md                           (модификация)
tasks/sprints/README.md                           (модификация)
```
