# Sprint 23 — Queue Monitor Hardening: rate limiting и SSRF-защита

**Цель:** закрыть две находки security-and-hardening ревью ветки
`feature/queue-monitor-dashboard` (M2 и L3):

1. **M2 — Rate limiting на `/api/auth/login` и `/api/auth/callback`.**
   Callback делает исходящие запросы к IdP (`/token` + `/userinfo`).
   Любой неавторизованный visitor может гонять процесс как прокси к IdP —
   DoS-усиление и нагрузка на IdP. Защита в первую очередь на callback.

2. **L3 — SSRF-защита на `IDP_ISSUER`.** `fetchFn` резолвит любой URL
   без проверки IP-диапазона. Усугубляющий фактор: `discoverEndpoints`
   имеет fallback на конвенции (`/authorize`, `/token`, `/userinfo`) —
   даже без валидного discovery трафик уходит на attacker-controlled issuer.
   issuer контролируется оператором (Low), но при ошибке/компрометации env →
   SSRF к internal (`169.254.169.254` = cloud metadata, RFC1918, loopback).

**Контекст:** M1 (отрицательный limit) уже исправлен в коммите `c730657`.
L4 (тело ответа IdP в логах) оставлено как есть — покрывается ADR-0032.
500 тестов passing на старте спринта. Цель — 530+ после реализации.

**Согласованные параметры** (из answers к open questions):
- Rate limits: **20 req/60s + 5 concurrent** (MVP для 1 оператора)
- SSRF-логирование: **hostname + IP на debug уровне** (IP не в warn/error,
  только через injectable debug-handler)

## Architecture Decisions

Выбранные варианты (из анализа, согласованного с пользователем):

- **M2-A: Глобальный sliding window на `/api/auth/*`, non-blocking.**
  Переиспользовать алгоритм `createRateLimiter` (ADR-0030, модуль
  `src/bot-platform/core/rate-limiter.js`), но вызывать `tryAcquire()` (не
  `acquire()` — blocking недопустим на HTTP-запросе: повесит event loop
  под нагрузкой вместо fail-fast). При превышении → 429.
- **M2-C: Concurrency cap на in-flight callback'и.** Дополнение к M2-A:
  ограничивает число одновременно идущих callback'ов (которые держат
  исходящие соединения к IdP). Счётчик `inFlight++` / `inFlight--` в
  `finally`, при `> MAX` → 429.
- **L3-A: Scheme + private-IP проверка на stdlib (`node:dns/promises`).**
  Резолвить hostname, проверять все A/AAAA: ни один не должен быть
  loopback/private/link-local/unique-local. Только `https:`.
- **L3-C: Убрать fallback на конвенции при невалидном discovery** (опционально
  через env `IDP_REQUIRE_DISCOVERY`, default `false` — обратная совместимость).

### Что НЕ делается в этом спринте (явные границы)

- **M2-B (per-IP через X-Forwarded-For)** — отложен. Сейчас 1 оператор,
  доступ через OAuth2; per-IP добавляет конфигурационную поверхность
  (`TRUSTED_PROXY` env, риск XFF-spoofing misconfig) без пропорциональной
  выгоды. Возвращаемся при multi-operator / public deployment.
- **L3-B (hostname allowlist)** — слабее L3-A (не ловит DNS rebinding),
  добавляет env. Отклонено.
- **L3-D (новая зависимость `ipaddr.js` через ADR-0036)** — overkill для
  Low-риска, тянет ADR + изменение policy-теста `tests/repo-structure.test.js`.
  Отклонено.
- **TOCTOU gap** в L3-A — принимается как known limitation (см. Risks).
  Для full mitigation нужен filtering-agent или pin-to-IP — существенно
  сложнее, не оправдано для MVP.

### Related ADRs

