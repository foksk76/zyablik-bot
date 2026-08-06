# ADR-0038: Hand-rolled JWT-verifier для ingress layer

## Статус

Принято.

## Дата

2026-07-23

## Контекст

ADR-0024 принимает `@okta/jwt-verifier` как исключение из ADR-0015
для auth-слоя `JwtSourceAuth` (`src/bot-platform/ingress/jwt-source-auth.js`).

В ingress layer существует второй JWT-верификатор —
`src/bot-platform/ingress/oidc-verifier.js`. Он используется в `app.js`
для verification JWT-токенов, приходящих от внешних источников
(Zabbix, SIEM, корпоративные боты) через `POST /ingest`.

Два JWT-верификатора в кодовой базе требуют документирования:
- когда используется каждый
- почему не унифицировать через `@okta/jwt-verifier`
- безопасность hand-rolled реализации

### Два контекста использования

| Модуль | Контекст | Что верифицирует |
|---|---|---|
| `jwt-source-auth.js` | Auth-слой (ADR-0024) | Access tokens от IdP для аутентификации источников |
| `oidc-verifier.js` | Ingress layer | JWT от произвольных внешних источников (source-mapping) |

`jwt-source-auth.js` использует `@okta/jwt-verifier` — готовый
пакет с JWKS-кешированием, algorithm allowlist, claim validation.

`oidc-verifier.js` — hand-rolled на `node:crypto` + `globalThis.fetch`.
Причины:
- ingress layer не зависит от IdP-провайдера (ADR-0022: multi-source);
- JWT от внешних источников могут использовать разные JWKS-endpoints;
- `@okta/jwt-verifier` привязан к Okta-специфичным API;
- hand-rolled верификатор — ~135 строк stdlib, легко audit-уется.

### OIDC discovery (изменение 2026-08)

С 2026-08 `oidc-verifier.js` при получении ключей сначала выполняет
OIDC discovery: `GET {issuer}/.well-known/openid-configuration`, читает
`jwks_uri` и фетчит ключи оттуда (решает Okta `/oauth2/default/v1/keys`
и Keycloak `/protocol/openid-connect/certs`). Если discovery недоступен,
возвращает не-JSON, не содержит `jwks_uri` или `jwks_uri` резолвится
на чужой origin (SSRF-guard) — используется fallback
`{issuer}/.well-known/jwks.json` (NanoIDP). Относительный `jwks_uri`
резолвится через `new URL(jwks_uri, issuer)` и принимается только при
совпадении protocol+host с issuer. Успешный discovery кешируется на 1 час,
сбойный — на короткий отрицательный TTL (5 минут), чтобы транзиентно
недоступный IdP не застревал на час. Если JWKS-fetch по `jwks_uri` из
discovery падает (протухший адрес) — один retry на дефолтный путь
`{issuer}/.well-known/jwks.json`. JWKS кешируются на 1 час независимо.

В `app.js` `createIssuerVerifierFactory(issuer, logger)` теперь возвращает
hand-rolled verifier для **любого** непустого issuer (ранее — только для
`http://`, для `https://` возвращался `null` и `jwt-source-auth.js` падал
на `@okta/jwt-verifier` с жёстко зашитым `issuer + '/v1/keys'`, что ломало
NanoIDP и любые не-Okta IdP → `POST /ingest` отвечал 401).

### Сетевая надёжность и ротация ключей (изменение 2026-08-06)

- Все исходящие fetch (discovery и JWKS) идут под `AbortSignal.timeout`
  (дефолт 15 с, опция `fetchTimeoutMs`): зависший IdP не вешает весь ingress
  через in-flight dedup. Редиректы (301/302/307/308) следуются, но только
  внутри origin-а issuer (protocol + host), с same-origin-проверкой каждого
  hop'а и лимитом `MAX_REDIRECT_HOPS` (5): легитимная нормализация URL
  (www→bare, http→https, трейлинг-слэш, issuer-path) продолжает работать,
  а редирект на внутренний/чужой адрес обрывается (SSRF defense-in-depth).
- kid-miss форсит refresh JWKS только вне отрицательного окна (5 минут
  после сбойного fetch) и вне grace-периода после успешного fetch
  (5 минут) — иначе kid-miss после протухания 1h-кеша давал бы 2 лишних
  исходящих запроса (обновление в getJwks + отдельный forced refresh), в т.ч.
  амплификация через случайные `kid` от атакующего.
- JWKS-ответ без массива `keys` (200 с пустым/странным телом) трактуется
  как сбойный и уходит в отрицательный кеш — иначе такой ответ кешировался
  бы на час и форсил бы refresh на каждый `/ingest`.
