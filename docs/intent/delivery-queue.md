# Intent: Очередь доставки сообщений для multi-source ingest

## Дата

2026-07-17

## Источник

Интервью с заказчиком. Подтверждено: explicit "да".

## Statement

- **Outcome:** at-least-once доставка уведомлений для всех источников через очередь в SQLite
- **User:** оператор, которому потеря алертов недопустима
- **Why now:** проектируем multi-source ingest, нужно зафиксировать архитектуру до реализации
- **Success:** MAX лежит 5 минут, алерты доставляются после восстановления, ни один не потерян
- **Constraint:** один runtime (ADR-0009), SQLite (ADR-0025), stdlib + better-sqlite3
- **Out of scope:** внешние брокеры (Redis/RabbitMQ), distributed queue, priority queue, exactly-once, UI для мониторинга

## Ключевые решения

1. Потеря алертов **недопустима**. Задержка доставки **допустима**.
2. Очередь — **transport-level guarantee**, не per-source feature. Для всех источников.
3. Очередь входит в **MVP** multi-source ingest.
4. at-most-once (текущий outbound-client) **неприемлем** для multi-source ingest.
5. at-least-once + idempotency_key для dedup — приемлемый баланс.

## Следующие шаги

1. ADR на очередь доставки (новый ADR)
2. Расширение схемы SQLite (delivery_queue table)
3. Queue store модуль (enqueue/dequeue/ack/nack)
4. Worker модуль (setInterval polling)
5. Интеграция с live-pipeline (replace outboundClient.send → queue.enqueue)
6. Тесты
