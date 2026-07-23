# Sprint 25: Тесты для hand-rolled JWT-verifier (ADR-0038)

**Цель:** написать unit-тесты для `src/bot-platform/ingress/oidc-verifier.js` —
hand-rolled JWT-verifier для ingress layer. Модуль реализован (135 строк,
ADR-0038 документирует решение), но не имеет тестов.

**ADR:** [ADR-0038](../../docs/decisions/ADR-0038-hand-rolled-jwt-verifier-for-ingress.md)

**Контекст:** `oidc-verifier.js` используется в `app.js` для verification
JWT-токенов от внешних источников (Zabbix, SIEM, корпоративные боты).
Модуль на stdlib (`node:crypto` + `globalThis.fetch`), без зависимостей.
ADR-0038 фиксирует причину hand-rolled реализации и безопасностные
свойства, но unit-тестов нет.

590 тестов passing на старте спринта. Цель — ~610+ после реализации (~20-25 новых тестов).

## Architecture Decisions

- **Тесты через Node test runner** (`node --test`) — как все тесты в проекте.
- **RSA key pairs для тестов** — генерируются в `before()` hook через
  `crypto.generateKeyPairSync('rsa')`. JWKS endpoint мокается через
  `options.fetchFn`.
- **Injectable clock** — `oidc-verifier.js` использует `Date.now()` для
  expiry/iat проверок и JWKS cache TTL. Тесты мокают `Date.now()`.
- **Без новых зависимостей** — ADR-0015 остаётся без изменений.
  Все моки через stdlib.

## Tasks

### Task 1: Unit tests для oidc-verifier.js

**Status:** Planned

**Description:** Создать `tests/bot-platform/oidc-verifier.test.js` —
комплексные unit-тесты для `createOidcVerifierFactory` и `verifyAccessToken`.
Генерировать RSA key pair в before() хуке, создавать тестовые JWT,
мокать JWKS endpoint через injectable `fetchFn`.

**Acceptance criteria:**
- [ ] Тестовый файл `tests/bot-platform/oidc-verifier.test.js` существует
- [ ] `MODULE_NAME` экспортируется и равен `'oidc-verifier'`
- [ ] Генерация RSA key pair для тестов (crypto.generateKeyPairSync)
- [ ] Создание тестовых JWT с правильной структурой (header.payload.signature)
- [ ] Покрытие happy path:
  - [ ] Валидный JWT с RS256 → `{ claims }` возвращается
  - [ ] Валидный JWT с RS384 → работает
  - [ ] Валидный JWT с RS512 → работает
  - [ ] JWT с audience claim → проверяется
  - [ ] JWT с issuer claim → проверяется
  - [ ] JWKS cache hit (второй вызов без ре-фетча)
  - [ ] JWKS cache miss → kid найден после ре-фетча (happy path refresh)
- [ ] Покрытие error paths:
  - [ ] Invalid JWT format (не 3 части) → "Invalid JWT format"
  - [ ] Missing kid in header → "JWT header missing kid"
  - [ ] Key not found in JWKS → "Key not found in JWKS: <kid>"
  - [ ] Unsupported algorithm (HS256) → "Unsupported algorithm: HS256"
  - [ ] Invalid signature → "Invalid JWT signature"
  - [ ] Token expired → "Token expired"
  - [ ] Token issued in future → "Token issued in the future"
  - [ ] Invalid issuer → "Invalid issuer: expected X, got Y"
  - [ ] Invalid audience → "Invalid audience: expected X"
  - [ ] JWKS fetch failure (500) → "Failed to fetch JWKS from <url>: 500"
- [ ] Покрытие edge cases:
  - [ ] HTTP issuer → logger.warn вызывается
  - [ ] JWKS cache expired → ре-фетч происходит
  - [ ] JWKS cache: kid не найден после ре-фетча → error
  - [ ] Audience — массив (aud: ["a", "b"]) → работает
  - [ ] Audience — строка (aud: "a") → работает
  - [ ] Token без exp → не падает (exp опционален)
  - [ ] Token без iat → не падает (iat опционален)
  - [ ] Issuer trailing slash — код НЕ нормализует (сравнивает как есть) → проверить actual behavior
- [ ] Инъекция зависимостей:
  - [ ] `options.fetchFn` — мок для JWKS endpoint
  - [ ] `options.logger` — мок для проверки warn
  - [ ] Injectable clock через `Date.now()` spy (для expiry/iat/cache TTL)

**Verification:**
- [ ] `node --test tests/bot-platform/oidc-verifier.test.js` — тесты проходят
- [ ] Тесты детерминированы (нет зависимости от реального времени)
- [ ] `npm test` — все тесты проходят (600+)

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/oidc-verifier.test.js` (новый)

**Estimated scope:** M (1 файл, ~300-400 строк тестов)

---

### Task 2: ADR-0038 documentation verification

**Status:** Planned

**Description:** Проверить, что ADR-0038 корректно описывает поведение
модуля после написания тестов. Убедиться, что секция "Безопасность"
соответствует протестированным свойствам. При необходимости —
обновить ADR.

**Acceptance criteria:**
- [ ] ADR-0038 секция "Безопасность" покрывает все протестированные error paths
- [ ] Algorithm allowlist (RS256/RS384/RS512) — протестировано и задокументировано
- [ ] Claim validation (exp, iat, iss, aud) — протестировано и задокументировано
- [ ] JWKS cache behavior — протестировано и задокументировано
- [ ] Нет расхождений между ADR и тестами

**Verification:**
- [ ] ADR-0038 читается, нет placeholder-текста
- [ ] `npm test` — без регрессий

**Dependencies:** Task 1

**Files likely touched:**
- `docs/decisions/ADR-0038-hand-rolled-jwt-verifier-for-ingress.md` (возможно, модификация)

**Estimated scope:** XS (0-1 файл)

---

## Checkpoint: Sprint 25 Complete

- [ ] `npm test` — все тесты проходят (~610+)
- [ ] `tests/bot-platform/oidc-verifier.test.js` покрывает happy paths, error paths, edge cases
- [ ] ADR-0038 documentation verified
- [ ] Нет новых зависимостей (ADR-0015)
- [ ] Тесты детерминированы (injectable clock, mock fetch)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| RSA key generation в тестах — медленная операция | Low | Генерировать один раз в before() хуке, переиспользовать |
| Date.now() spy может сломать другие тесты | Medium | Использовать `mock.method` из node:test, восстанавливать в after() |
| JWKS cache TTL тесты требуют advance time | Medium | Mock Date.now() с фиксированными значениями, не реальный sleep |
| JWT с разными алгоритмами требуют разные ключи | Low | Генерировать RSA ключ для RS256/RS384/RS512 (один ключ, разные hash) |

## Open Questions

- Нужны ли интеграционные тесты с реальным JWKS endpoint? (Нет — unit tests sufficient для MVP)

## Файлы для изменения (сводка)

```
tests/bot-platform/oidc-verifier.test.js              (новый)
docs/decisions/ADR-0038-hand-rolled-jwt-verifier-for-ingress.md (возможно, модификация)
```