- Поле `issuer` discovery-документа (RFC 8414) сверяется с конфигурированным
  issuer; при несовпадении discovery игнорируется и используется дефолтный
  путь от доверенного (конфигурированного) issuer с `logger.warn` — иначе
  враждебный/баговый discovery тихо заменил бы источник ключей.
- `issuer` нормализуется один раз (срез трейлинг-слэша) и используется
  и для базового URL, и для сравнения `iss`; `payload.iss` в токене
  нормализуется так же — иначе `https://idp.../` в конфиге или в токене
  давал рабочий JWKS, но тихий 401 на все токены.
- `iat`/`nbf` допускают рассинхрон часов (опция `clockSkewToleranceSec`,
  дефолт 30 с) — строгая проверка «из будущего» резала бы легитимные токены
  при расхождении часов IdP и ingress на 1–2 с.
- Allowlist алгоритмов и `kty === 'RSA'` проверяются **до** `importKey`,
  чтобы EC-ключ, HMAC-ключ или мусорный header давали чистый
  `Unsupported algorithm` / `Unsupported key type`, а не невнятную
  ошибку от `crypto.createPublicKey`.
- Claim-валидация (`exp`/`iat`/`nbf`/`iss`/`aud`) выполняется **до** сетевых
  fetch и RSA-verify (claims лежат в подписанной части) — expired/garbage-токен
  не дёргает discovery + JWKS на холодном старте (анти-амплификация).
- `kid` из заголовка токена санитизируется перед попаданием в ошибки/логи
  (`Key not found in JWKS: ...`) — атакующий не может вшить перевод строки
  или control-символы в лог.
- `KeyObject` кешируется по `kid` (инвалидируется при refresh JWKS) — нет
  `crypto.createPublicKey` на каждую верификацию.

## Решение

Зафиксировать `oidc-verifier.js` как deliberately hand-rolled
JWT-verifier для ingress layer. Модуль документирован, протестирован,
и его существование — осознанный выбор.

### Возможности

```text
createOidcVerifierFactory(options) → createVerifier({ issuer, audience, clockSkewToleranceSec })
  createVerifier.verifyAccessToken(token) → { claims }
```

- **JWKS fetching**: OIDC discovery (`/.well-known/openid-configuration` → `jwks_uri`)
  с fallback на `/.well-known/jwks.json`; успешный discovery кеш 1 час, отрицательный
  кеш сбойного discovery 5 минут; JWKS-кеш TTL 1 час; retry на дефолтный путь при сбое
  fetch по discovered `jwks_uri`; отрицательный кеш сбойного JWKS-fetch 5 минут (без
  retry-шторма на каждый `/ingest`); все fetch под `AbortSignal.timeout` (дефолт 15 с);
  редиректы следуются только внутри origin-а issuer (same-origin-проверка каждого hop,
  лимит 5)
- **Key rotation**: kid-miss принудительно форсит refresh JWKS (минуя TTL-кеш,
  дедуплицирован через in-flight promise), с fallback на последний успешный кеш;
  refresh пропускается внутри отрицательного окна сбойного fetch (5 минут) и
  внутри grace-периода после успешного fetch (5 минут, `JWKS_FORCED_REFRESH_MIN_INTERVAL_MS`)
- **Issuer validation**: `issuer` проверяется через `new URL()` (схема http/https),
  не-URL значение отклоняется с понятной ошибкой; трейлинг-слэш нормализуется один раз
  (и для base URL, и для сравнения `iss`); `payload.iss` нормализуется так же; поле
  `issuer` discovery-документа (RFC 8414) сверяется с конфигурированным issuer
  (mismatch → warn + fallback на дефолтный путь)
- **Algorithm allowlist**: только RSA-family (`RS256`, `RS384`, `RS512`) и
  `kty === 'RSA'`, проверяются до `importKey`
- **Claim validation**: `exp`, `iat`, `nbf`, `iss`, `aud` — до сетевых fetch
  и RSA-verify; `iat`/`nbf` с допуском на рассинхрон часов (`clockSkewToleranceSec`,
  дефолт 30 с)
- **Key import**: `crypto.createPublicKey({ key: jwk, format: 'jwk' })`; JWKS-тело
  валидируется (обязательный массив `keys`) до кеширования; `KeyObject` кешируется
  по `kid` (инвалидируется при refresh JWKS)
- **Signature verification**: `crypto.verify(algorithm, data, key, signature)`

### Безопасность

