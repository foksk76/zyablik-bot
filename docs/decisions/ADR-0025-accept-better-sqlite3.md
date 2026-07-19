# ADR-0025: Принять `better-sqlite3` как исключение из ADR-0015

## Статус

Принято.

## Дата

2026-07-17

## Контекст

ADR-0015 устанавливает нулевые внешние зависимости. Multi-source ingest (ADR-0022) требует delivery-log — неизменяемый журнал исходящих событий и результатов доставки.

Альтернативы:

- **JSONL** — простой файл, но нет индексации, нет транзакций, нет удобного запроса по диапазонам дат;
- **SQLite** — индексация, транзакции, стандартный SQL, встроен в большинство runtime;
- **better-sqlite3** — native-биндинг к SQLite для Node.js, синхронный API.

## Решение

Принять `better-sqlite3` как native-биндинг для delivery-log в слое `LogStore`.

### Библиотека

- Пакет: `better-sqlite3` (npm)
- Тип: native-биндинг (node-gyp, prebuild binaries)
- API: синхронный (blocking)

### Граница исключения

Исключение ограничено **слоем `LogStore`**:

- Абстракция `LogStore` обязательна — определяет интерфейс (`logDelivery()`, `queryDeliveries()`, и т.д.);
- `better-sqlite3` — единственная реализация `LogStore` в MVP;
- Будущая замена на другую БД — через реализацию `LogStore` без изменения вызывающего кода;
- Остальная кодовая база bot-platform остаётся zero-dep (ADR-0015).

### Характеристики delivery-log

- Запись: исходящее событие + результат `POST /messages` (HTTP-код, latency, retries-count);
- Объём: тысячи записей в день (SQLite деградирует на миллионах — нецелевой кейс);
- Не персистится на диск в MVP (in-memory), персистентный кэш — будущий hardening.

### connection-log и audit-trail

Не подводятся под `LogStore`. Остаются на syslog:

- **connection-log** — каждая попытка входящего запроса, однострочный текст;
- **audit-trail** — неизменяемый журнал ключевых операций, однострочный текст.

Причина: syslog — стандартный mechanism для structured logging, не требует additional dependencies, легко интегрируется с существующей infrastructure (journald, rsyslog).

### Синхронный API и event loop

`better-sqlite3` использует синхронный API. В async HTTP-сервере это блокирует event loop на время записи. Для MVP (тысячи записей в день, одна операция записи) — acceptable:

- Одна запись = единичный INSERT (~μs для SQLite);
- Нет batch-операций в hot path;
- При росте объёма — перейти на async `better-sqlite3` API (pragmas) или заменить `LogStore` реализацию.

## Почему `better-sqlite3`, а не `sql.js` (WASM)

- `better-sqlite3` — нативный биндинг, быстрее для read/write;
- `sql.js` — WASM, тяжелее, требует initial load;
- Для server-side Node.js native биндинг предпочтительнее;
- `better-sqlite3` активно поддерживается, используется в production widely.

## Почему не JSONL

- Нет индексации (поиск по диапазону дат = полный scan);
- Нет транзакций (конкурентная запись = corrupted records);
- Нет удобного query-языка;
- При росте объёма — проблемы с производительностью.

## Почему не отдельная БД (PostgreSQL, и т.д.)

- Избыточно для одной ноды с тысячами записей в день;
- Требует отдельный сервис, конфигурацию, backup;
- ADR-0009 фиксирует «один runtime, меньше операционных сущностей»;
- Абстракция `LogStore` позволяет заменить при необходимости.

## Последствия

- `package.json` получает `dependencies: { "better-sqlite3": "^x.x" }`;
- `npm install` требует compilation step (node-gyp) или prebuild binaries;
- CI должен тестировать на целевой платформе (Node 22);
- `LogStore` абстракция обязательна — нельзя писать SQL в вызывающем коде;
- supply-chain attack surface расширяется на one native package (acceptable trade-off).

## Рассмотренные альтернативы

### JSONL (JSON Lines)

Минус: нет индексации, нет транзакций, нет query-языка. Отклонено.

### `sql.js` (WASM SQLite)

Минус: тяжелее для server-side, initial WASM load overhead. Отклонено в пользу нативного биндинга.

### PostgreSQL / отдельная БД

Минус: избыточно для одной ноды, отдельный сервис, нарушение ADR-0009. Отклонено.

### In-memory Map (без persistence)

Минус: нет журнала доставки после restart. delivery-log = ключевая requirement multi-source ingest. Отклонено.
