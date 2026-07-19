# ADR-0030: Ввести outbound rate limiter для защиты от 429 MAX API

## Статус

Принято.

## Дата

2026-07-19

## Контекст

ADR-0028 вводит очередь доставки сообщений. ADR-0029 вводит lifecycle audit trail. Outbound-client (`src/bot-platform/transports/max/outbound-client.js`) делает `httpClient.post(request)` для отправки в MAX Bot API без ограничения частоты.

Live verification 2026-07-19: при параллельной отправке 20 сообщений (batch) без rate limiter — 7 msg/sec, MAX API вернул 429 на 80+ сообщениях к одному получателю. При rate limiter (5 msg/sec per recipient) — 0 ошибок 429, все доставлено.

Проблема: при Zabbix storm (массовое срабатывание триггеров) outbound client отправляет сообщения без ограничений → MAX API возвращает 429 → temporary block на per-chat уровне → сообщения теряются или задерживаются.

## Решение

Ввести sliding window rate limiter как зависимость outbound client. Двухуровневый: global limit (все сообщения) + per-recipient limit (один user/chat).

### Алгоритм

Sliding window на основе массива timestamp'ов. При каждом `tryAcquire()`:

1. Вызвать `evictOld()` — удалить timestamp'ы старше `windowMs`
2. Проверить global limit — если `globalTimestamps.length >= globalLimit`, вычислить `waitMs` до истечения самого старого timestamp
3. Проверить recipient limit — если `bucket.length >= recipientLimit`, вычислить `waitMs`
4. Если оба лимита пройдены — добавить timestamp и вернуть `allowed: true`

### API

```javascript
const limiter = createRateLimiter({
  globalLimit: 25,        // max requests per window (all recipients)
  recipientLimit: 5,      // max requests per window (one recipient)
  windowMs: 1000,         // sliding window size
  maxWaitMs: 5000,        // max wait before RATE_LIMIT_TIMEOUT (default: windowMs * 5)
  logger,                 // injectable logger
  now                      // injectable clock (for testing)
});

// Synchronous check (no blocking)
const result = limiter.tryAcquire('user_id:123');
// { allowed: true, waitMs: 0, reason: null }
// { allowed: false, waitMs: 350, reason: 'recipient' }

// Blocking acquire (waits until slot opens or timeout)
await limiter.acquire('user_id:123');

// Stats for monitoring
limiter.stats();
// { globalCount: 3, globalLimit: 25, recipientLimit: 5, windowMs: 1000, recipients: { 'user_id:123': 3 } }

// Reset (for testing)
limiter.reset();
```

### Timeout

`acquire()` блокируется через `await sleep(waitMs)` до открытия слота. Если время ожидания превышает `maxWaitMs` — выбрасывается ошибка:

```javascript
error.code = 'RATE_LIMIT_TIMEOUT';
error.details = { key, reason, wait_ms, max_wait_ms };
```

Ошибка проходит через outbound client без нормализации (`normalizeMaxApiError` не конвертирует в `MAX_API_ERROR`). Queue worker nack'ает сообщение для retry с exponential backoff.

### Интеграция с outbound client

Rate limiter вызывается **внутри** try/catch в `outboundClient.send()`:

```text
send()
  ├── buildMaxOutboundPayload(response)
  ├── if (!networkEnabled) → return dry-run
  └── try {
        rateLimiter.acquire(recipientKey)   // ← blocking, may throw RATE_LIMIT_TIMEOUT
        buildMaxOutboundRequest(...)
        httpClient.post(request)
        normalizeHttpResponse(...)
      } catch (error) {
        if (error.code === 'RATE_LIMIT_TIMEOUT') throw error;  // ← pass through
        throw normalizeMaxApiError(error);
      }
```

Recipient key: `${payload.recipientType}:${payload.to}` (например, `user_id:219338126`).

### Интеграция с queue worker

Queue worker обрабатывает batch последовательно (`for (const item of batch)`). Каждый `send()` блокируется rate limiter'ом при превышении лимита. Это означает:

- Batch из 10 сообщений одному получателю при `recipientLimit=5`: первые 5 проходят, следующие 5 блокируются на ~1с каждая
- Общее время batch: ~5 секунд
- throughput = batchSize / (batchSize * windowMs) при насыщении

Это intended behavior — rate limiter защищает MAX API от перегрузки.

### Очистка пустых bucket'ов

`recipientTimestamps` Map создаёт bucket для каждого уникального recipient key. Пустые bucket'ы (после eviction) удаляются в `stats()`. В normal operation `stats()` не вызывается — bucket'ы накапливаются. Для Zabbix alert bot (bounded set recipients) это пренебрежимо мало.

### Конфигурация

```text
RATE_LIMIT_ENABLED=true              # default: true (включено по умолчанию)
RATE_LIMIT_GLOBAL=25                 # global requests per window
RATE_LIMIT_RECIPIENT=5               # per-recipient requests per window
```

