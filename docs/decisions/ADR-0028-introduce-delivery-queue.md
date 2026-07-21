# ADR-0028: Ввести очередь доставки сообщений (delivery queue)

## Статус

Принято.

## Дата

2026-07-17

## Контекст

ADR-0022 расширяет scope проекта на multi-source HTTP-ingress. ADR-0023 принимает входящий HTTP в bot-platform. ADR-0024 принимает `@okta/jwt-verifier`. ADR-0025 принимает `better-sqlite3` для delivery-log.

Текущий outbound-client (`src/bot-platform/transports/max/outbound-client.js:57`) делает прямой `httpClient.post(request)` — fire-and-forget. При недоступности MAX Bot API сообщение теряется. Delivery-log записывает факт потери, но не восстанавливает.

Заказчик подтвердил (interview, 2026-07-17): **потеря алертов недопустима, задержка доставки допустима.** Это значит, что at-most-once (текущий) неприемлем для multi-source ingest, а at-least-once (очередь) необходим.

## Решение

Ввести очередь доставки сообщений (delivery queue) как transport-level guarantee для всех источников. Очередь — таблица в существующем SQLite (ADR-0025), worker — `setInterval` в одном процессе `app.js` (ADR-0009).

### Guarantee

at-least-once доставка. Сообщение гарантированно доставляется (с задержкой) при временном недоступности MAX Bot API. Возможны дубли — нивелируются через idempotency_key.

### Архитектура

```text
Source → POST /ingest → normalize → enqueue() → [delivery_queue table]
                                                          ↓
                                                     worker loop (setInterval)
                                                          ↓
                                                outbound-client.send() → POST MAX API
                                                          ↓
                                                    2xx → ack (status=delivered)
                                                    !2xx → nack (status=pending, retry)
                                                    5+ попыток → status=failed
```

Один процесс, два pipeline (ADR-0009, ADR-0023). Очередь — таблица в SQLite. Worker — `setInterval` внутри `app.js`.

### Схема очереди

```sql
CREATE TABLE delivery_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    payload         TEXT NOT NULL,           -- JSON outbound request
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending|processing|delivered|failed
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 5,
    next_retry_at   INTEGER NOT NULL DEFAULT 0,       -- unix timestamp (seconds)
    created_at      INTEGER NOT NULL,                  -- unix timestamp
    updated_at      INTEGER NOT NULL,                  -- unix timestamp
    source          TEXT,                              -- 'zabbix', 'siem', etc.
    idempotency_key TEXT                               -- для dedup
);

CREATE INDEX idx_queue_pending ON delivery_queue(status, next_retry_at);
```

> **Примечание:** В реализации колонка `idempotency_key` переименована
> в `req_id` (миграция `ALTER TABLE ADD COLUMN req_id TEXT`).
> См. ADR-0034 для деталей схемы reader.

### Retry strategy

Exponential backoff: `delay = min(base^attempts * 60, max)` секунд.

| Attempt | Delay (base=2, max=300) |
|---|---|
| 1 | 2 минуты |
| 2 | 4 минуты |
| 3 | 5 минут (capped) |
| 4 | 5 минут (capped) |
| 5 | 5 минут (capped) |

После `max_attempts` → статус `failed`. Запись остаётся в таблице для review.

### Статусы

- `pending` — ждёт отправки
- `processing` — worker взял в обработку
- `delivered` — успешно доставлено (финальный)
- `failed` — ошибка после max_attempts (финальный)

> **ADR-0033 (crash recovery):** статус `processing` дополняется меткой
> времени `processing_since`; строки, зависшие в `processing` дольше
> `QUEUE_PROCESSING_TTL_SECONDS` (default 300), возвращаются в `pending`
> без инкремента `attempts`. См. ADR-0033.

### Integration с текущим кодом

**Изменения в существующих модулях:**

- `live-pipeline.js` — замена `outboundClient.send()` → `queueStore.enqueue()`;
- `app.js` — запуск worker interval на старте (при `QUEUE_ENABLED=true`).

**Новые модули:**

