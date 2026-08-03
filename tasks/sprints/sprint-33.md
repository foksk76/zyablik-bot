# Sprint 33: Zabbix Monitoring Template — файл шаблона + валидация

**Цель:** создать open-source Zabbix 7.0+ шаблон мониторинга Zyablik bot
(agent-less LLD) и статический валидатор для него.

**Idea:** [docs/ideas/zyablik-monitoring-template-zabbix.md](../../docs/ideas/zyablik-monitoring-template-zabbix.md)
**ADR:** [ADR-0043](../../docs/decisions/ADR-0043-zabbix-monitoring-template.md)

**Контекст:** ADR-0034 дал метрики-поверхность `/api/metrics/*` (summary,
timeseries, top, errors, discovery) и `/readyz`. Discovery отдаёт
`{#METRIC}` = `queue.pending/...`, summary — топ-левел поля `pending`.
Решено (2026-08-01, ADR-0043): вариант X — `{#METRIC}` без префикса
(`pending`), чтобы JSONPath dependent items совпадал с полями `/summary`.

**Границы:** `src/queue-monitor/api/metrics.js` (breaking-смена `{#METRIC}`),
`docs/zabbix-template/`, тесты в `tests/`.

## Architecture Decisions

- **Agent-less HTTP Agent** — без Zabbix agent 2, переносимость для
  сообщества.
- **Нативный YAML (Zabbix 7.0+)** — формат экспорта.
- **LLD контракт: вариант X (2026-08-01)** — `{#METRIC}` меняется с
  `queue.pending` на `pending` (без префикса), чтобы JSONPath dependent items
  `$.{#METRIC}` совпадал с полями `/summary`. Breaking-изменение: поправочный
  ADR к ADR-0034.
- **Макросы, не хардкод:** `{$ZYABLIK.URL}`, `{$ZYABLIK.PORT}` (9000),
  `{$ZYABLIK.API_KEY}` (Secret, пустой в шаблоне), `{$ZYABLIK.MAX_FAILED}`,
  `{$ZYABLIK.BACKLOG_SEC}`, `{$ZYABLIK.POLL_INTERVAL}` (30s).
- **Один master item на `/summary`** → все dependent items через JSONPath.
- **Валидатор hand-rolled** — ADR-0015 запрещает devDependencies; полный
  синтаксис YAML проверит импорт в Docker-Zabbix (Sprint 34).
- **Путь артефактов:** `docs/zabbix-template/` (решение 2026-08-01).

## Tasks

### Phase 1: Discovery contract

#### Task 1: Discovery: смена `{#METRIC}` на `pending` (вариант X)

**Status:** Done

**Description:** Изменить `/api/metrics/discovery`: `{#METRIC}` = `pending`,
`processing`, `delivered`, `failed`, `total`, `totalAttempts` (без префикса
`queue.`), чтобы JSONPath dependent items `$.{#METRIC}` совпадал с полями
`/summary`. `{#LABEL}` сохраняется. Breaking-изменение: поправочный ADR к
ADR-0034 (создаётся в Sprint 33 или Sprint 34 Task 5 — зафиксировать не
позднее ревью этого спринта).

**Acceptance criteria:**
- [x] `GET /api/metrics/discovery` возвращает 6 записей с `{#METRIC}` =
      `pending/processing/delivered/failed/total/totalAttempts` и `{#LABEL}`
- [x] Каждый `{#METRIC}` совпадает с именем поля в `/summary`
- [x] Поправочный ADR к ADR-0034 создан (или привязан к Sprint 34 Task 5)
- [x] Тесты: `tests/queue-monitor/api/metrics.test.js` обновлены
- [x] `npm test` — все тесты passing

**Files:** `src/queue-monitor/api/metrics.js`, `tests/queue-monitor/api/metrics.test.js`

**Dependencies:** None

**Estimated scope:** S

---

### Checkpoint: Discovery contract

- [x] Discovery-ответ покрыт тестами
- [x] `npm test` — passing

---

### Phase 2: Template file

#### Task 2: Скелет шаблона — макросы, master item summary, readyz

**Status:** Done

**Description:** Создать `docs/zabbix-template/zyablik-monitoring-template.yaml`:
шаблон, группа, макросы (`{$ZYABLIK.URL}`, `{$ZYABLIK.PORT}`,
`{$ZYABLIK.API_KEY}` Secret, `{$ZYABLIK.MAX_FAILED}`,
`{$ZYABLIK.BACKLOG_SEC}`, `{$ZYABLIK.POLL_INTERVAL}`), master item
`zyablik.summary` (HTTP Agent, `GET {URL}:{PORT}/api/metrics/summary`,
Bearer header из `{$ZYABLIK.API_KEY}`, интервал из `{$ZYABLIK.POLL_INTERVAL}`),
item `zyablik.readyz` (HTTP Agent, `GET /readyz`, без auth).

**Acceptance criteria:**
- [x] Файл `docs/zabbix-template/zyablik-monitoring-template.yaml` создан
- [x] Шаблон с валидной структурой Zabbix 7.0 (uuid, groups, template name)
- [x] Все 6 макросов объявлены; `{$ZYABLIK.API_KEY}` — тип Secret, значение пустое
- [x] Master item `zyablik.summary` с Bearer auth из макроса
- [x] Item `zyablik.readyz` без auth
- [x] YAML-синтаксис корректен (парсится без ошибок)

**Files:** `docs/zabbix-template/zyablik-monitoring-template.yaml` (новый)

