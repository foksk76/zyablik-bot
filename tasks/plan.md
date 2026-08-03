# Implementation Plan: Zyablik Zabbix Monitoring Template

> **Статус: исторический план.** Все задачи выполнены; чек-листы ниже
> оставлены как история планирования. Фактическое состояние — `tasks/todo.md`
> и `tasks/sprints/sprint-33..35.md` (все пункты Done, `npm test` зелёный,
> живой стенд: PROBLEM -> RECOVERY подтверждён).

## Overview

Open-source Zabbix 7.0+ шаблон для мониторинга Zyablik bot через готовую
метрики-поверхность ADR-0034 (`/api/metrics/*`, `/readyz`). Шаблон:
master item на `GET /api/metrics/summary`, LLD rule на
`/api/metrics/discovery`, dependent items по `{#METRIC}`, item на `/readyz`,
полный набор триггеров и графики. Проверяется в CI поднятием тестового
Zabbix server в Docker и импортом шаблона.

**Idea:** [docs/ideas/zyablik-monitoring-template-zabbix.md](../docs/ideas/zyablik-monitoring-template-zabbix.md)

## Architecture Decisions

- **Agent-less LLD-шаблон (направление A)** — только HTTP Agent, без
  установки Zabbix agent 2 на хост бота. Переносимость для open source.
- **Нативный YAML (Zabbix 7.0+)** — формат экспорта 7.0; **тестовый сервер —
  Zabbix 7.2** (Docker, Sprint 34, CI).
- **Макросы вместо хардкода:**
  - `{$ZYABLIK.URL}` — host бота (default `localhost`)
  - `{$ZYABLIK.PORT}` — порт dashboard (default `9000`, env `MONITOR_PORT`)
  - `{$ZYABLIK.API_KEY}` — Secret macro, пустой в шаблоне, реальный токен —
    host-level override (`METRICS_API_KEY`)
  - `{$ZYABLIK.MAX_FAILED}` — порог failed rate
  - `{$ZYABLIK.BACKLOG_SEC}` — окно «застой очереди»
  - `{$ZYABLIK.POLL_INTERVAL}` — интервал опроса (default `30s`)
- **JSONPath-препроцессинг dependent items** — опирается на макрос LLD.
- **Статический валидатор без внешних зависимостей** — ADR-0015 запрещает
  `devDependencies`, поэтому валидация структуры — hand-rolled node test
  (строковые проверки, как repo-structure.test.js). Полный синтаксис YAML
  проверяется реальным импортом в Docker-Zabbix (Sprint 34).
- **CI: Docker Zabbix server** — в CI поднимается тестовый Zabbix,
  шаблон импортируется через API, проверяется создание items/triggers.

## Open Decision: ключи LLD discovery

`/api/metrics/discovery` возвращает `{#METRIC}` = `queue.pending`, а
`/api/metrics/summary` — топ-левел поле `pending`. Для JSONPath
`$.{#METRIC}` в dependent items нужен макрос, совпадающий с полем summary.

**Выбор (2026-08-01): вариант X** — изменить `{#METRIC}` на `pending` без
префикса `queue.`, чтобы макрос совпадал с полем `/summary` напрямую
(JSONPath `$.{#METRIC}`).

- Ломает контракт `queue.*`, зафиксированный в ADR-0034 (поправка) и идее —
  нужен поправочный ADR/изменение идеи, списка ключей в тестах и документации.
- Замена в discovery: `{#METRIC}` = `pending`, `processing`, `delivered`,
  `failed`, `total`, `totalAttempts`. `{#LABEL}` остаётся.
- Вариант Y (аддитивный `{#SUMMARY_KEY}`) отклонён как избыточный: префикс
  `queue.` не нёс нагрузки — все метрики и так из одной очереди.

## Dependency Graph

```
Discovery contract ({#METRIC} = pending) — Sprint 33, Task 1
    │
    └── Template YAML (Sprint 33)
            ├── Skeleton: macros + summary master item + readyz  (Task 2)
            ├── LLD rule + dependent items                       (Task 3)
            ├── Triggers                                         (Task 4)
            └── Graphs                                           (Task 5)
                    │
                    └── Static validation test (Sprint 33, Task 6)
                            │
                            └── Docker Zabbix CI (Sprint 34)
                                    ├── docker-compose + import script (Tasks 1-2)
                                    ├── CI workflow (Task 3)
                                    └── Docs + ADR-0043 (Tasks 4-5)
```

## Task List

### Sprint 33: Шаблон Zabbix — файл + статическая валидация

- [ ] Task 1: Discovery: смена `{#METRIC}` `queue.*` → `pending` (breaking,
      поправочный ADR к ADR-0034)
- [ ] Task 2: Скелет шаблона — макросы, master item `summary`, item `/readyz`
- [ ] Task 3: LLD rule на `/discovery` + dependent items (JSONPath `$.{#METRIC}`)
- [ ] Task 4: Триггеры (полный набор)
- [ ] Task 5: Графики (статусы очереди, backlog, delivered/failed)
- [ ] Task 6: Статический валидатор шаблона (hand-rolled node test)

### Checkpoint: Sprint 33
- [ ] YAML валиден, импортируется в Docker-Zabbix
- [ ] Все 6 метрик, readyz, триггеры и графики на месте
- [ ] `npm test` — все тесты passing

### Sprint 34: Docker CI + документация

- [ ] Task 1: Docker-окружение тестового Zabbix (compose/server)
- [ ] Task 2: Скрипт импорта шаблона + проверка items/triggers через API
- [ ] Task 3: CI workflow (job с Docker Zabbix)
- [ ] Task 4: Документация `docs/zabbix-monitoring-template.md`
- [ ] Task 5: ADR-0043 + обновление README/INSTALL/project-context/sprint README

### Checkpoint: Sprint 34
- [ ] CI green: шаблон импортируется, items/triggers созданы
- [ ] Документация описывает импорт, хосты, макросы, триггеры
- [ ] ADR-0043 зафиксирован, README/INSTALL обновлены

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSONPath/LLD несовместимость ключей | High | Решено: вариант X — `{#METRIC}` = `pending` (JSONPath `$.{#METRIC}`); поправочный ADR |
| ADR-0015 запрещает YAML-библиотеку | Medium | Hand-rolled валидатор + импорт в Docker-Zabbix как реальная проверка |
| Docker Zabbix в CI медленный/нестабильный | Medium | Отдельный workflow (не блокирует verify.yml), кэш образа, timeout |
| Импорт не создаёт dependent items при пустом discovery | Medium | Валидация через Zabbix API: проверять items по ключам, не только статус import |
| Секреты в шаблоне | High | `{$ZYABLIK.API_KEY}` пустой в файле; host-level override; проверка в валидаторе |

## Open Questions

- [x] Y или X для ключей LLD discovery — **вариант X**: `{#METRIC}` = `pending`
      (без префикса `queue.`), с поправочным ADR к ADR-0034
- [x] Путь файла шаблона — `docs/zabbix-template/zyablik-monitoring-template.yaml`