- `queue/store.js` — SQLite operations (enqueue, dequeue, ack, nack, stats);
- `queue/worker.js` — poll loop + process + ack/nack.

**Без изменений:**

- `outbound-client.js` — остаётся fire-and-forget. Worker вызывает его для отправки.

### delivery-log расширение

| Поле | Было | С очередью |
|---|---|---|
| `entry_id` | — | ID из delivery_queue |
| `status` | `delivered` / `error` | `delivered` / `queued` / `retrying` / `failed` |
| `attempts` | 1 | 1..max_attempts |
| `queue_latency_ms` | — | время от enqueue до delivery |

### Dead letter handling

Сообщения со статусом `failed` не удаляются автоматически. Для MVP — manual review через SQL. Replay и cron cleanup — будущее.

### Конфигурация

```text
QUEUE_ENABLED=false           # default off (backward compatible)
QUEUE_MAX_ATTEMPTS=5          # retry limit
QUEUE_INTERVAL_MS=5000        # worker poll interval
QUEUE_BATCH_SIZE=10           # messages per worker cycle
QUEUE_BACKOFF_BASE=2           # exponential backoff base
QUEUE_BACKOFF_MAX=300          # max backoff (seconds)
QUEUE_FAILED_TTL_DAYS=7       # auto-cleanup failed entries (будущее)
```

### Dry-run mode

При `networkEnabled=false` (dry-run) очередь не используется — `outboundClient.send()` возвращает dry-run payload напрямую. Очередь — live-only feature.

## Почему очередь в SQLite, а не отдельный процесс

- ADR-0009 фиксирует «один runtime»;
- SQLite уже принят для delivery-log (ADR-0025);
- Один процесс = один systemd-unit, проще операционно;
- Volume (тысячи записей/день) не требует отдельного процесса.

## Почему at-least-once, а не exactly-once

- Exactly-once невозможен без distributed transactions (два отдельных сервиса: bot-platform и MAX API);
- at-least-once + idempotency_key — стандартный паттерн для message delivery;
- Дубли возможны при crash worker giữa send и ack — приемлемый trade-off;
- MAX API не гарантирует idempotency — дубли могут дойти до получателя.

## Почему не внешний брокер (Redis/RabbitMQ)

- Избыточно для одной ноды с тысячами записей в день;
- Добавляет operational complexity (отдельный сервис, мониторинг, backup);
- ADR-0009 фиксирует «один runtime, меньше операционных сущностей»;
- SQLite уже есть (ADR-0025), достаточен для volume.

## Почему не priority queue

- Все сообщения равны по приоритету;
- Приоритизация — забота источника (источник сам определяет recipient);
- Добавление priority = extra column, extra sorting, extra complexity без benefit для MVP.

## Почему не in-memory queue

- При рестарте процесса все pending сообщения потеряны;
- SQLite persistence гарантирует delivery после restart;
- In-memory queue = at-most-once (то, от чего уходим).

## Последствия

- `queue/store.js` и `queue/worker.js` — новые модули;
- `live-pipeline.js` получает enqueue вместо direct send;
- `app.js` запускает worker при `QUEUE_ENABLED=true`;
- delivery_queue table в SQLite;
- delivery-log расширяется на queue-specific поля;
- dry-run mode не затронут (очередь live-only);
- default `QUEUE_ENABLED=false` — backward compatible, существующий код не ломается.

## Рассмотренные альтернативы

### Оставить fire-and-forget (без очереди)

Минус: потеря алертов при недоступности MAX. Заказчик подтвердил: потеря недопустима. Отклонено.

### In-memory queue (без persistence)

Минус: при рестарте pending сообщения потеряны. at-most-once — то, от чего уходим. Отклонено.

### External broker (Redis/RabbitMQ)

Минус: избыточно для одной ноды, добавляет operational complexity. Отклонено.

### Exactly-once через transactional outbox

Минус: требует two-phase commit или CDC, нетривиально для SQLite. at-least-once + dedup достаточно. Отклонено.

### Очередь только для Zabbix, не для всех источников

Минус: guarantee должен быть на transport-level, а не per-source. Отклонено.