**Dependencies:** Task 1 (для контракта discovery)

**Estimated scope:** M

---

#### Task 3: LLD rule + dependent items

**Status:** Done

**Description:** Гибридная структура (поправка к ADR-0043 от 2026-08-01):
- **6 статических dependent items `zyablik.status.<metric>`** (JSONPath
  `$.<metric>` из master item `zyablik.summary`) — на них завязаны триггеры
  и графики (graph prototype в Zabbix 7.0 даёт один граф на LLD-сущность,
  поэтому мульти-серийные графики на LLD-прототипах невозможны)
- **LLD rule** на `GET /api/metrics/discovery` (Bearer, JSONPath `$.data`) с
  item prototype `zyablik.queue[{#METRIC}]` (JSONPath `$.{#METRIC}` из
  `zyablik.summary`) — поверхность расширения для будущих метрик; коллизии
  ключей нет

**Acceptance criteria:**
- [x] 6 статических dependent items `zyablik.status.<metric>` с JSONPath `$.<metric>`
- [x] LLD rule с discovery URL и Bearer auth
- [x] LLD-макрос `{#METRIC}` совпадает с ответом discovery (Task 1)
- [x] Item prototype `zyablik.queue[{#METRIC}]`, JSONPath `$.{#METRIC}`
- [x] Имена/ключи items уникальны
- [x] YAML-синтаксис корректен

**Files:** `docs/zabbix-template/zyablik-monitoring-template.yaml`

**Dependencies:** Task 1, Task 2

**Estimated scope:** M

---

#### Task 4: Триггеры

**Status:** Done

**Description:** Полный набор триггеров с recovery-выражениями и порогами
через макросы:
- Недоступность API: `nodata()` на `zyablik.summary` или `/readyz` != 200
  (Severity: High)
- Застой очереди: pending > 0 и не уменьшается за `{$ZYABLIK.BACKLOG_SEC}`
  (Severity: Average)
- Failed rate: рост failed за окно > `{$ZYABLIK.MAX_FAILED}`
  (Severity: High)
- Рост totalAttempts / накопление ошибок (Severity: Warning)

**Acceptance criteria:**
- [x] Триггеры для каждого сценария (4+)
- [x] Recovery-выражения для всех проблемных триггеров
- [x] Пороги — макросы, не константы
- [x] Severity: High для «бот недоступен» и «failed rate», Average/Warning
      для застоя очереди и накопления ошибок (совпадает с ADR-0043)
- [x] YAML-синтаксис корректен

**Files:** `docs/zabbix-template/zyablik-monitoring-template.yaml`

**Dependencies:** Task 2, Task 3

**Estimated scope:** M

---

#### Task 5: Графики

**Status:** Done

**Description:** Графики: статусы очереди по времени (delivered/failed/
pending/processing), backlog (pending+processing), delivered vs failed.

**Acceptance criteria:**
- [x] Минимум 2 графика
- [x] Графики ссылаются на существующие items
- [x] YAML-синтаксис корректен

**Files:** `docs/zabbix-template/zyablik-monitoring-template.yaml`

**Dependencies:** Task 3

**Estimated scope:** S

---

### Checkpoint: Template file

- [x] Шаблон содержит: макросы, master item, readyz, LLD + dependent, триггеры, графики
- [x] YAML валиден

---

### Phase 3: Static validation

#### Task 6: Статический валидатор шаблона

**Status:** Done

**Description:** Hand-rolled валидатор `tests/monitoring/zabbix-template.test.js`
(без внешних зависимостей, ADR-0015): проверяет наличие обязательных секций
шаблона, ключей, макросов, триггеров, отсутствие секретов.

**Acceptance criteria:**
- [x] Тест проверяет существование файла шаблона
- [x] Проверяет наличие всех 6 макросов; `{$ZYABLIK.API_KEY}` пустой/Secret
- [x] Проверяет master item `zyablik.summary`, item `zyablik.readyz`,
      LLD rule, dependent items, триггеры, графики
- [x] Проверяет отсутствие реальных секретов/токенов в файле
- [x] `npm test` — все тесты passing (новый тест включён)

**Files:** `tests/monitoring/zabbix-template.test.js` (новый)

**Dependencies:** Task 2-5 (файл шаблона)

**Estimated scope:** M

---

### Checkpoint: Sprint 33

- [x] `npm test` — все тесты passing
- [x] Валидатор покрывает все обязательные части шаблона
- [ ] Ревью с человеком перед Sprint 34

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSONPath/LLD несовместимость ключей | High | Решено на ревью: вариант X — `{#METRIC}` = `pending` (2026-08-01) |
| ADR-0015 без YAML-либы | Medium | Hand-rolled валидатор + импорт в Docker-Zabbix (Sprint 34) |
| Секреты в шаблоне | High | Пустой Secret-макрос, host-level override, проверка в валидаторе |

## Parallelization

- Task 1 (discovery) независима от Template file; может идти параллельно с
  Task 2-5, но LLD rule (Task 3) ждёт фиксации контракта (Task 1)
- Task 6 (валидатор) после Task 5

## Файлы для изменения (сводка)

```
src/queue-monitor/api/metrics.js                      (модификация — Task 1, вариант X)
tests/queue-monitor/api/metrics.test.js               (модификация — Task 1)
docs/zabbix-template/zyablik-monitoring-template.yaml (новый — Tasks 2-5)
tests/monitoring/zabbix-template.test.js              (новый — Task 6)
```
