# ADR-0029: Lifecycle audit trail для bot-platform

## Статус

Принято.

## Дата

2026-07-18

## Контекст

ADR-0022 расширяет scope проекта на multi-source HTTP-ingress. ADR-0023 принимает входящий HTTP в bot-platform. ADR-0028 вводит очередь доставки сообщений.

Текущий logging покрывает 3 из ~15 этапов pipeline:

```text
Клиент (bot-platform-ingest.js):  ✅ token request, ✅ send to /ingest, ✅ response
Сервер (bot-platform):            ✅ oidc-verifier warning (только HTTP)
                                  ❌ incoming HTTP request (method, path, IP)
                                  ❌ JWT authentication (success/failure, sub, claims)
                                  ❌ source extraction
                                  ❌ normalization
                                  ❌ queue enqueue (item ID, recipient)
                                  ❌ queue dequeue
                                  ❌ outbound request/response
                                  ❌ ack/nack
```

Инциденты, которые невозможно расследовать:
- Несанкционированная отправка (нет JWT claims)
- Отправка не тому пользователю (нет recipient из inbound)
- Потеря сообщения (нет lifecycle-трассировки)
- Задержка доставки (нет timestamp'ов для этапов)
- Ошибочная нормализация (нет input/output)

Live run 2026-07-18 подтвердил: сообщение доставлено (status=200), но оператор не может проверить ни один промежуточный этап.

## Решение

Ввести двуслойное журналирование: **audit trail** (только facts) + **lifecycle trace** (полная трассировка по `reqId`).

### Слой 1: Audit trail

Записи формата `[audit] action params`. Минимальный шум, максимальная читаемость.

```text
[audit] auth success sub=zabbix source=zabbix ip=127.0.0.1
[audit] message queued id=13 source=zabbix recipient=user:219338126
[audit] message delivered id=13 duration_ms=45
[audit] message failed id=14 reason="timeout" attempts=5
```

Audit-точки:

| Этап | Событие | Параметры |
|------|---------|-----------|
| Аутентификация | `auth success` | `sub`, `source`, `ip` |
| Аутентификация | `auth failed` | `reason`, `ip` |
| Очередь | `message queued` | `id`, `source`, `recipient` |
| Очередь | `message delivered` | `id`, `duration_ms` |
| Очередь | `message failed` | `id`, `reason`, `attempts` |

### Слой 2: Lifecycle trace

Записи формата `[trace:req:<id>] action params`. `reqId` генерируется на входе HTTP-запроса (`crypto.randomUUID()`), прокидывается через весь pipeline.

```text
[trace:req:abc123] ingress POST /ingest from 127.0.0.1
[trace:req:abc123] jwt verified sub=zabbix entitlements=["zabbix"]
[trace:req:abc123] normalized recipient=user:219338126
[trace:req:abc123] enqueued id=13
[trace:queue:13] dequeued attempt=1
[trace:queue:13] outbound POST https://platform-api2.max.ru/messages?user_id=219338126 statusCode=200
[trace:queue:13] delivered duration_ms=45
```

Trace-точки:

| Этап | Событие | Параметры |
|------|---------|-----------|
| Ingress | `ingress` | `method`, `path`, `from` (IP) |
| JWT | `jwt verified` | `sub`, `entitlements` |
| JWT | `jwt failed` | `reason` |
| Normalizer | `normalized` | `recipient` |
| Queue | `enqueued` | `id` |
| Worker | `dequeued` | `attempt` |
| Outbound | `outbound` | `url`, `statusCode` |
| Delivery | `delivered` | `duration_ms` |
| Delivery | `failed` | `reason`, `attempts` |

### Формат для парсинга

```text
[<ISO-timestamp>] [<level>] [<module>:<reqId>] <action> {<json-context>}
```

Пример:
```text
[2026-07-18T04:58:06.123Z] [info] [ingress:req:abc123] auth success {"sub":"zabbix","source":"zabbix"}
```

- Человек читает текст до `{`
- Logstash парсит JSON-хвост через `json` filter
- Фильтрация: `journalctl -u zyablik-bot-live | grep '\[audit\]'`

### Прокидывание reqId через очередь

`reqId` хранится в двух местах:

1. **Queue payload** (JSON TEXT) — для передачи между компонентами
2. **Столбец `req_id`** в `delivery_queue` (TEXT, nullable) — для SQL-запросов по correlation ID

```sql
SELECT * FROM delivery_queue WHERE req_id = 'abc123-def456';
```

`reqId` добавляется в queue payload:

```json
{
  "kind": "text",
  "recipient": {"kind": "user", "value": "219338126"},
  "text": "...",
  "reqId": "abc123-def456"
}
```

Worker логирует `[trace:queue:<id>]` с тем же `reqId` из payload.

### Интеграция с logstash (документация)

MVP: логи в journald. Документация описывает будущую интеграцию:

```text
bot-platform → stdout/stderr → journald → syslog (UDP) → logstash → Elasticsearch/Loki
```

Logstash config (описание в docs):
```
filter {
  grok {
    match => { "message" => "\[%{ISO8601_TIMEZONE:ts}\] \[%{LOGLEVEL:level}\] \[%{DATA:module}:%{DATA:reqId}\] %{WORD:action} %{GREEDYDATA:json_context}" }
  }
  if [json_context] =~ /^\{/ {
    json { source => "json_context" }
  }
}
```

### Изменения в модулях

| Модуль | Изменение |
|--------|-----------|
| `ingress/http-server.js` | Генерация `reqId`, audit-логи auth/queue, trace-лог ingress |
| `ingress/jwt-source-auth.js` | Audit-лог auth success/fail |
| `queue/store.js` | Trace-лог enqueue |
| `queue/worker.js` | Trace-лог dequeue/delivered/failed, audit-лог delivered/failed |
| `transports/max/outbound-client.js` | Trace-лог outbound request/response |

### Конфигурация

```text
MAX_LOG_LEVEL=info                # debug|info|warn|error
LOG_AUDIT=false                    # включить audit trail
LOG_TRACE=true                    # включить lifecycle trace
```

## Почему два слоя, а не один

- Audit trail — для быстрого просмотра и алертинга (grep `\[audit\]`)
- Trace — для глубокого разбора инцидента (grep `reqId`)
- Один слой либо слишком шумный (trace для каждого), либо слишком скудный (audit без деталей)

## Почему reqId и в payload, и в столбце

- Payload — для передачи между компонентами (JSON TEXT)
- Столбец `req_id` — для SQL-запросов по correlation ID
- reqId — transport-level metadata, но SQL-доступ удобен для расследования инцидентов
- Столбец nullable — backward compatible с существующими записями

## Почему текстовый формат, а не чистый JSON

- Один процесс пишет в stdout → journald
- journald хранит одну строку на запись
- JSON multi-line в journald читается хуже
- Компромисс: текст для человека + JSON-хвост для парсинга

## Почему не structured logging (pino/winston)

- ADR-0015: нулевые внешние зависимости
- Текущий `createSafeLogger` уже решает проблему маскировки секретов
- Добавление pino/winston = +2 зависимости ради форматирования, которое решается простой функцией

## Почему не Prometheus метрики

- Требует monitoring stack (Prometheus + Grafana)
- Audit trail покрывает ручной разбор инцидентов
- Метрики — алертинг, отдельная задача
- При появлении monitoring stack — расширить, не заменять

## Почему не immutability / hash chain

- Текущий scope: internal tooling, max 10 users
- journald sufficient для current requirements
- При compliance-требованиях (PCI-DSS, SOC2, ФЗ-152) — immutable storage на уровне инфраструктуры (logstash → S3 object lock)

## Последствия

- `reqId` добавляется в queue payload (JSON field) и в столбец `req_id` (TEXT, nullable)
- Миграция SQLite: `ALTER TABLE delivery_queue ADD COLUMN req_id TEXT`
- 5 модулей получают audit/trace-точки
- Новая зависимость: `crypto.randomUUID()` (встроенная в Node.js)
- Документация: формат логов, фильтрация, интеграция с logstash

### Миграция схемы

```sql
-- Добавить столбец req_id (nullable для backward compat)
ALTER TABLE delivery_queue ADD COLUMN req_id TEXT;

-- Индекс для SQL-запросов по correlation ID
CREATE INDEX idx_queue_req_id ON delivery_queue(req_id);
```

## Рассмотренные альтернативы

### Только audit trail (без trace)

Минус: невозможно отследить message через pipeline. Для инцидента «сообщение не пришло» нужно знать на каком этапе застряло. Отклонено.

### Только trace (без audit)

Минус: слишком шумно для быстрого просмотра. Оператору нужен `grep \[audit\]`, а не `grep \[trace\]`. Отклонено.

### Structured JSON на каждой строке

Минус: нарушает ADR-0015 (zero deps). Текст + JSON-хвост — компромисс, который решает задачу. Отклонено.

### Correlation ID через HTTP header

Минус: bot-platform-ingest.js — не HTTP-клиент в traditional sense. `reqId` генерируется на ingress, передаётся через payload. HTTP header избыточен. Отклонено.

## Реализовано

Sprint 17 (2026-07-18):

| Модуль | Изменение |
|--------|-----------|
| `core/config.js` | `LOG_AUDIT`, `LOG_TRACE` env vars (default: false/true) |
| `core/logger.js` | `formatLogLine()` helper для ADR-0029 формата |
| `queue/store.js` | `req_id` столбец (nullable) + index, trace log при enqueue |
| `ingress/http-server.js` | `reqId` генерируется через `crypto.randomUUID()`, trace/audit логи |
| `ingress/jwt-source-auth.js` | Audit-логи auth success/fail с `reqId` и `ip` |
| `queue/worker.js` | Trace/audit логи для dequeue/delivered/failed с `duration_ms` |
| `transports/max/outbound-client.js` | Trace-логи для outbound request/response |

Тесты: 293 tests passing (15 новых тестов для audit/trace).
