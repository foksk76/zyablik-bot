# ADR-0043: Zabbix Monitoring Template

## Статус

Принято.

## Дата

2026-08-01

## Контекст

ADR-0034 вводит метрики-поверхность Queue Monitor Dashboard: `/api/metrics/*`
(summary, timeseries, top, errors, discovery) с Bearer/сессионной auth и
`/readyz` без auth. Оператор видит состояние очереди в дашборде, но:

1. Нет интеграции с корпоративной системой мониторинга Zabbix
2. Нет алертов (сбой доставки, застой очереди) — только ручной просмотр
3. Нет повторяемого, документированного способа подключить бот к Zabbix

Проект — open source (ADR-0031), аудитория — сообщество, поэтому шаблон
должен быть переносимым и работать «из коробки».

### Требования

1. Интеграция с Zabbix 7.0+ без установки Zabbix agent 2 на хост бота
2. Полный набор триггеров: недоступность API, застой очереди, failed rate,
   накопление ошибок
3. Конфигурация через макросы, а не правку шаблона
4. Проверка шаблона в CI: импорт в реальный Zabbix (Docker) + статическая
   валидация
5. Пустой Secret-макрос для API-ключа — реальный токен задаётся на уровне хоста

## Решение

Публикуемый в репозитории agent-less LLD-шаблон
`docs/zabbix-template/zyablik-monitoring-template.yaml`.

### 1. LLD контракт: смена `{#METRIC}` на `pending` (breaking)

Изменение `src/queue-monitor/api/metrics.js` (discovery): ключи `{#METRIC}`
теряют префикс `queue.` и совпадают с именами полей `/summary`.

До (ADR-0034, поправка от 2026-08-01):

```json
{ "{#METRIC}": "queue.pending", "{#LABEL}": "Ожидают отправки" }
```

После:

```json
{ "{#METRIC}": "pending", "{#LABEL}": "Ожидают отправки" }
```

Все шесть ключей: `pending`, `processing`, `delivered`, `failed`, `total`,
`totalAttempts`.

**Почему:** JSONPath-препроцессинг dependent items (`$.{#METRIC}`) должен
совпадать с именем поля в ответе `/summary`. Префикс `queue.` не нёс
нагрузки — все метрики из одной очереди. Аддитивный вариант `{#SUMMARY_KEY}`
отклонён как избыточный (см. альтернативы).

**Последствие:** breaking для существующих потребителей discovery; текущих
внешних потребителей нет (шаблон не существовал). Зафиксировано поправкой в
ADR-0034.

### 2. Структура шаблона

| Часть | Описание |
|-------|----------|
| Макросы | `{$ZYABLIK.URL}` (default `localhost`), `{$ZYABLIK.PORT}` (9000), `{$ZYABLIK.API_KEY}` (Secret, пустой), `{$ZYABLIK.MAX_FAILED}`, `{$ZYABLIK.BACKLOG_SEC}`, `{$ZYABLIK.POLL_INTERVAL}` (30s), `{$ZYABLIK.NODATA_SEC}` (90s, окно nodata триггера доступности) |
| Master item | `zyablik.summary` — HTTP Agent `GET {URL}:{PORT}/api/metrics/summary`, `Authorization: Bearer {$ZYABLIK.API_KEY}`, интервал `{$ZYABLIK.POLL_INTERVAL}` |
| Health item | `zyablik.readyz` — HTTP Agent `GET {URL}:{PORT}/readyz`, без auth |
| LLD rule | `GET /api/metrics/discovery` (Bearer), JSONPath `$.data`, макрос `{#METRIC}`/`{#LABEL}` из ключей объектов |
| Статические dependent items | `zyablik.status.<metric>` (6 шт.) — JSONPath `$.<metric>` из master item `zyablik.summary`; на них завязаны триггеры и графики |
| Delta-элементы переходов | `zyablik.*.delta` (4 шт.: `pending.delta`, `processing.delta`, `failed.delta`, `backlog.delta`) — препроцессинг **SIMPLE_CHANGE** (прирост между опросами); питают item-виджеты дашборда |
| Item prototype (LLD) | `zyablik.queue[{#METRIC}]` — JSONPath `$.{#METRIC}` из master item `zyablik.summary`; поверхность расширения для будущих метрик |
| Дашборд | «Обзор очереди» — 7 виджетов: 4 item (Backlog, Ожидают отправки, В обработке, Ошибки доставки), 2 svggraph (статусы по времени, backlog vs результат), 1 problems. Item-виджеты — семантика **«переходы»**: SUM (`aggregate_function=5`) приростов SIMPLE_CHANGE delta-элементов за период дашборда; пересчитываются при смене периода |

