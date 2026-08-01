# Zabbix Monitoring Template для Zyablik bot

Шаблон мониторинга бота-доставки уведомлений из Zabbix в МАХ
(ADR-0043). Agent-less: все метрики собираются по HTTP
(HTTP agent item), без установки Zabbix agent 2 на хост бота.

```text
Zyablik bot (HTTP) -> Zabbix server (шаблон Zyablik monitoring) -> триггеры/графики
```

Файл шаблона: `docs/zabbix-template/zyablik-monitoring-template.yaml`
(Zabbix 7.0+, YAML, UUID-based, переимпортируемый).

## Что мониторит

- **Доступность бота** — `GET /readyz` (без авторизации); не-200 или
  отсутствие данных -> триггер «бот недоступен».
- **Состояние очереди доставки** — `/api/metrics/summary` (Bearer):
  `pending`, `processing`, `delivered`, `failed`, `total`, `totalAttempts`.
- **Застой очереди и рост ошибок** — триггеры на dependent items
  `zyablik.status.*` (см. [Триггеры](#триггеры)).
- **Новые метрики очереди** — LLD-правило `zyablik.queue.discovery`
  поверх `/api/metrics/discovery`: метрика, добавленная в discovery,
  автоматически появляется в Zabbix как `zyablik.queue[{#METRIC}]`
  без правки шаблона.

Не мониторит (вне scope, см. ADR-0043): ресурсы хоста (CPU/RAM — через
штатные шаблоны Zabbix), e2e-доставку в МАХ, обработку событий Zabbix
из мессенджера.

## Установка (импорт шаблона)

1. В веб-интерфейсе Zabbix: **Data collection -> Templates -> Import**.
2. Выберите `docs/zabbix-template/zyablik-monitoring-template.yaml`.
3. Отметьте **Create missing / Update existing** для групп, шаблонов,
   элементов, правил обнаружения, триггеров и графиков.
4. Импорт создаст:
   - шаблон **Zyablik monitoring** в группе **Templates/Zyablik**;
   - 10 items, 1 LLD-правило, 4 триггера, 2 графика.

Проверка импорта через API (для CI и локальных прогонов):
`docs/zabbix-template/test/import-and-verify.js`.

## Настройка хоста

Привяжите шаблон **Zyablik monitoring** к хосту Zabbix, представляющему
бот, и задайте на **уровне хоста**:

| Макрос | Пример | Назначение |
|--------|--------|------------|
| `{$ZYABLIK.URL}` | `http://bot.example.internal` | Базовый URL бота без порта и пути |
| `{$ZYABLIK.PORT}` | `9000` | HTTP-порт бота |
| `{$ZYABLIK.API_KEY}` | `<реальный токен>` | API-ключ для `/api/metrics/*` (Secret) |

`{$ZYABLIK.API_KEY}` — **секретный макрос** (в шаблоне без значения):
задаётся только на уровне хоста, в шаблон не передаётся. Без него
метрики `/api/metrics/*` будут возвращать 401 и перейдут в unsupported.

## Макросы шаблона (defaults)

| Макрос | Значение | Описание |
|--------|----------|----------|
| `{$ZYABLIK.URL}` | `http://127.0.0.1` | Базовый URL бота |
| `{$ZYABLIK.PORT}` | `9000` | HTTP-порт бота |
| `{$ZYABLIK.API_KEY}` | *(пусто, Secret)* | API-ключ для `/api/metrics/*` |
| `{$ZYABLIK.POLL_INTERVAL}` | `30` | Интервал опроса HTTP-эндпоинтов, сек |
| `{$ZYABLIK.NODATA_SEC}` | `90` | Окно отсутствия данных `/readyz` для триггера «бот недоступен» (по умолчанию 3 интервала опроса), сек |
| `{$ZYABLIK.BACKLOG_SEC}` | `1800` | Окно анализа застоя очереди и роста ошибок, сек |
| `{$ZYABLIK.MAX_FAILED}` | `10` | Порог прироста `failed`/`totalAttempts` за окно |

## Items

| Item | Тип | Описание |
|------|-----|----------|
| `zyablik.summary` | HTTP agent | `GET {URL}:{PORT}/api/metrics/summary`, Bearer. Мастер для `zyablik.status.*` |
| `zyablik.get.discovery` | HTTP agent | `GET {URL}:{PORT}/api/metrics/discovery`, Bearer. Мастер для LLD |
| `zyablik.readyz` | HTTP agent | `GET {URL}:{PORT}/readyz`, без auth. Healthcheck. `history: 1d` — `nodata()` требует history |
| `zyablik.status.pending` | Dependent | `$.pending` из `zyablik.summary` |
| `zyablik.status.processing` | Dependent | `$.processing` |
| `zyablik.status.delivered` | Dependent | `$.delivered` |
| `zyablik.status.failed` | Dependent | `$.failed` |
| `zyablik.status.total` | Dependent | `$.total` |
| `zyablik.status.totalAttempts` | Dependent | `$.totalAttempts` |
| `zyablik.backlog` | Calculated | `last(pending) + last(processing)` |
| `zyablik.queue.discovery` | LLD rule | `$.data` из `zyablik.get.discovery` |
| `zyablik.queue[{#METRIC}]` | Item prototype | `$.{#METRIC}` из `zyablik.summary` |

## Триггеры

| Триггер | Выражение (суть) | Severity | Recovery |
|---------|------------------|----------|----------|
| Zyablik: бот недоступен | `nodata(zyablik.readyz, {$ZYABLIK.NODATA_SEC})` | High | Automatic |
| Zyablik: очередь не разгружается | `min(zyablik.status.pending, {$ZYABLIK.BACKLOG_SEC}) > 0` | Average | Automatic |
| Zyablik: рост числа ошибок доставки | рост `zyablik.status.failed` за окно > `{$ZYABLIK.MAX_FAILED}` | High | Automatic |
| Zyablik: накопление ошибок доставки | рост `zyablik.status.totalAttempts` за окно > `{$ZYABLIK.MAX_FAILED}` | Warning | Automatic |

Все триггеры `manual_close = YES`. Зависимости: триггер «накопление ошибок»
зависит от «рост числа ошибок доставки» (не дублирует проблему).

> **Особенность Zabbix:** в периоде функции `nodata()` не допускается
> арифметика — `nodata(..., 3*{$ZYABLIK.POLL_INTERVAL})` при
> `configuration.import` молча теряет триггер (создаётся 3 из 4), без ошибки.
> Поэтому окно вынесено в отдельный макрос `{$ZYABLIK.NODATA_SEC}`.
>
> Ещё одно ограничение: calculated items не переписывают ссылки
> `/Имя-шаблона/item` на хост при линковке (в отличие от триггеров) —
> `zyablik.backlog` использует host-относительную форму `last(//key)`,
> где хост берётся у самого calculated item.
>
> И `nodata()` требует включённой history у элемента: при `history: '0'`
> триггер не вычисляется («item history is disabled»). Поэтому у
> `zyablik.readyz` history оставлена включённой (`1d`).
>
> Оба случая проверяются статическим тестом
> `tests/monitoring/zabbix-template.test.js` и живым импортом в CI.

## Графики

- **Zyablik: Статусы очереди по времени** — `pending`, `processing`,
  `delivered`, `failed`.
- **Zyablik: Backlog и результат доставки** — `zyablik.backlog`,
  `delivered`, `failed`.

## Локальный прогон импорта в Docker-Zabbix

```bash
cd docs/zabbix-template/test
docker compose up -d --wait
node ../test/import-and-verify.js
docker compose down -v
```

Стек: postgres 16 + Zabbix server 7.2 + web (nginx, порт 8080). Скрипт
`import-and-verify.js` ждёт готовности API (`apiinfo.version`), логинится,
импортирует шаблон через `configuration.import` (Bearer-авторизация) и
проверяет создание: шаблон, 10 items, 1 LLD-правило, 4 триггера, 2 графика.
Exit code 0 — успех.

## Живой стенд

Проверка на реально работающем боте (см. [sprint-35.md](../tasks/sprints/sprint-35.md)):

1. Поднять Zabbix в Docker (как в разделе выше), бота — отдельным процессом
   с `QUEUE_ENABLED=true`, `MONITOR_ENABLED=true`, `MONITOR_PORT=9000`
   и `METRICS_API_KEY`. На стенде бот работает как systemd-юнит
   `zyablik-bot-live.service` (`EnvironmentFile=-/root/zyablik-bot/.env`).
2. Завести хост: `node docs/zabbix-template/test/stand-host.js` —
   создаёт/обновляет хост «Zyablik bot stand», привязывает шаблон, задаёт
   host-level макросы (URL/port через docker bridge gateway, `{$ZYABLIK.API_KEY}`
   — Secret, ускоренный `POLL_INTERVAL=10`, `NODATA_SEC=30`). Идемпотентен.
3. Проверить: все items `state=0` и значения совпадают с `/summary` бота;
   LLD создал `zyablik.queue[...]`; триггеры OK.
4. Симуляция отказа: остановить бот → «бот недоступен» PROBLEM (High) через
   `{$ZYABLIK.NODATA_SEC}`; запустить → RECOVERY автоматически.

Проверено 2026-08-01: сбор метрик, LLD, PROBLEM -> RECOVERY (подробности и
продолжительность в sprint-35.md). Quirka Zabbix, найденные стендом, описаны
выше (nodata-арифметика, calculated `//key`, history для nodata) и закрыты
регресс-тестами.

## CI

`.github/workflows/zabbix-template.yml` (отдельный от `verify.yml`):
статический валидатор (`npm test`) + поднятие Docker-Zabbix и живой импорт
с проверкой entities.

## Ограничения и известные особенности

- **Graph prototypes не используются**: graph prototype создаёт один граф на
  каждую LLD-сущность; мульти-серийный график над LLD-прототипами
  невозможен (ADR-0043 §8). Поэтому графики и триггеры завязаны на
  статические items `zyablik.status.*`.
- **Коллизии ключей нет**: `zyablik.status.<metric>` и
  `zyablik.queue[{#METRIC}]` — разные пространства имён.
- **Тире U+2014 не использовать** в строках шаблона в одинарных кавычках:
  импортёр Zabbix 7.2 (symfony/yaml) молча теряет сущности (проверено на
  триггерах). Используйте обычный дефис.
- **Zabbix 7.2**: аутентификация API через заголовок `Authorization: Bearer`,
  параметр импорта — `format: 'yaml'`, `value_type` = `UNSIGNED`,
  секретный макрос = `SECRET_TEXT` (не `SECRET`).

## Расширение поверхности мониторинга (guard)

При добавлении новых функций бота, меняющих наблюдаемость (см. ADR-0043 §7):

- Новая метрика/статус -> дополнить `/api/metrics/discovery` и `summary`;
  LLD-шаблон подхватит по `{#METRIC}`. При необходимости добавить
  статический item `zyablik.status.<metric>` для триггера/графика.
- Новый эндпоинт/ошибка доставки -> проверить покрытие триггерами.
- Изменение ответа `/summary` или `/discovery` -> проверить совместимость с
  шаблоном (JSONPath, `{#METRIC}`).
- Любое изменение шаблона отражать в этом документе и в
  `tests/monitoring/zabbix-template.test.js`; прогонять `npm test`.

## Связанные документы

- [ADR-0043: Zabbix Monitoring Template](decisions/ADR-0043-zabbix-monitoring-template.md)
- [ADR-0034: Queue Monitor Dashboard](decisions/ADR-0034-queue-monitor-dashboard.md)
- [Idea: мониторинг через Zabbix Monitoring Template](ideas/zyablik-monitoring-template-zabbix.md)
- [Zabbix Media type: MAX](zabbix-media-type.md)