### Dry-run mode

При `networkEnabled=false` (dry-run) rate limiter не используется — `outboundClient.send()` возвращает dry-run payload напрямую. Rate limiter — live-only feature.

### Логирование

Throttle events логируются через `logger.info()`:

```text
[info] [rate-limiter] throttled {"key":"user_id:219338126","reason":"recipient","wait_ms":999}
```

### Тесты

- `tests/bot-platform/rate-limiter.test.js` — 18 tests (tryAcquire, acquire, stats, reset, sliding window, timeout, defaults)
- `tests/bot-platform/max-outbound-client.test.js` — 2 integration tests (rate limiter called before send, timeout propagation)

## Почему sliding window, а не token bucket

- Token bucket требует более сложную логику (tokens + refill rate)
- Sliding window проще для понимания и отладки
- При volume Zabbix alerts (десятки/сотни в минуту) sliding window достаточен
- Token bucket был бы избыточен для текущего scale

## Почему не fixed window

- Fixed window имеет burst problem: 2 запроса в конце окна + 2 в начале = 4 за 1с при лимите 3/sec
- Sliding window spreading более равномерный
- Простая реализация через eviction timestamp'ов

## Почему не внешний rate limiter (Redis)

- ADR-0015: нулевые внешние зависимости
- ADR-0009: один runtime, меньше операционных сущностей
- Для одной ноды с bounded recipients in-memory sufficient
- Redis добавляет operational complexity без benefit

## ПочемуRATE_LIMIT_ENABLED=true по умолчанию

- Защита от случайных 429 при Zabbix storm
- Rate limiter не ломает существующий behavior при normal load (25 global + 5 per-recipient достаточно для typical alert volume)
- Отключение через `RATE_LIMIT_ENABLED=false` при необходимости
- Альтернатива (default false) опаснее: deployments могут не заметить и остаться без защиты

## Почему maxWaitMs = windowMs * 5

- Гарантирует хотя бы один полный window cycle ожидания
- При default windowMs=1000: maxWaitMs=5000 (5 секунд)
- Достаточно для recovery от temporary burst
- Не слишком долго для queue worker (batch из 10 = максимум 50 секунд при полном насыщении)

## Рассмотренные альтернативы

### Token bucket

Минус: более сложная реализация, избыточна для текущего volume. Отклонено.

### Fixed window

Минус: burst problem на границах окна. Sliding window проще и равномернее. Отклонено.

### Внешний rate limiter (Redis)

Минус: нарушает ADR-0015 (zero deps), ADR-0009 (один runtime). Избыточно для одной ноды. Отклонено.

### Без rate limiting

Минус: 429 от MAX API → temporary block → потеря сообщений. Заказчик подтвердил: потеря недопустима. Отклонено.

### Rate limiting только на queue worker level

Минус: outbound client — единственный point of contact с MAX API. Rate limiting на уровне outbound client проще и надёжнее. Отклонено.

## Последствия

- Новый модуль: `src/bot-platform/core/rate-limiter.js`
- Изменения в `src/bot-platform/transports/max/outbound-client.js`: `rateLimiter.acquire()` внутри try/catch, pass through `RATE_LIMIT_TIMEOUT`
- Изменения в `src/bot-platform/app.js`: создание rate limiter из config, передача в outbound client
- Изменения в `src/bot-platform/core/config.js`: `RATE_LIMIT_ENABLED`, `RATE_LIMIT_GLOBAL`, `RATE_LIMIT_RECIPIENT`
- `examples/bot-platform/env.example`: добавлены `RATE_LIMIT_*` переменные
- Новые тесты: 18 unit tests (rate-limiter) + 2 integration tests (outbound-client)
- Default `RATE_LIMIT_ENABLED=true` — backward compatible при normal load, но изменения behavior при burst ( throttling вместо direct send)

## Реализовано

Sprint 18 (2026-07-19):

| Модуль | Изменение |
|--------|-----------|
| `core/rate-limiter.js` | Новый модуль: sliding window, two-level rate limiter |
| `transports/max/outbound-client.js` | `rateLimiter.acquire()` внутри try/catch, `RATE_LIMIT_TIMEOUT` pass through |
| `app.js` | Создание rate limiter из config, передача в outbound client |
| `core/config.js` | `RATE_LIMIT_ENABLED`, `RATE_LIMIT_GLOBAL`, `RATE_LIMIT_RECIPIENT` env vars |
| `examples/bot-platform/env.example` | Добавлены `RATE_LIMIT_*` переменные |
| `tests/bot-platform/rate-limiter.test.js` | 18 tests |
| `tests/bot-platform/max-outbound-client.test.js` | 2 integration tests |

Тесты: 340 tests passing.
