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

## Решение

Зафиксировать `oidc-verifier.js` как deliberately hand-rolled
JWT-verifier для ingress layer. Модуль документирован, протестирован,
и его существование — осознанный выбор.

### Возможности

```text
createOidcVerifierFactory(options) → createVerifier({ issuer, audience })
  createVerifier.verifyAccessToken(token) → { claims }
```

- **JWKS fetching**: OIDC discovery (`/.well-known/openid-configuration` → `jwks_uri`)
  с fallback на `/.well-known/jwks.json`; успешный discovery кеш 1 час, отрицательный
  кеш сбойного discovery 5 минут; JWKS-кеш TTL 1 час; retry на дефолтный путь при сбое
  fetch по discovered `jwks_uri`; отрицательный кеш сбойного JWKS-fetch 5 минут (без
  retry-шторма на каждый `/ingest`)
- **Key rotation**: kid-miss принудительно форсит refresh JWKS (минуя TTL-кеш,
  дедуплицирован через in-flight promise), с fallback на последний успешный кеш
- **Issuer validation**: `issuer` проверяется через `new URL()` (схема http/https),
  не-URL значение отклоняется с понятной ошибкой
- **Algorithm allowlist**: только RSA-family (`RS256`, `RS384`, `RS512`)
- **Claim validation**: `exp`, `iat`, `iss`, `aud`
- **Key import**: `crypto.createPublicKey({ key: jwk, format: 'jwk' })`
- **Signature verification**: `crypto.verify(algorithm, data, key, signature)`

### Безопасность

| Аспект | Реализация |
|---|---|
| Algorithm confusion | Allowlist: только RS256/RS384/RS512. HS*, ES*, PS* отклоняются |
| Key confusion | JWKS endpoint резолвится из OIDC discovery (jwks_uri) или привязан к `issuer` /.well-known/jwks.json. RSA-only, HMAC не поддерживается |
| SSRF (jwks_uri) | `jwks_uri` из discovery резолвится через `new URL(jwks_uri, issuer)` и принимается только same-origin с issuer (protocol + host), иначе игнорируется и используется fallback |
| Expiry | `exp` и `iat` проверяются |
| Issuer | `iss` проверяется against configured `issuer` |
| Audience | `aud` проверяется если `expectedAudience` задан; `createVerifier({ audience })` используется как default при вызове `verifyAccessToken(token)` без второго аргумента |
| JWKS rotation | Кеш 1 час; kid-miss принудительно форсит refresh (минуя TTL), fallback на последний успешный кеш при сбое; отрицательный кеш сбойного fetch 5 минут |
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