| Аспект | Реализация |
|---|---|
| Algorithm confusion | Allowlist: только RS256/RS384/RS512. HS*, ES*, PS* отклоняются |
| Key confusion | JWKS endpoint резолвится из OIDC discovery (jwks_uri) или привязан к `issuer` /.well-known/jwks.json. RSA-only: `kty === 'RSA'` проверяется до `importKey` (EC/HMAC-ключ в JWKS → `Unsupported key type`), HMAC не поддерживается |
| SSRF (jwks_uri) | `jwks_uri` из discovery резолвится через `new URL(jwks_uri, issuer)` и принимается только same-origin с issuer (protocol + host), иначе игнорируется и используется fallback; редиректы следуются только внутри origin-а issuer (same-origin-проверка каждого hop, лимит 5, `MAX_REDIRECT_HOPS`) — редирект на внутренний/чужой адрес обрывается и трактуется как сбойный fetch |
| Fetch timeout | Все исходящие fetch под `AbortSignal.timeout` (дефолт 15 с, опция `fetchTimeoutMs`) — зависший IdP не вешает ingress через in-flight dedup |
| Expiry | `exp`, `iat` и `nbf` проверяются (токен из будущего — `Token not yet valid`); `iat`/`nbf` с допуском на рассинхрон часов (`clockSkewToleranceSec`, дефолт 30 с) |
| Issuer | `iss` проверяется against configured `issuer` (нормализованный: трейлинг-слэш срезан; `payload.iss` нормализуется так же); поле `issuer` discovery-документа (RFC 8414) сверяется с конфигурированным issuer — mismatch → warn + fallback на дефолтный путь |
| Log injection | `kid` из заголовка токена санитизируется (без control chars, усечён до 64 символов) перед попаданием в ошибки/логи |
| Audience | `aud` проверяется если `expectedAudience` задан; `createVerifier({ audience })` используется как default при вызове `verifyAccessToken(token)` без второго аргумента |
| JWKS rotation | Кеш 1 час; kid-miss принудительно форсит refresh (минуя TTL, вне отрицательного окна сбойного fetch и вне grace-периода 5 минут после успешного fetch), fallback на последний успешный кеш при сбое; отрицательный кеш сбойного fetch 5 минут; JWKS-тело валидируется (массив `keys`) до кеширования |
| Insecure HTTP | `logger.warn` при HTTP issuer, но верификация работает |

### Почему не унифицировать через `@okta/jwt-verifier`

- `@okta/jwt-verifier` привязан к Okta SDK API;
- ingress layer работает с произвольными OIDC-провайдерами (не только Okta);
- hand-rolled верификатор — 135 строк, полностью на stdlib;
- оба модуля решают разные задачи в разных слоях.

### Связь с queue-monitor/auth/oidc.js

`src/queue-monitor/auth/oidc.js` зеркалирует паттерн `oidc-verifier.js`
для OAuth2 Authorization Code flow. Это осознанное дублирование:
queue-monitor auth — отдельный слой (ADR-0034), отдельный `package.json`,
отдельная ответственность.

## Рассмотренные альтернативы

### Унифицировать через `@okta/jwt-verifier`

Минус: `@okta/jwt-verifier` привязан к Okta SDK, не работает с
произвольными JWKS-endpoints. Ingress layer должен поддерживать
любой OIDC-провайдер (ADR-0022: multi-source). Отклонено.

### Использовать `jose` (JWT library)

Минус: ADR-0015 (zero deps). `jose` — ESM-only, добавляет dependency
для ~135 строк кода. Отклонено.

### Вынести в отдельный пакет

Минус: один файл (135 строк), два потребителя (`app.js`, `oidc.js`).
Вынос в пакет = overengineering. Отклонено.

## Последствия

### Новые файлы

Нет — модуль уже реализован.

### Документация

Этот ADR фиксирует:
- существование двух JWT-верификаторов в кодовой базе;
- причину hand-rolled реализации;
- безопасностные свойства (algorithm allowlist, RSA-only);
- связь с `@okta/jwt-verifier` (разные слои, разные задачи).

### Не затронуто

- root `package.json` — без изменений;
- `@okta/jwt-verifier` — остаётся в `package.json` (ADR-0024) как
  default-fallback в `jwt-source-auth.js` при отсутствии `verifierFactory`
  (direct/standalone использование `createJwtSourceAuth`). Wired-путь
  `app.js` всегда инжектит hand-rolled verifier через
  `createIssuerVerifierFactory`, поэтому в проде `@okta/jwt-verifier`
  не вызывается;
- ADR-0015 policy-test — без изменений.

## Ссылки

- [ADR-0024](ADR-0024-accept-okta-jwt-verifier.md) — `@okta/jwt-verifier` для auth-слоя
- [ADR-0022](ADR-0022-expand-scope-multi-source-ingest.md) — multi-source ingress
- [ADR-0015](ADR-0015-zero-external-dependencies.md) — нулевые внешние зависимости
- `src/bot-platform/ingress/oidc-verifier.js` — реализация
- `src/bot-platform/ingress/jwt-source-auth.js` — `@okta/jwt-verifier` consumer
