# Zyablik monitoring template for Zabbix

## Problem Statement

Как дать оператору возможность мониторить Zyablik bot из Zabbix без ручных
запросов к `/api/metrics/*`, используя уже готовую метрики-поверхность
ADR-0034 и выявлять сбои доставки и застоя очереди в реальном времени?

## Recommended Direction

**A: agent-less LLD-шаблон** для Zabbix 7.0+, публикуемый в репозитории
zyablik-bot как open source.

Один HTTP Agent master item на `GET /api/metrics/summary` (порт 9000,
`Authorization: Bearer` через secret macro `{$ZYABLIK.API_KEY}`) + LLD rule
на `GET /api/metrics/discovery`, который автоматически создаёт dependent
items по `{#METRIC}` (`pending/processing/delivered/failed/total/
totalAttempts`) с JSONPath-препроцессингом. Плюс item на `/readyz` и полный
набор триггеров: бот недоступен, очередь застряла, failed rate выше порога,
ошибки доставки накапливаются.

Почему A:
- Discovery-эндпоинт (`/api/metrics/discovery`) уже спроектирован именно под
  LLD-механизм Zabbix (ADR-0034, `src/queue-monitor/api/metrics.js`) — не
  нужно изобретать формат.
- Agent-less: шаблон переносим, не требует установки Zabbix agent 2 на хост
  бота — достаточно сетевой доступности порта 9000. Подходит для open-source
  сообщества.
- Один HTTP-запрос за опрос: мастер-item тянет JSON summary, все остальные
  items — dependent, нагрузка на Zabbix poller минимальна.
- `/readyz` без auth — простой health item и триггер на 503.
- Полный набор триггеров — шаблон «работает из коробки», алерты не нужно
  собирать вручную.

Мониторинг процесса/log-слоя (agent 2, systemd, journald) — расширение для
будущих релизов, не входит в MVP (см. Not Doing).

## Key Assumptions to Validate

- [x] `/api/metrics/discovery` отдаёт `pending/processing/delivered/failed/
  total/totalAttempts` — подтверждено в `metrics.js` (discovery handler)
- [ ] `/api/metrics/summary` отдаёт `{status, total, pending, processing,
  delivered, failed, totalAttempts, window}` — подтверждено в `metrics.js`
- [ ] Zabbix 7.0 secret macro `{$ZYABLIK.API_KEY}` корректно прокидывается в
  HTTP Agent item (тип Secret в макросах) — проверить на тестовом Zabbix 7.2
- [ ] `/readyz` отдаёт 200/503 без auth — подтверждено в `readyz.js`
- [ ] Poll interval 30s достаточен для триггеров «застой очереди» и
  «недоступность бота» — проверить на живых данных стенда
- [ ] Пороговые значения триггеров (failed rate, backlog) не дают ложных
  срабатываний при нормальной работе (пик 113 msg/час, ADR-0034)

## Monitoring surface expansion guard

При добавлении новых функций в бот, меняющих наблюдаемость, проверять
расширение поверхности мониторинга:

- [ ] Новая метрика/статус → дополнить `/api/metrics/discovery` (и
  `summary`, если уместно) + LLD-шаблон автоматически подхватит по `{#METRIC}`
- [ ] Новый эндпоинт / новая ошибка доставки → проверить, покрыт ли он
  триггерами шаблона; при необходимости добавить item/trigger
- [ ] Изменение ответа `/summary` или `/discovery` → проверять совместимость
  с шаблоном (JSONPath-препроцессинг, ключи `{#METRIC}`)
- [ ] Зафиксировать проверку в чек-листе этапа (sprint) и в ADR/идее
  соответствующей фичи — мониторинг как часть Definition of Done

## MVP Scope

### In (MVP)

- Файл шаблона Zabbix 7.0 (YAML): master item `summary`, LLD rule на
  `/discovery`, dependent items с JSONPath, item `/readyz`
- Secret macro `{$ZYABLIK.API_KEY}` (Secret) и макрос `{$ZYABLIK.URL}` /
  `{$ZYABLIK.PORT}` (default 9000) для конфигурации без правки шаблона
- Триггеры: недоступность API (HTTP Agent error / `/readyz` != 200),
  застой очереди (pending > 0 и не падает за окно), failed rate > порога,
  рост totalAttempts/failed
- Графики: статусы очереди по времени, backlog, failed/delivered
- Документация в `docs/` (install: импорт шаблона, настройка хоста, макросы,
  описание триггеров и порогов)

### Out (MVP)

- Модуль для agent 2 (systemd unit, journald audit-логи ADR-0029)
- Синтетический e2e-зонд (тестовая доставка через ingress → outbound → MAX)
- Интеграция timeseries/top/errors в шаблон (для них нет discovery; если
  понадобятся — доп. master items и items)
- Шаблоны для Prometheus/Grafana/других систем
- Автогенерация шаблона из discovery (генератор вместо статичного файла)

## Not Doing (and Why)

- **Agent 2 / systemd / journald (вариант B)** — требует прав на журнал и
  установку agent; разделено на будущий релиз. MVP стартует agent-less,
  переносимым для сообщества.
- **e2e-зонд (вариант C)** — нужен тестовый получатель и доработка бота;
  риск замусорить очередь/МАХ тестовыми сообщениями. Ценность высокая, но это
  отдельная фича, не шаблон.
- **`zabbix_sender`/trapper (вариант 5)** — отказ от готового discovery,
  логика уходит из Zabbix, шаблон перестаёт быть самоописательным.
- **«Мониторим Зяблика через Зяблика» (вариант 6)** — раздувание scope:
  алерты в МАХ через бота требуют отдельного получателя и не входят в задачу
  «шаблон мониторинга».
- **Prometheus-экспортер** — противоречит готовой метрики-поверхности
  ADR-0034; LLD-формат уже универсален.
- **Триггеры с жёсткими порогами «в коде шаблона»** — пороги должны быть
  макросами (`{$ZYABLIK.MAX_FAILED}`, `{$ZYABLIK.BACKLOG_SEC}`), иначе шаблон
  неприменим в разных средах.

## Open Questions

- [x] Подтвердить формат шаблона: нативный YAML (7.0) vs классический XML —
  выбран нативный YAML (Zabbix 7.0+)
- [x] Порт: всегда 9000 или макрос `{$ZYABLIK.PORT}` (env `MONITOR_PORT`)? —
  макрос `{$ZYABLIK.PORT}` (default 9000)
- [x] Нужен ли в шаблоне хост-макрос на `METRICS_API_KEY` отдельно от
  template-macro (многопользовательское использование)? — secret macro
  `{$ZYABLIK.API_KEY}` в шаблоне (пустое значение), реальный токен —
  host-level override, инструкция в доке
- [x] Как тестировать шаблон в CI без живого Zabbix (валидация YAML,
  схемы)? — CI-пайплайн: поднять Zabbix server 7.2 в Docker, импортировать
  шаблон, проверить создание items/triggers; плюс статическая валидация YAML