### 3. Триггеры (полный набор)

| Триггер | Выражение (суть) | Severity |
|---------|------------------|----------|
| Бот недоступен | `nodata(zyablik.summary)` или `zyablik.readyz` != 200 | High |
| Застой очереди | `zyablik.status.pending` > 0 и не падает за `{$ZYABLIK.BACKLOG_SEC}` | Average |
| Failed rate | рост `zyablik.status.failed` за окно > `{$ZYABLIK.MAX_FAILED}` | High |
| Накопление ошибок | рост `zyablik.status.totalAttempts` / рост `failed` без доставок | Warning |

Пороги — макросы (`{$ZYABLIK.MAX_FAILED}`, `{$ZYABLIK.BACKLOG_SEC}`), все
проблемные триггеры имеют recovery-выражения.

### 4. Графики

Графики строятся по статическим items `zyablik.status.*`:

- Статусы очереди по времени (delivered/failed/pending/processing)
- Backlog (pending + processing) и delivered vs failed

Те же серии собраны в шаблонный дашборд **«Обзор очереди»** (svggraph +
item + problems виджеты, см. §2). Шаблонные дашборды со svggraph/problems
доступны с Zabbix 7.0 (ZBXNEXT-8086), поэтому минимум контракта остаётся
7.0+.

Почему не graph prototypes: в Zabbix 7.0 graph prototype создаёт **один граф
на каждую LLD-сущность**; мульти-серийный график над LLD-прототипами
невозможен (см. §8).

### 5. Статический валидатор (hand-rolled)

`tests/monitoring/zabbix-template.test.js` — node test без внешних
зависимостей (ADR-0015 запрещает devDependencies): проверяет наличие
обязательных секций, макросов, триггеров, отсутствие секретов.

Полный синтаксис YAML проверяется реальным импортом в Docker-Zabbix.

### 6. Тестовый Zabbix 7.2 в Docker (Sprint 34)

- `docs/zabbix-template/test/docker-compose.yml` — Zabbix server 7.2,
  healthcheck готовности API
- `docs/zabbix-template/test/import-and-verify.js` — импорт шаблона через
  Zabbix API (`configuration.import`) и проверка создания items/triggers
  (`item.get`, `trigger.get`)
- Отдельный workflow `.github/workflows/zabbix-template.yml` — не блокирует
  `verify.yml` (Docker может быть медленным/нестабильным)

### 7. Guard на расширение поверхности мониторинга

При добавлении новых функций бота, меняющих наблюдаемость:

- Новая метрика/статус → дополнить `/api/metrics/discovery` и `summary` —
  LLD-шаблон подхватит по `{#METRIC}`; при необходимости добавить
  статический item `zyablik.status.<metric>` для триггера/графика
- Новый эндпоинт/ошибка доставки → проверить покрытие триггерами; при
  необходимости добавить item/trigger
- Изменение ответа `/summary` или `/discovery` → проверять совместимость с
  шаблоном (JSONPath, `{#METRIC}`)
- Проверка входит в Definition of Done этапа и фиксируется в ADR фичи

### 8. Поправка от 2026-08-01: гибрид static items + LLD

Исходное решение строило триггеры и графики на LLD-прототипах
(`zyablik.queue[{#METRIC}]`). Исследование Zabbix 7.0 показало: **graph
prototype создаёт один граф на каждую LLD-сущность**, т.е. настоящий
мульти-серийный график над LLD-прототипами невозможен. Вариант с
синтетическим «сводным» графом невозможен (граф не может ссылаться на
LLD-прототипы). На ревью с человеком принят гибрид:

