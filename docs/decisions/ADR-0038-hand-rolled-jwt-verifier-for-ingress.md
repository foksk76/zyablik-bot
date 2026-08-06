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
- hand-rolled верификатор — один модуль на stdlib (сейчас ~600 строк с
  OIDC discovery, кешами и ограничениями сети), легко audit-уется.

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
404 (авторитетный «эндпоинта нет») — на 15 минут, транзиентный сбой
(5xx/сеть/таймаут) — на короткий отрицательный TTL (5 минут), чтобы
недоступный IdP не застревал надолго. Если JWKS-fetch по `jwks_uri` из
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
  внутри origin-а issuer с точным равенством `protocol` + `host` (same-origin
  проверка каждого hop'а, лимит `MAX_REDIRECT_HOPS` 5): проходят трейлинг-слэш
  и issuer-path, а редирект на внутренний/чужой адрес, смену host (www→bare)
  или смену протокола (http→https) обрываем (SSRF defense-in-depth; issuer
  конфигурируется с финальным scheme/host — http→https upgrade не нужен,
  на стенде TLS уже терминирует nginx, ADR-0044).
  Кроме per-hop timeout на всю цепочку редиректов одного fetch действует
  общий дедлайн (`fetchTotalTimeoutMs`, дефолт 30 с): иначе редирект-петля
  давала бы до `(MAX_REDIRECT_HOPS + 1) × fetchTimeoutMs` ≈ 90 с ожидания,
  разделённых между всеми `/ingest` через in-flight dedup. Каждый hop
  получает `min(fetchTimeoutMs, остаток общего бюджета)`.
- Discovery (резолв `jwks_uri`) дедуплицируется через общий in-flight promise
  аналогично JWKS: burst параллельных `/ingest` на холодном старте делает
  один discovery-запрос, а не по одному на каждый запрос.
- Ответ discovery с кодом 404 кешируется как авторитетный «эндпоинта нет»
  на `DISCOVERY_NOT_FOUND_TTL_MS` (15 минут), а не на короткий отрицательный
  (5 минут): NanoIDP — целевой сценарий PR — отдаёт 404 на
  `openid-configuration` всегда, и 5-минутный пере-пробинг давал бы вечный
  поток бесполезных discovery-запросов (по одному на verifier каждые 5 минут).
  15 минут вместо 1 часа — чтобы транзиентный 404 (рестарт/deploy реального
  IdP; fallback `/.well-known/jwks.json` тоже 404) не оставлял auth сломанным
  на час после восстановления IdP: после истечения TTL discovery пере-пробуется.
  Короткий отрицательный TTL остаётся для транзиентных сбоев (5xx, сетевые
  ошибки, таймауты).
- Если JWKS-fetch по discovered `jwks_uri` падает, а один retry на дефолтный
  путь `{issuer}/.well-known/jwks.json` спасает (fallback-success),
  `jwksUriInfo` сохраняет `discovered:true` — discovery сам был валиден
  (сломался только `jwks_uri`), и его 1h-кеш не деградирует до 5-минутного
  re-probing-а без причины. Fallback-URL остаётся активным до истечения
  1h-кеша, после чего discovery пере-резолвится и восстановленный
  discovered `jwks_uri` снова будет использован.
- kid-miss форсит refresh JWKS только вне отрицательного окна (5 минут
  после сбойного fetch) и вне grace-периода после успешного fetch
  (5 минут) — иначе kid-miss после протухания 1h-кеша давал бы 2 лишних
  исходящих запроса (обновление в getJwks + отдельный forced refresh), в т.ч.
  амплификация через случайные `kid` от атакующего.
- Первый short-circuit поиска ключа по `kid` в `findKeyForKid` учитывает TTL
  JWKS-кеша (`isJwksFresh()`): если IdP переиспользует `kid` при ротации
  (RFC 7517 — `kid` это hint, а не гарантия уникальности), старый ключ под
  тем же `kid` не матчится вечно — по истечении 1h-кеша даже известный `kid`
  проходит через `getJwks()` → refresh, и вся ротационная механика
  (grace/negative/kid-miss) не обходится.
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
- `issuer` с query/fragment отклоняется при создании verifier-а
  (`Invalid issuer URL`, как и не-URL значение): WHATWG-`new URL()`
  нормализует холостой `?`/`#` в пустую строку, но `#frag` срезал бы путь
  при сборке discovery-URL (`issuerBaseUrl + DISCOVERY_PATH`), а `?x=1`
  делал бы невозможным совпадение с `payload.iss` токена — оба случая
  давали бы тихий 401 на все токены (тот же класс, что трейлинг-слэш).
  OIDC issuer — это origin с опциональным путём (RFC 8414); query/fragment
  в нём не допускаются, поэтому конфиг-ошибка ловится fail-fast, а не
  в проде на каждом токене.
- `iat`/`nbf`/`exp` допускают рассинхрон часов (опция
  `clockSkewToleranceSec`, дефолт 30 с): строгая проверка «из будущего»
  резала бы легитимные токены при расхождении часов IdP и ingress на 1–2 с,
  а строгий `exp` резал бы токены, протухшие в пределах допуска (часы IdP
  чуть впереди ingress). Допуск применяется в безопасную сторону (`exp`
  проверяется как `exp < now - skewToleranceSec`).
- `exp`/`iat`/`nbf` опциональны (RFC 7519 не требует их обязательного
  наличия; реальные IdP проставляют `exp`): токен без temporal-claims
  проходит. Осознанный выбор в пользу интероперабельности — ужесточение
  (обязательный `exp`) отвергнуто как breaking для IdP, выпускающих
  токены без `exp`.
- Присутствующие temporal-claims обязаны быть числами (RFC 7519
  NumericDate): не-числовое значение (`exp: "abc"`, `iat: null`, `nbf: "…"`)
  в сравнении с `now` давало бы NaN → false → проверка молча пропускалась
  бы. Теперь non-number даёт стабильную ошибку `Invalid token {claim} claim`
  (детерминированная валидация, до сетевых fetch).
- Allowlist алгоритмов проверяется по заголовку токена **до** сетевых fetch
  (детерминированная проверка, не требующая JWKS): мусорный `alg` не дёргает
  discovery + JWKS на холодном старте (анти-амплификация) и даёт чистый
  `Unsupported algorithm`, а не невнятную `Key not found`. `kty === 'RSA'`
  проверяется после поиска ключа в JWKS (зависит от найденного ключа), но
  до `importKey`, чтобы EC/HMAC-ключ давал чистый `Unsupported key type`,
  а не невнятную ошибку от `crypto.createPublicKey`.
- Temporal-claim-валидация (`exp`/`iat`/`nbf`) выполняется **до** сетевых
  fetch и RSA-verify (значения приходят из самого токена и не раскрывают
  конфиг) — expired/garbage-токен не дёргает discovery + JWKS на холодном
  старте (анти-амплификация).
- `iss`/`aud` проверяются **после** проверки подписи: до `crypto.verify`
  эти claims атакующий-контролируемые, и их проверка в логах (reason)
  позволяла бы атакующему отличить `Invalid audience`/`Invalid issuer`
  от `Invalid JWT signature` и подобрать точный `expected aud`/`iss` —
  «оракул» конфигурации. После успешной верификации claims авторизованы
  подписью IdP.
- Значения из заголовка/полезной нагрузки токена (атакующий-контролируемые:
  `kid`, `alg`, `iss`) санитизируются перед попаданием в ошибки/логи (без
  control chars, усечены до 64 символов) — атакующий не может вшить перевод
  строки или control-символы в лог. Сырые ошибки `JSON.parse` (превью
  ввода с control chars) тоже не пробрасываются наружу: битый header/payload
  даёт стабильное `Invalid JWT header`/`Invalid JWT payload` без встроенного
  ввода.
- **Ограничение**: IdP без `kid` (токен без `kid` или ключ JWKS без `kid`)
  не поддерживается. Токен без `kid` отклоняется (`JWT header missing kid`),
  ключ без `kid` не находится (поиск идёт строго по `k.kid === kid`).
  Заявка verifier-а — «любой OIDC-issuer»; kid-less IdP (единичный ключ без
  `kid`) — вне scope: RFC 7515 требует `kid` для выбора ключа, реальные
  OIDC-провайдеры публикуют `kid`. Если понадобится поддержка kid-less
  IdP — single-key fallback (JWKS ровно с одним ключом) как отдельное
  изменение с ADR. Старый `@okta/jwt-verifier` итерировал ключи и такой
  сценарий покрывал.
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
  с fallback на `/.well-known/jwks.json`; успешный discovery кеш 1 час, авторитетный
  404 — 15 минут, отрицательный кеш сбойного discovery 5 минут; JWKS-кеш TTL 1 час; retry на дефолтный путь при сбое
  fetch по discovered `jwks_uri`; отрицательный кеш сбойного JWKS-fetch 5 минут (без
  retry-шторма на каждый `/ingest`); все fetch под `AbortSignal.timeout` (дефолт 15 с)
  + общий дедлайн на цепочку редиректов (`fetchTotalTimeoutMs`, дефолт 30 с);
  редиректы следуются только внутри origin-а issuer (same-origin-проверка каждого hop,
  лимит 5)
- **Key rotation**: kid-miss принудительно форсит refresh JWKS (минуя TTL-кеш,
  дедуплицирован через in-flight promise), с fallback на последний успешный кеш;
  refresh пропускается внутри отрицательного окна сбойного fetch (5 минут) и
  внутри grace-периода после успешного fetch (5 минут, `JWKS_FORCED_REFRESH_MIN_INTERVAL_MS`)
- **Issuer validation**: `issuer` проверяется через `new URL()` (схема http/https),
  не-URL значение, query или fragment отклоняются с понятной ошибкой
  (`Invalid issuer URL`); трейлинг-слэш нормализуется один раз
  (и для base URL, и для сравнения `iss`); `payload.iss` нормализуется так же; поле
  `issuer` discovery-документа (RFC 8414) сверяется с конфигурированным issuer
  (mismatch → warn + fallback на дефолтный путь)
- **Algorithm allowlist**: только RSA-family (`RS256`, `RS384`, `RS512`) —
  проверка по заголовку токена **до** сетевых fetch; `kty === 'RSA'`
  проверяется после поиска ключа в JWKS, до `importKey`
- **Ограничение (kid-less IdP)**: токен без `kid` отклоняется; ключ JWKS без
  `kid` не находится — IdP обязан публиковать `kid` (RFC 7515).
- **Claim validation**: temporal-claims (`exp`, `iat`, `nbf`) — до сетевых fetch
  и RSA-verify (анти-амплификация, допуск на рассинхрон часов
  `clockSkewToleranceSec`, дефолт 30 с, включая `exp` в безопасную сторону);
  присутствующие claims обязаны быть числами (NumericDate, RFC 7519) —
  non-number даёт стабильную ошибку `Invalid token {claim} claim`, а не
  молчаливый пропуск из-за NaN-сравнения;
  `iss`/`aud` — после проверки подписи (нет «оракула» конфигурации до verify)
- **Key import**: `crypto.createPublicKey({ key: jwk, format: 'jwk' })`; JWKS-тело
  валидируется (обязательный массив `keys`) до кеширования; `KeyObject` кешируется
  по `kid` (инвалидируется при refresh JWKS)
- **Signature verification**: `crypto.verify(algorithm, data, key, signature)`

### Безопасность

| Аспект | Реализация |
|---|---|
| Algorithm confusion | Allowlist: только RS256/RS384/RS512, проверяется по заголовку токена **до** сетевых fetch (мусорный `alg` не дёргает JWKS и не даёт `Key not found`). HS*, ES*, PS* отклоняются |
| Key confusion | JWKS endpoint резолвится из OIDC discovery (jwks_uri) или привязан к `issuer` /.well-known/jwks.json. RSA-only: `kty === 'RSA'` проверяется до `importKey` (EC/HMAC-ключ в JWKS → `Unsupported key type`), HMAC не поддерживается |
| SSRF (jwks_uri) | `jwks_uri` из discovery резолвится через `new URL(jwks_uri, issuer)` и принимается только same-origin с issuer (protocol + host), иначе игнорируется и используется fallback; редиректы следуются только внутри origin-а issuer (same-origin-проверка каждого hop, лимит 5, `MAX_REDIRECT_HOPS`) — редирект на внутренний/чужой адрес обрывается и трактуется как сбойный fetch |
| Fetch timeout | Все исходящие fetch под `AbortSignal.timeout` (дефолт 15 с, опция `fetchTimeoutMs`) + общий дедлайн на цепочку редиректов (`fetchTotalTimeoutMs`, дефолт 30 с; каждый hop получает `min(fetchTimeoutMs, остаток)`) — зависший IdP или редирект-петля не вешают ingress через in-flight dedup |
| Expiry | `exp`, `iat` и `nbf` проверяются (токен из будущего — `Token not yet valid`); `iat`/`nbf` с допуском на рассинхрон часов (`clockSkewToleranceSec`, дефолт 30 с) |
| Issuer | `iss` проверяется against configured `issuer` (нормализованный: трейлинг-слэш срезан; `payload.iss` нормализуется так же); поле `issuer` discovery-документа (RFC 8414) сверяется с конфигурированным issuer — mismatch → warn + fallback на дефолтный путь |
| Log injection | `kid`, `alg`, `iss` из токена санитизируются (без control chars, усечены до 64 символов) перед попаданием в ошибки/логи |
| Audience | `aud` проверяется если `expectedAudience` задан; `createVerifier({ audience })` используется как default при вызове `verifyAccessToken(token)` без второго аргумента |
| JWKS rotation | Кеш 1 час; kid-miss принудительно форсит refresh (минуя TTL, вне отрицательного окна сбойного fetch и вне grace-периода 5 минут после успешного fetch); по истечении TTL refresh форсится и для известного `kid` (переиспользование kid при ротации); fallback на последний успешный кеш при сбое; отрицательный кеш сбойного fetch 5 минут; JWKS-тело валидируется (массив `keys`) до кеширования |
| Insecure HTTP | `logger.warn` при HTTP issuer, но верификация работает |

### Почему не унифицировать через `@okta/jwt-verifier`

- `@okta/jwt-verifier` привязан к Okta SDK API;
- ingress layer работает с произвольными OIDC-провайдерами (не только Okta);
- hand-rolled верификатор — один модуль на stdlib (сейчас ~600 строк);
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
в модуль, который целиком работает на stdlib. Отклонено.

### Вынести в отдельный пакет

Минус: один модуль (сейчас ~600 строк), один потребитель (`app.js`;
`queue-monitor/auth/oidc.js` — отдельный модуль, зеркалирующий паттерн,
а не импортирующий `oidc-verifier.js`).
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
