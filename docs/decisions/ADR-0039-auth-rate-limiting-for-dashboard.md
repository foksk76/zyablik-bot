# ADR-0039: Rate limiting для auth-эндпоинтов dashboard

## Статус

Принято.

## Дата

2026-07-23

## Контекст

ADR-0034 вводит OAuth2/OIDC-auth для queue-monitor dashboard.
ADR-0035 добавляет session auth как альтернативу Bearer Token.

Auth-эндпоинты (`/api/auth/login`, `/api/auth/callback`) принимают
входящие запросы от браузеров. OAuth2 callback делает исходящие
fetch к IdP (token + userinfo) — это дорогие операции, которые
могут зависнуть при проблемах с IdP.

Без rate limiting:
- brute-force на login endpoint;
- flooding callback'ами — исходящие соединения к IdP исчерпываются;
- DoS через множество параллельных OAuth2 flows.

ADR-0030 вводит rate limiter для **outbound** запросов к MAX Bot API.
Auth rate limiting — **inbound** защита, отдельная задача.

## Решение

Ввести модуль `src/queue-monitor/api/auth-rate-limit.js` с двумя
механизмами защиты.

### M2-A: Sliding window на auth-запросы

Глобальный sliding window (не per-IP — для 1 оператора per-IP избыточен):

```text
DEFAULT_MAX_AUTH_REQUESTS = 20   // максимальное число запросов
DEFAULT_WINDOW_MS = 60_000       // за 60 секунд
```

Non-blocking: `tryAcquireAuthRequest()` синхронно возвращает
`{ allowed, reason, waitMs }`. Caller возвращает 429 при отказе.

Алгоритм зеркалит `src/bot-platform/core/rate-limiter.js` (ADR-0030),
но упрощён до одного bucket'а.

### M2-C: Concurrency cap на OAuth2 callbacks

Ограничение числа одновременно идущих callback'ов:

```text
DEFAULT_MAX_CONCURRENT_CALLBACKS = 5
```

Callback делает исходящие fetch к IdP (token + userinfo) и может
висеть. Без cap атакующий открывает сотни параллельных соединений.

```text
tryAcquireCallback() → { allowed }
releaseCallback()    — вызывать в finally (даже при ошибке IdP)
```

### API

```text
createAuthRateLimiter(options) → {
  tryAcquireAuthRequest,   // → { allowed, reason, waitMs }
  tryAcquireCallback,      // → { allowed, reason }
  releaseCallback,         // → void (вызывать в finally)
  stats,                   // → { authRequests, inFlightCallbacks, ... }
  reset                    // → void (для тестов)
}

options.maxAuthRequests       — default: 20
options.windowMs              — default: 60_000
options.maxConcurrentCallbacks — default: 5
options.now                   — injectable (для тестов)
```

### Интеграция

```text
/api/auth/login     → tryAcquireAuthRequest() → 429 при отказе
/api/auth/callback  → tryAcquireAuthRequest() + tryAcquireCallback()
                    → finally { releaseCallback() }
```

## Рассмотренные альтернативы

### Per-IP rate limiting

Минус: для 1 оператора per-IP избыточно. Если операторов станет
больше — revisit. Отклонено.

### Использовать ADR-0030 rate limiter напрямую

Минус: ADR-0030 — outbound rate limiter с blocking acquire (await sleep).
Auth rate limiter должен быть non-blocking ( synchronous tryAcquire)
чтобы не вешать event loop. Отклонено.

### Concurrency cap через semaphore

Минус: для 5 слотов простой счётчик + try/release проще, чем semaphore.
Отклонено.

## Последствия

### Новые файлы

```text
src/queue-monitor/api/auth-rate-limit.js   — auth rate limiter (114 строк)
```

### Изменённые файлы

```text
src/queue-monitor/api/auth-routes.js      — интеграция tryAcquire/release
src/queue-monitor/http-server.js          — интеграция rate limiter в auth routes
```

### Не затронуто

- root `package.json` — без изменений;
- `src/bot-platform/` — без изменений;
- ADR-0030 outbound rate limiter — без изменений;
- ADR-0015 policy-test — без изменений.

### Ожидаемый результат

- brute-force на login → 429 после 20 запросов/мин;
- flooding callback'ами → 429 при 5 одновременных;
- `releaseCallback()` вызывается в finally (нет зависших слотов);
- `stats()` возвращает текущее состояние для /readyz.

## Ссылки

- [ADR-0034](ADR-0034-queue-monitor-dashboard.md) — Queue Monitor Dashboard, OAuth2 auth
- [ADR-0035](ADR-0035-session-auth-for-dashboard-metrics.md) — session auth
- [ADR-0030](ADR-0030-outbound-rate-limiter.md) — outbound rate limiter (отличается: inbound, non-blocking)
- [ADR-0015](ADR-0015-zero-external-dependencies.md) — нулевые внешние зависимости
