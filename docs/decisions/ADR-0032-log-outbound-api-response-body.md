# ADR-0032: Логировать тело ответа внешних API в ошибках доставки

## Статус

Принято.

## Дата

2026-07-20

## Контекст

Queue worker (`src/bot-platform/queue/worker.js`) логирует ошибки доставки с помощью `error.message` ("MAX API request failed"). `error.details` — содержащий `statusCode`, `responseBody`, `causeCode`, `causeMessage`, `causeHost` — полностью отбрасывается.

Live verification 2026-07-20: при отправке на несуществующий `user_id=12345678` MAX API возвращает `404 {"code":"chat.not.found","message":"Chat with user 12345678 not found"}`. В логах bot-platform видно только:

```
[queue-worker] failed {"id":66,"reason":"MAX API request failed","attempts":1}
```

Для диагностики оператор вынужден делать прямой curl к MAX API или лезть в код outbound-client, чтобы получить причину.

ADR-0013 (safe logger) гарантирует автоматическую маскировку токенов/секретов в любом контексте, включая responseBody.

## Решение

Включить `error.details` в контекст логов `failed` и `send failed` в queue worker.

### Что попадает в лог

```json
{
  "id": 66,
  "reason": "MAX API request failed",
  "attempts": 1,
  "statusCode": 404,
  "responseBody": {"code": "chat.not.found", "message": "Chat with user 12345678 not found"}
}
```

При transport failure (DNS, timeout):

```json
{
  "id": 70,
  "reason": "MAX API request failed",
  "attempts": 1,
  "causeCode": "ENOTFOUND",
  "causeMessage": "getaddrinfo ENOTFOUND platform-api2.max.ru",
  "causeHost": "platform-api2.max.ru"
}
```

### Ограничения

- `error.details` добавляется как плоские поля контекста (spread), не как вложенный объект — совместимо с `formatLogLine()`.
- Без `error.details` (legacy ошибки) — поля отсутствуют, поведение не меняется.
- Safe logger (ADR-0013) маскирует любые токены/секреты в responseBody автоматически.

## Последствия

- Диагностика ошибок доставки ускоряется: оператор видит код и текст ответа MAX API сразу в journal.
- Объём логов незначительно увеличивается только для ошибок (не для success).
- Без изменений в архитектуре, API или границах проекта.
