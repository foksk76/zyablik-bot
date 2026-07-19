# ADR-0009: Разместить long polling loop в runtime entrypoint bot-platform

## Статус

Принято.

## Дата

2026-07-08

## Контекст

Task 14.1 добавляет safe test bot в текущий outbound-only LXC. Runtime использует `long_polling` для разработки и тестирования, `webhook` остаётся отдельным ingress-only путём для production.

Ключевой архитектурный вопрос: где должен находиться long-polling loop:

- в существующем runtime entrypoint bot-platform;
- или в отдельном adapter/process boundary.

Текущий кодовая база уже имеет единый runtime entrypoint и transport-mode switch. Добавление второго runtime boundary для long polling вводит ненужное разделение процессов и зависимостей для режима, который не требует inbound ingress.

## Решение

Разместить long-polling loop в существующем runtime entrypoint path, не в отдельном adapter-процессе.

Реализация может разделять внутреннюю логику на helper-модули или runner-модули, но операционная граница остаётся одним runtime bot-platform, который выбирает `long_polling` или `webhook` из конфигурации.

## Минимальный Runtime Flow

Для `Task 14.1` минимальный live flow:

1. Считать `MAX_TRANSPORT_MODE` из окружения.
2. Запустить текущий entrypoint в режиме `long_polling`.
3. Получать MAX updates через outbound polling.
4. Нормализовать payload через `normalizeMaxEvent()`.
5. Маршрутизировать internal event через `pipeline-dispatch.js` (ADR-0018 заменил `event-router.js`).
6. Обработать event через identity plugin.
7. Сформировать outbound payload.
8. Сохранять flow в одном процессе, не вводить отдельный polling adapter или process boundary.

## Рассмотренные альтернативы

### Отдельный long-polling adapter/process

Плюсы: изоляция transport-specific логики.

Минусы: добавляет runtime boundary, больше wiring, второе место для выбора режима.

Решение: отклонено — ненужная сложность для safe test-bot path.

### Отдельный сервис под long polling

Плюсы: сильная изоляция.

Минусы: дублирует lifecycle management, фрагментирует модель runtime.

Решение: отклонено — bot-platform уже имеет общий entrypoint и чёткий mode switch.

## Последствия

- `Task 14.1` должен расширять существующий runtime path вместо создания нового adapter layer.
- `systemd` может управлять одним сервисом для safe test bot.
- `webhook` остаётся отдельным ingress concern и не наследует long-polling loop boundary.
- Будущий рефакторинг может извлекать helper-модули, но не второй runtime/process boundary без нового ADR.
