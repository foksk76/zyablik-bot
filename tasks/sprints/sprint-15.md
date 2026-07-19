# Sprint 15: Ingress Pipeline (ADR-0023 + ADR-0024)

## Outcome

Построить ingress pipeline: JWT-аутентификация через IdP (NanoIDP/Okta), per-source нормализаторы, HTTP-сервер с маршрутом `POST /ingest`. По ADR-0023 (http.createServer), ADR-0024 (@okta/jwt-verifier), ADR-0022 (multi-source ingest scope).

Контекст: bot-platform не принимает входящий HTTP. Источники (Zabbix, SIEM) не могут доставлять уведомления. Текущий прямой путь `max-webhook.js → MAX Bot API` не аутентифицируется.

## Tasks

### Task 1: Add `@okta/jwt-verifier` dependency

**Status:** Planned

**Description:** Добавить `@okta/jwt-verifier` v4.x в `package.json` как runtime dependency. Проверить `npm audit`.

**Acceptance criteria:**
- [ ] `package.json` содержит `"dependencies": { "@okta/jwt-verifier": "^4.x" }`
- [ ] `npm install` завершается без ошибок
- [ ] `npm audit` не показывает критических уязвимостей

**Verification:**
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `package.json`

**Estimated scope:** XS (1 file)

### Task 2: Add IdP env vars to `src/bot-platform/core/config.js`

**Status:** Planned

**Description:** Расширить `createBotPlatformConfig()` переменными для IdP: `IDP_ISSUER`, `IDP_AUDIENCE`. Добавить валидацию: если ingress включён, `IDP_ISSUER` обязателен.

**Acceptance criteria:**
- [ ] `createBotPlatformConfig({ IDP_ISSUER: 'https://example.idp.com' })` возвращает `idpIssuer`
- [ ] `createBotPlatformConfig({})` возвращает `idpIssuer: ''` (default)
- [ ] Валидация: `IDP_ISSUER` обязателен при `INGRESS_ENABLED=true`