- **6 статических dependent items `zyablik.status.<metric>`** — на них
  завязаны триггеры и мульти-серийные графики; JSONPath `$.<metric>` из
  master item `zyablik.summary`.
- **LLD rule остаётся** (ключ `zyablik.queue.discovery`) с item prototype
  `zyablik.queue[{#METRIC}]` как **поверхность расширения**: новые метрики,
  добавленные в `/discovery`, автоматически появляются в Zabbix. Коллизии
  ключей нет: `zyablik.status.<metric>` и `zyablik.queue[{#METRIC}]` —
  разные пространства имён.

Признанная избыточность: для текущих 6 метрик LLD создаёт `zyablik.queue[*]`
items параллельно со статическими — это осознанная плата за автоматическую
расширяемость. Мастер-метрики одинаковые, дублирование данных отсутствует.

**Почему не отключить LLD:** шаблон остаётся самоописательным и
«из коробки» поддерживает будущие метрики без правки триггеров/графов.
Отказ от LLD означал бы ручное добавление items при каждой новой метрике.

## Рассмотренные альтернативы

### LLD: аддитивный `{#SUMMARY_KEY}` (вариант Y)

Добавить второй макрос, не трогая `queue.*`.

Минус: лишняя сущность; префикс `queue.` не нужен — все метрики из одной
очереди; контракт усложняется без выгоды. Отклонено.

### Zabbix agent 2 (вариант B из идеи)

Мониторинг через agent 2 (systemd, journald).

Минус: требует установки agent на хост бота, прав на журнал. Меньше
переносимость для сообщества. MVP — agent-less (Sprint 33-34); agent 2 —
будущий релиз. Отклонено.

### Синтетический e2e-зонд (вариант C)

Тестовая доставка через ingress → outbound → MAX.

Минус: нужен тестовый получатель и доработка бота; риск замусорить
очередь/МАХ тестовыми сообщениями. Отдельная фича, не шаблон. Отклонено.

### `zabbix_sender` / trapper (вариант 5)

Логика алертов уходит из Zabbix в бот.

Минус: отказ от готового discovery, шаблон перестаёт быть
самоописательным. Отклонено.

### Статичный XML вместо нативного YAML

Классический XML-формат шаблона.

Минус: YAML — нативный формат Zabbix 7.0+, проще ревьюится и
поддерживается в git. Отклонено.

### Тестовый Zabbix 7.0 вместо 7.2

Docker-образ той же версии, что минимум контракта.

Минус: шаблон целевой 7.0+, но тесты должны идти на актуальной версии
(7.2) — так ловится будущая деградация совместимости. Принято тестировать
на 7.2.

## Последствия

- Изменение `src/queue-monitor/api/metrics.js`: `{#METRIC}` без префикса
  (breaking, поправка к ADR-0034)
- Обновление тестов `tests/queue-monitor/api/metrics.test.js`
- Новый файл: `docs/zabbix-template/zyablik-monitoring-template.yaml`
- Новые тесты: `tests/monitoring/zabbix-template.test.js`
- Новое тестовое окружение: `docs/zabbix-template/test/` (docker-compose,
  import-and-verify)
- Новый CI: `.github/workflows/zabbix-template.yml`
- Новые документы: `docs/zabbix-monitoring-template.md`, поправки к ADR-0034
- Обновления: README.md, INSTALL.md, docs/project-context.md,
  tasks/sprints/README.md
- Шаблон поставляется с дашбордом «Обзор очереди» (7 виджетов)
- Без новых runtime-зависимостей (ADR-0015 соблюдается; тестовый Zabbix —
  только в CI/Docker)

## Тесты

- `tests/queue-monitor/api/metrics.test.js`: discovery возвращает `{#METRIC}` =
  `pending/...` (без префикса)
- `tests/monitoring/zabbix-template.test.js`: статическая валидация шаблона
- `docs/zabbix-template/test/import-and-verify.js`: импорт в Docker-Zabbix 7.2,
  проверка items/triggers/graphs/dashboard через Zabbix API
- `.github/workflows/zabbix-template.yml`: CI-прогон обоих уровней