| ADR | Constraint | Where it applies |
|-----|-----------|-----------------|
| ADR-0013 | Safe logger, secret redaction | Limiter логирует ключ/throttle без токенов |
| ADR-0015 | Нулевые внешние зависимости | Оба фикс-а на stdlib (`node:dns/promises`, `node:net`); новых пакетов нет |
| ADR-0023 | stdlib `http.createServer` | Rate-limit guard встраивается в существующий handler-контракт |
| ADR-0030 | Sliding window rate limiter | Переиспользуется алгоритм (`src/bot-platform/core/rate-limiter.js`) |
| ADR-0034 | Queue Monitor Dashboard | Целевой модуль `src/queue-monitor/` |
| ADR-0035 | Session auth для dashboard | Auth-routes — точка интеграции M2 |

### Policy test

`tests/repo-structure.test.js:104` требует, чтобы runtime-зависимости
в root `package.json` входили в `Set(['better-sqlite3', '@okta/jwt-verifier'])`.
Спринт **не добавляет зависимостей** — policy-тест остаётся зелёным без
изменений.

### Dependency Graph

```
Phase 1 (M2): rate limiting
    │
    ├── src/queue-monitor/api/auth-rate-limit.js  (новый — sliding window + concurrency)
    │       │
    │       └── src/queue-monitor/api/auth-routes.js  (guard в login/callback)
    │               │
    │               └── src/queue-monitor/index.js  (wiring)
    │
    └── tests/queue-monitor/api/auth-rate-limit.test.js  (новый)

Phase 2 (L3): SSRF-защита
    │
    ├── src/queue-monitor/auth/url-safety.js  (новый — private-IP check)
    │       │
    │       └── src/queue-monitor/auth/oidc.js  (validate перед fetch)
    │
    └── tests/queue-monitor/auth/url-safety.test.js  (новый)
```

Фазы независимы — могут выполняться параллельно разными агентами.
Рекомендуемый порядок: Phase 1 → Phase 2 (rate limiting закрывает более
активно эксплуатируемую поверхность; SSRF требует operator error).

## Tasks

### Task 1: Модуль auth-rate-limit — sliding window + concurrency cap

**Status:** Done

**Description:** Создать `src/queue-monitor/api/auth-rate-limit.js` —
factory, комбинирующий (M2-A) глобальный sliding-window лимит на запросы
к `/api/auth/*` и (M2-C) cap на число одновременно идущих callback'ов.
Алгоритм sliding window зеркалирует `src/bot-platform/core/rate-limiter.js`
(ADR-0030), но без blocking-режима `acquire()` — только `tryAcquire()`.

**Acceptance criteria:**
- [ ] `createAuthRateLimiter(options)` — factory function
- [ ] `options.maxAuthRequests` (int, default `20`) — лимит запросов на окно
- [ ] `options.windowMs` (int, default `60_000`) — размер sliding window (60с)
- [ ] `options.maxConcurrentCallbacks` (int, default `5`) — cap in-flight callback'ов
- [ ] `options.now` (injectable clock, для тестов)
- [ ] `tryAcquireAuthRequest()` → `{ allowed: boolean, reason: 'rate-limit' | null }`
  (синхронно, non-blocking — для login + callback)