**Verification:**
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/core/config.js`

**Estimated scope:** S (1 file)

### Task 3: Create `src/bot-platform/ingress/jwt-source-auth.js`

**Status:** Planned

**Description:** JWT-аутентификация через `@okta/jwt-verifier` (совместим с OIDC-провайдерами). Фабрика `createJwtSourceAuth(options = {})` принимает `{ issuer, audience, claimName, claimValue, logger }`. Метод `authenticate(authorizationHeader)` извлекает Bearer token, верифицирует через IdP JWKS, возвращает `{ source }` из claim. Fail-closed: любая ошибка → исключение.

**Acceptance criteria:**
- [ ] `createJwtSourceAuth({ issuer, audience })` создаёт auth-модуль
- [ ] `authenticate('Bearer <valid-jwt>')` возвращает `{ source: 'zabbix' }`
- [ ] `authenticate(null)` выбрасывает ошибку
- [ ] `authenticate('Bearer invalid')` выбрасывает ошибку
- [ ] `authenticate('Bearer <expired-jwt>')` выбрасывает ошибку
- [ ] `authenticate('Bearer <wrong-aud-jwt>')` выбрасывает ошибку
- [ ] Ошибки не содержат raw token в сообщении (safe logger)

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 1

**Files likely touched:**
- `src/bot-platform/ingress/jwt-source-auth.js` (new)

**Estimated scope:** M (1 file, auth logic)

### Task 4: Create `tests/bot-platform/jwt-source-auth.test.js`

**Status:** Planned

**Description:** Unit tests для JwtSourceAuth: мокать `@okta/jwt-verifier` (ADR-0016 — dependency injection). Тестировать happy path, отсутствие токена, невалидный токен, expired, wrong audience.

**Acceptance criteria:**
- [ ] Тест: валидный JWT → `{ source: 'zabbix' }`
- [ ] Тест: null header → ошибка
- [ ] Тест: невалидный token → ошибка
- [ ] Тест: expired token → ошибка
- [ ] Тест: wrong audience → ошибка
- [ ] Тест: ошибка не содержит raw token

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 3

**Files likely touched:**
- `tests/bot-platform/jwt-source-auth.test.js` (new)

**Estimated scope:** M (1 file, 6+ tests)

### Task 5: Add `SOURCE_ZABBIX` to `src/bot-platform/core/event-contract.js`

**Status:** Planned

**Description:** Добавить константу `SOURCE_ZABBIX = 'zabbix'` (и `SOURCE_INGEST = 'ingest'` для ingest pipeline) в event-contract. Расширить `createInternalEvent()` для поддержки ingest source.

**Acceptance criteria:**
- [ ] `SOURCE_ZABBIX === 'zabbix'`
- [ ] `SOURCE_INGEST === 'ingest'`
- [ ] `createInternalEvent({ source: 'ingest', recipient: {...}, message: {...} })` работает
- [ ] Существующие тесты event-contract продолжают работать

**Verification:**
- [ ] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `src/bot-platform/core/event-contract.js`

**Estimated scope:** XS (1 file)

### Task 6: Create `src/bot-platform/ingress/normalizers/zabbix.js`

**Status:** Planned

**Description:** Per-source normalizer для Zabbix. Принимает body из `POST /ingest` (контракт: `{ recipient: { kind, value }, message: '...' }`), возвращает canonical event `{ source: 'zabbix', recipient, message: { text }, raw }`. Валидирует `recipient.kind` (user|chat) и `recipient.value`.

**Acceptance criteria:**
- [ ] `normalizeZabbixEvent({ recipient: { kind: 'user', value: '123' }, message: 'alert' })` → canonical event
- [ ] `normalizeZabbixEvent({ recipient: { kind: 'chat', value: '456' }, message: 'alert' })` → canonical event
- [ ] `normalizeZabbixEvent({})` → ошибка (recipient обязателен)
- [ ] `normalizeZabbixEvent({ recipient: { kind: 'unknown' } })` → ошибка
- [ ] `normalizeZabbixEvent({ recipient: { value: '123' } })` → ошибка (kind обязателен)

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 5

**Files likely touched:**
- `src/bot-platform/ingress/normalizers/zabbix.js` (new)

**Estimated scope:** S (1 file)

### Task 7: Create `src/bot-platform/ingress/normalizers/index.js`

**Status:** Planned

**Description:** Normalizer registry. Объект `{ zabbix: normalizeZabbixEvent }`. Функция `getNormalizer(sourceName)` возвращает normalizer или `null`. Пока только Zabbix, расширяемость для будущих источников.

**Acceptance criteria:**
- [ ] `getNormalizer('zabbix')` возвращает функцию
- [ ] `getNormalizer('unknown')` возвращает `null`
- [ ] Экспортирует `normalizeZabbixEvent` для прямого использования

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 6

**Files likely touched:**
- `src/bot-platform/ingress/normalizers/index.js` (new)

**Estimated scope:** XS (1 file)

### Task 8: Create `tests/bot-platform/ingress-normalizers.test.js`

**Status:** Planned

**Description:** Unit tests для normalizers: Zabbix normalizer happy path + error cases, registry lookup.

**Acceptance criteria:**
- [ ] Тест: Zabbix user event → canonical event с `source: 'zabbix'`
- [ ] Тест: Zabbix chat event → canonical event с `source: 'zabbix'`
- [ ] Тест: Zabbix без recipient → ошибка
- [ ] Тест: getNormalizer('zabbix') → функция
- [ ] Тест: getNormalizer('unknown') → null

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 6, 7

**Files likely touched:**
- `tests/bot-platform/ingress-normalizers.test.js` (new)

**Estimated scope:** S (1 file, 5 tests)

### Task 9: Create `src/bot-platform/ingress/http-server.js`

**Status:** Planned

**Description:** HTTP-сервер на `http.createServer` (stdlib). Маршрут `POST /ingest`. Принимает `{ port, jwtAuth, normalizer, queueStore, outboundClient, logger }` через options. Парсит JSON body, вызывает `jwtAuth.authenticate(header)`, определяет normalizer по `source`, нормализует, отправляет через `outboundClient` или `queueStore.enqueue()`. Ответы: 200 (ok), 400 (invalid body), 401 (auth failure), 501 (channel without recipient).

**Acceptance criteria:**
- [ ] `POST /ingest` с валидным JWT + body → 200
- [ ] `POST /ingest` без JWT → 401
- [ ] `POST /ingest` с невалидным JWT → 401
- [ ] `POST /ingest` с невалидным JSON body → 400
- [ ] `POST /ingest` без recipient → 400
- [ ] `POST /ingest` с `channel` без `recipient` → 501
- [ ] Сервер слушает на указанном порту
- [ ] GET/PUT/DELETE → 404

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Tasks 3, 6, 7

**Files likely touched:**
- `src/bot-platform/ingress/http-server.js` (new)

**Estimated scope:** L (1 file, HTTP + auth + routing)

### Task 10: Create `tests/bot-platform/ingress-http-server.test.js`

**Status:** Planned

**Description:** Интеграционные тесты HTTP-сервера: мокать jwtAuth, normalizer, outboundClient. Тестировать все HTTP-ответы, включая ошибки.

**Acceptance criteria:**
- [ ] Тест: POST /ingest + valid JWT → 200 + outbound/send вызван
- [ ] Тест: POST /ingest + no JWT → 401
- [ ] Тест: POST /ingest + invalid JWT → 401
- [ ] Тест: POST /ingest + invalid JSON → 400
- [ ] Тест: POST /ingest + no recipient → 400
- [ ] Тест: POST /ingest + channel only → 501
- [ ] Тест: GET /ingest → 404

**Verification:**
- [ ] `npm test` passes

**Dependencies:** Task 9

**Files likely touched:**
- `tests/bot-platform/ingress-http-server.test.js` (new)

**Estimated scope:** M (1 file, 7+ tests)

## Checkpoint: After Tasks 1-2 (Foundation)

- [ ] `@okta/jwt-verifier` установлен
- [ ] IdP env vars добавлены в config
- [ ] `npm test` passes

## Checkpoint: After Tasks 3-4 (JWT Auth)

- [ ] `jwt-source-auth.js` создан и работает
- [ ] `jwt-source-auth.test.js` — все тесты проходят
- [ ] Mock-JWT тесты работают без реального IdP

## Checkpoint: After Tasks 5-8 (Normalizers)

- [ ] `SOURCE_ZABBIX` добавлен в event-contract
- [ ] Zabbix normalizer работает
- [ ] Normalizer registry работает
- [ ] Тесты normalizers проходят

## Checkpoint: After Tasks 9-10 (HTTP Server)

- [ ] HTTP-сервер работает с `POST /ingest`
- [ ] Все HTTP-коды ответов протестированы
- [ ] Интеграционные тесты проходят
- [ ] `npm test` passes (все тесты)
