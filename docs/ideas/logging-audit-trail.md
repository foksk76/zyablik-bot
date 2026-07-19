# Lifecycle Audit Trail для bot-platform

## Problem Statement

Как сделать каждое сообщение, проходящее через bot-platform, полностью трассируемым от входа до доставки в MAX API, чтобы оператор мог за 2 минуты расследовать инцидент «сообщение не пришло / ушло не тому / пришло с задержкой»?

## Recommended Direction

Два слоя логирования с разделением по префиксу:

### Слой 1 — Audit trail (только facts)

Записи формата `[audit] action params`. Минимальный шум, максимальная читаемость. Предназначен для:
- быстрого просмотра «что произошло»
- фильтрации `journalctl -u ... | grep '\[audit\]'`
- алертинга в будущем (logstash → Prometheus alerts)

```text
[audit] auth success sub=zabbix source=zabbix ip=127.0.0.1
[audit] message queued id=13 source=zabbix recipient=user:219338126
[audit] message delivered id=13 duration_ms=45
[audit] message failed id=14 reason="timeout" attempts=5
```

### Слой 2 — Lifecycle trace (полная трассировка)

Записи формата `[trace:req:<id>] action params`. Генерируется `reqId` на входе HTTP-запроса, прокидывается через весь pipeline. Предназначен для:
- разбора конкретного инцидента
- поиска всех записей по одному `reqId`
- понимания полного path сообщения

```text
[trace:req:abc123] ingress POST /ingest from 127.0.0.1
[trace:req:abc123] jwt verified sub=zabbix entitlements=["zabbix"]
[trace:req:abc123] normalized recipient=user:219338126
[trace:req:abc123] enqueued id=13
[trace:queue:13] dequeued attempt=1
[trace:queue:13] outbound POST https://platform-api2.max.ru/messages?user_id=219338126 statusCode=200
[trace:queue:13] delivered duration_ms=45
```

### Формат для парсинга

Каждая запись содержит:
```
[timestamp] [level] [module:reqId] action {json-context}
```

Пример:
```text
[2026-07-18T04:58:06.123Z] [info] [ingress:req:abc123] auth success {"sub":"zabbix","source":"zabbix"}
```

- Человек читает текст до `{`
- Logstash парсит JSON-хвост через `json` filter
- Level идёт первым после timestamp — совместимость с logstash grok `%{LOGLEVEL:level}`

### reqId в queue table

`reqId` — отдельный столбец в `delivery_queue` (TEXT). Позволяет SQL-запросы по correlation ID:

```sql
SELECT * FROM delivery_queue WHERE req_id = 'abc123-def456';
```

## Key Assumptions to Validate

- [x] Формат `[timestamp] [level] [module:reqId]` — level первым после timestamp для совместимости с grok — **решено**
- [x] `reqId` в queue table как отдельный столбец — **решено**
- [ ] journald корректно отображает формат `[timestamp] [level] [module:reqId]` — проверить `journalctl -o json`
- [ ] Audit trail без immutability достаточен для текущего scope (internal tooling, max 10 users) — подтверждено ADR-0029

## MVP Scope

### In scope
- Генерация `reqId` (crypto.randomUUID) в `http-server.js` на входе
- `req_id` столбец в `delivery_queue` (TEXT, nullable для backward compat)
- Прокидывание `reqId` через queue payload и столбец
- Audit-точки: `auth success/fail`, `message queued`, `message delivered`, `message failed`
- Trace-точки: `ingress`, `jwt`, `normalized`, `enqueued`, `dequeued`, `outbound`, `delivered`
- Формат `[timestamp] [level] [module:reqId] action {json}` — совместимый с logstash grok
- Документация: формат логов, фильтрация, интеграция с logstash

### Out of scope (Not Doing)
- Prometheus метрики — отдельный ADR, когда появится monitoring stack
- Immutable storage / hash chain — не требуется для current scope
- Централизованный logstash — MVP, описание в docs для будущей интеграции
- Structured JSON в每一行 — компромисс: текст + JSON-хвост

## Not Doing (and Why)

- **Prometheus метрики** — отдельная задача, требует monitoring stack. Audit trail покрывает ручной разбор, метрики — алертинг.
- **Immutable audit log** — для PCI-DSS/SOC2. Текущий scope — internal tooling. journald sufficient.
- **Separate audit log file** — на практике оба слоя в stdout/stderr → journald. Разделение по префиксу, не по файлу.
- **Log rotation policy** — journald имеет встроенные limits. Описательно в docs.
- **Correlation ID для direct path** — direct path deprecated (ADR-0022). Trace только для ingress path.

## Resolved Questions

1. ~~Формат `[timestamp] [level] [module:reqId]` — должен ли level быть первым после timestamp для совместимости с logstash grok?~~ → Да, level первым
2. ~~Нужен ли `reqId` в queue table как отдельный столбец (для SQL-запросов), или достаточно в JSON payload?~~ → Отдельный столбец