- [ ] `tryAcquireCallback()` → `{ allowed: boolean, reason: 'concurrency' | null }`
  (синхронно — отдельный счётчик для дорогих callback'ов)
- [ ] `releaseCallback()` — декремент in-flight счётчика (вызывать в `finally`)
- [ ] `stats()` → `{ authRequests: N, inFlightCallbacks: N }` (для /readyz/логов)
- [ ] Sliding window eviction (как в ADR-0030): `shift()` timestamp'ов старше windowMs

**Verification:**
- [ ] `node --test tests/queue-monitor/api/auth-rate-limit.test.js` — тесты проходят
- [ ] Тесты покрывают: window eviction, лимит срабатывает на N+1, concurrency
      блокирует на N+1, releaseCallback освобождает слот, injectable clock
- [ ] `npm test` — без регрессий

**Dependencies:** None

**Files likely touched:**
- `src/queue-monitor/api/auth-rate-limit.js` (новый)
- `tests/queue-monitor/api/auth-rate-limit.test.js` (новый)

**Estimated scope:** M (2 файла, ~80 строк кода + ~150 строк тестов)

---

### Task 2: Интеграция rate limit guard в auth-routes

**Status:** Done

**Description:** Встроить rate limiter в `login()` и `callback()` в
`src/queue-monitor/api/auth-routes.js`. `login()` — только sliding-window
check (дёшево). `callback()` — sliding-window + concurrency cap с
обязательным `releaseCallback()` в `finally` (callback делает исходящие
запросы к IdP, может висеть). При отказе → 429 Too Many Requests с
`Retry-After` header.

**Acceptance criteria:**
- [ ] `createAuthRoutes(options)` принимает опциональный `options.rateLimiter`
- [ ] Если `rateLimiter` не передан — auth-routes работают как раньше (обратная совместимость, bearer-only / test scenarios)
- [ ] `login()`: вызывает `tryAcquireAuthRequest()`; при `allowed: false` →
      `{ statusCode: 429, headers: { 'Retry-After': '60' }, body: { error: 'Too Many Requests' } }`
- [ ] `callback()`: вызывает `tryAcquireAuthRequest()` И `tryAcquireCallback()`;
      при отказе → 429; **обязательно** `releaseCallback()` в `finally` (даже при ошибке IdP)
- [ ] `logout()` и `session()` — без rate limit (дёшево, session уже authenticated)
- [ ] 429 не логирует токены (только ключ/throttle reason — ADR-0013)

**Verification:**
- [ ] `node --test tests/queue-monitor/auth-routes.test.js` — тесты проходят
- [ ] Новые тесты: login 429 при превышении, callback 429 при превышении rate,
      callback 429 при превышении concurrency, releaseCallback вызывается при ошибке IdP
- [ ] `npm test` — без регрессий

**Dependencies:** Task 1

**Files likely touched:**
- `src/queue-monitor/api/auth-routes.js` (модификация)
- `tests/queue-monitor/auth-routes.test.js` (модификация)

**Estimated scope:** S (2 файла)

---

### Task 3: Wiring rate limiter в index.js + env config

**Status:** Done

**Description:** Создавать `authRateLimiter` в `src/queue-monitor/index.js`
когда `authEnabled === true` (OAuth2 включён) и передавать в `createAuthRoutes()`.
Добавить ENV vars в `src/queue-monitor/config.js`. Rate limiting имеет смысл
только при включённом OAuth2 (без него login/callback маршруты не регистрируются).

**Acceptance criteria:**
- [ ] `src/queue-monitor/config.js`: `AUTH_RATE_LIMIT` (bool, default `true`),
      `AUTH_RATE_LIMIT_MAX` (int, default `20`), `AUTH_RATE_LIMIT_WINDOW_MS`
      (int, default `60_000`), `AUTH_RATE_CONCURRENCY` (int, default `5`)
- [ ] `createQueueMonitorConfig(environment)` возвращает эти поля
- [ ] `index.js`: создаёт `rateLimiter` через `createAuthRateLimiter(config...)`
      при `authEnabled`, передаёт в `createAuthRoutes`
- [ ] Если `AUTH_RATE_LIMIT=false` — `rateLimiter` не создаётся, auth-routes
      работают без guard (обратная совместимость)
- [ ] `examples/bot-platform/env.example`: задокументировать новые ENV vars
- [ ] `INSTALL.md`: упомянуть rate-limit vars в секции queue-monitor config

**Verification:**
- [ ] `node --test tests/queue-monitor/config.test.js` — новые env vars парсятся
- [ ] `node --test tests/queue-monitor/index.test.js` — wiring корректный
      (limiter передаётся при authEnabled, отсутствует при AUTH_RATE_LIMIT=false)
- [ ] `npm test` — без регрессий

**Dependencies:** Task 1, Task 2

**Files likely touched:**
- `src/queue-monitor/config.js` (модификация)
- `src/queue-monitor/index.js` (модификация)
- `tests/queue-monitor/config.test.js` (модификация)
- `tests/queue-monitor/index.test.js` (модификация)
- `examples/bot-platform/env.example` (модификация)
- `INSTALL.md` (модификация)

**Estimated scope:** M (6 файлов, мелкие правки)

---

### Checkpoint: Phase 1 (M2) complete

- [x] `npm test` — без регрессий (527 tests passing)
- [ ] Ручная проверка: 21-й запрос к `/api/auth/login` в течение 60с → 429
- [ ] Ручная проверка: 6-й параллельный callback → 429 (имитировать медленный IdP)
- [x] Phase 2 выполнена в той же ветке без ожидания review

---

### Task 4: Модуль url-safety — private-IP и scheme проверка

**Status:** Done

**Description:** Создать `src/queue-monitor/auth/url-safety.js` — функцию
`assertSafeUrl(rawUrl)`, резолвящую hostname через `node:dns/promises`
`lookup({ all: true })` и отклоняющую любой private/reserved/loopback/
link-local адрес. Покрывает IPv4 и IPv6. Только `https:` scheme.

**Acceptance criteria:**
- [ ] `assertSafeUrl(rawUrl)` → Promise<void> (бросает `Error` с понятным сообщением при нарушении)
- [ ] Scheme check: отклоняет всё, кроме `https:` (`http:`, `file:`, `ftp:` и т.д.)
- [ ] IPv4 ranges (отклоняются): `127.0.0.0/8` (loopback), `10.0.0.0/8`,
      `172.16.0.0/12`, `192.168.0.0/16` (private), `169.254.0.0/16`
      (link-local — cloud metadata `169.254.169.254`), `0.0.0.0/8`,
      `100.64.0.0/10` (CGNAT), `224.0.0.0/4` (multicast)
- [ ] IPv6 ranges (отклоняются): `::1/128` (loopback), `fc00::/7` (unique-local),
      `fe80::/10` (link-local), `::ffff:0:0/96` (IPv4-mapped — проверять
      embedded IPv4 по тем же правилам)
- [ ] Проверяет ВСЕ A/AAAA records (не только первый) — любой private → отказ
- [ ] Ошибка/thrown message: только reason + hostname (минимизация info disclosure).
      Resolved IP **логируется только на debug-уровне** через injectable
      `options.onDebug(info)` callback (hostname + reason в warn/error,
      IP — только в debug). См. согласованный параметр в начале спринта.
- [ ] `options.dnsLookup` (injectable, для тестов — mock resolver)
- [ ] `options.onDebug` (injectable, для логирования IP на debug-уровне)
- [ ] Экспортирует `isPrivateIPv4(ip)`, `isPrivateIPv6(ip)`, `assertSafeUrl`

**Verification:**
- [ ] `node --test tests/queue-monitor/auth/url-safety.test.js` — тесты проходят
- [ ] Тесты покрывают: каждый IPv4 range (по репрезентативному IP),
      каждый IPv6 range, IPv4-mapped IPv6, multiple A records (один private → отказ),
      https-only, injectable resolver для детерминизма
- [ ] `npm test` — без регрессий

**Dependencies:** None (фаза 2 независима от фазы 1)

**Files likely touched:**
- `src/queue-monitor/auth/url-safety.js` (новый)
- `tests/queue-monitor/auth/url-safety.test.js` (новый)

**Estimated scope:** M (2 файла, ~120 строк кода + ~200 строк тестов)

---

### Task 5: Интеграция assertSafeUrl в oidc.js

**Status:** Done

**Description:** Вызывать `assertSafeUrl()` перед каждым `fetchFn` в
`src/queue-monitor/auth/oidc.js`: в `discoverEndpoints` (на issuer URL)
и в `callback`/`getUserInfo` (на resolved endpoint URLs). При невалидном
URL — логировать warn (без IP в сообщении) и бросать ошибку.

**Acceptance criteria:**
- [ ] `discoverEndpoints`: `await assertSafeUrl(joinUrl(issuer, DISCOVERY_PATH))`
      перед fetch; при отказе — `logger.warn` (hostname + reason; IP только через
      `onDebug`) + fallback на конвенционные endpoints НЕ применяется
      (пробрасывается ошибка — см. Task 6)
- [ ] `callback`: `await assertSafeUrl(ep.tokenEndpoint)` перед POST
- [ ] `getUserInfo`: `await assertSafeUrl(ep.userinfoEndpoint)` перед GET
- [ ] Ошибка содержит только hostname + reason, не полный URL с query/path
- [ ] `createOidcClient(options)` принимает опциональные `options.dnsLookup`
      и `options.onDebug` (прокидываются в assertSafeUrl для тестов и debug-лога IP)
- [ ] Существующие тесты с mock fetch (`tests/queue-monitor/auth/oidc.test.js`)
      обновлены: mock resolver возвращает `203.0.113.1` (TEST-NET, безопасный)

**Verification:**
- [ ] `node --test tests/queue-monitor/auth/oidc.test.js` — тесты проходят
- [ ] Новые тесты: callback бросает при private tokenEndpoint,
      getUserInfo бросает при loopback userinfoEndpoint, discovery бросает
      при 169.254.169.254 issuer
- [ ] `npm test` — без регрессий

**Dependencies:** Task 4

**Files likely touched:**
- `src/queue-monitor/auth/oidc.js` (модификация)
- `tests/queue-monitor/auth/oidc.test.js` (модификация)

**Estimated scope:** S (2 файла)

---

### Task 6: Опциональный IDP_REQUIRE_DISCOVERY (убрать fallback на конвенции)

**Status:** Done

**Description:** По умолчанию `discoverEndpoints` fallback'ит на
`/authorize`, `/token`, `/userinfo` при невалидном/отсутствующем discovery.
Этот fallback — усугубляющий SSRF-фактор (attacker-controlled issuer работает
«из коробки»). Добавить env `IDP_REQUIRE_DISCOVERY` (default `false`):
при `true` невалидный discovery → ошибка запуска вместо fallback.

**Acceptance criteria:**
- [ ] `src/queue-monitor/config.js`: `idpRequireDiscovery` (bool, default `false`)
- [ ] `createOidcClient(options)` принимает `options.requireDiscovery` (bool)
- [ ] При `requireDiscovery=true`: `discoverEndpoints` при `!response.ok` или
      fetch error → бросает `Error` (вместо возврата fallback-объекта)
- [ ] При `requireDiscovery=false` (default): текущее поведение (fallback) —
      обратная совместимость
- [ ] `index.js`: прокидывает `requireDiscovery` в `createOidcClient`
- [ ] `examples/bot-platform/env.example` + `INSTALL.md`: задокументировать

**Verification:**
- [ ] Тесты: `requireDiscovery=true` + 500 от IdP → ошибка (не fallback);
      `requireDiscovery=false` + 500 → fallback (как раньше)
- [ ] `npm test` — без регрессий

**Dependencies:** Task 5

**Files likely touched:**
- `src/queue-monitor/auth/oidc.js` (модификация)
- `src/queue-monitor/config.js` (модификация)
- `src/queue-monitor/index.js` (модификация)
- `tests/queue-monitor/auth/oidc.test.js` (модификация)
- `tests/queue-monitor/config.test.js` (модификация)
- `examples/bot-platform/env.example` (модификация)
- `INSTALL.md` (модификация)

**Estimated scope:** M (7 файлов, мелкие правки)

---

### Checkpoint: Phase 2 (L3) complete

- [x] `npm test` — без регрессий (566 tests passing)
- [ ] Ручная проверка: `IDP_ISSUER=https://169.254.169.254` → запуск падает с ошибкой SSRF
- [ ] Ручная проверка: `IDP_REQUIRE_DISCOVERY=true` + невалидный discovery → запуск падает
- [x] Покрыто unit-тестами (assertSafeUrl + интеграция в oidc.js)

## Приёмочные критерии (Definition of Done)

- [x] `npm test` — все тесты проходят (566, цель 530+ — перевыполнено)
- [x] Policy-тест `tests/repo-structure.test.js` зелёный (нет новых runtime-зависимостей)
- [x] Rate limiting: 21-й запрос к `/api/auth/login` за 60с → 429 + `Retry-After` (покрыто тестом)
- [x] Concurrency cap: 6-й параллельный callback → 429 (покрыто тестом)
- [x] SSRF: private/loopback/link-local IP в `IDP_ISSUER` → отказ (покрыто тестом, 32 кейса диапазонов)
- [x] Обратная совместимость: `AUTH_RATE_LIMIT=false` и `IDP_REQUIRE_DISCOVERY=false` (defaults) сохраняют текущее поведение
- [x] Новые ENV vars задокументированы в `examples/bot-platform/env.example` и `INSTALL.md`
- [x] Safe logger: в логах rate-limit/SSRF-событий нет токенов/секретов
- [x] SSRF-логирование: hostname + reason на warn, resolved IP — только на debug
      (через `onDebug` injectable callback; не попадает в warn/error/journal)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| TOCTOU gap в L3-A: `fetch` ре-резолвит DNS после `assertSafeUrl`, короткий-TTL рекорд может rebind'нуть на internal IP между проверкой и коннектом | Medium | Принять как known limitation (зафиксировать в комментарии в `url-safety.js`). Для MVP/1-оператора приемлемо. Full mitigation (pin-to-IP или filtering-agent) — отдельный ADR при high-assurance need |
| Global rate limit (M2-A) позволяет атакующему вытеснить легитимного оператора | Low (MVP, 1 оператор) | Sliding window короткий (60с), лимит 20 — оператор не упрётся при нормальной работе. При multi-operator — вернуться к M2-B (per-IP) |
| IPv6 битовая арифметика диапазонов — легко ошибиться | Medium | Покрыть тестами каждый диапазон по репрезентативному IP (`::1`, `fc00::`, `fe80::`, IPv4-mapped). Сверить с RFC 4291 |
| Concurrency cap может уронить легитимный callback при медленном IdP | Low | Cap=5 достаточен для 1 оператора; `Retry-After` даёт клиенту сигнал. При устойчивом таймауте — оператор видит 429 и может поднять `AUTH_RATE_CONCURRENCY` |
| Убирание fallback (Task 6) ломает IdP без `.well-known` | Low | Опционально через env (default `false`). При включении — fail-fast, оператор видит ошибку запуска |

## Open Questions

_Все открытые вопросы решены и зафиксированы в секции «Согласованные
параметры» в начале спринта._

## Файлы для изменения (сводка)

```
# Phase 1 (M2) — rate limiting
src/queue-monitor/api/auth-rate-limit.js     (новый)
src/queue-monitor/api/auth-routes.js          (модификация — guard)
src/queue-monitor/config.js                   (модификация — env vars)
src/queue-monitor/index.js                    (модификация — wiring)
tests/queue-monitor/api/auth-rate-limit.test.js  (новый)
tests/queue-monitor/auth-routes.test.js       (модификация)
tests/queue-monitor/config.test.js            (модификация)
tests/queue-monitor/index.test.js             (модификация)

# Phase 2 (L3) — SSRF
src/queue-monitor/auth/url-safety.js          (новый)
src/queue-monitor/auth/oidc.js                (модификация — validate перед fetch)
src/queue-monitor/config.js                   (модификация — idpRequireDiscovery)
src/queue-monitor/index.js                    (модификация — wiring)
tests/queue-monitor/auth/url-safety.test.js   (новый)
tests/queue-monitor/auth/oidc.test.js         (модификация)

# Документация
examples/bot-platform/env.example             (модификация)
INSTALL.md                                    (модификация)
```

## Parallelization

Фазы 1 и 2 независимы (разные модули, `auth-rate-limit.js` vs `url-safety.js`).
Могут выполняться параллельно разными агентами/сессиями. Общая точка —
`config.js` и `index.js` (затрагиваются обеими фазами):Task 3 и Task 6
требуют координации (sequence или merge-конфликт разрешается вручную).
