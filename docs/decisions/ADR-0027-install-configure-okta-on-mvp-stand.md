# ADR-0027: Установить и настроить Okta IdP на MVP стенде для live runs

## Статус

Принято.

## Дата

2026-07-17

## Контекст

ADR-0022 фиксирует multi-source ingest с аутентификацией через Okta JWT. ADR-0024 принимает `@okta/jwt-verifier` как исключение из ADR-0015.

Допущение 2 из идеи multi-source-ingest:

> Okta IdP развёрнут и доступен из bot-platform runtime. Без IdP
> JWT-verifier не работает — бот не сможет аутентифицировать источники и
> перестанет доставлять уведомления. Это **принятое** допущение: IdP
> считается высокодоступным корпоративным сервисом, его недоступность
> приравнивается к недоступности сети.

Допущение 3:

> Каждый источник способен получать JWT из Okta. Это нетривиально
> для Zabbix Media type: требуется OAuth client-credentials flow
> (client_id + client_secret, исходящий вызов к Okta token-endpoint,
> обработка TTL/refresh) внутри `max-webhook.js`.

Эти допущения требуют конкретной инфраструктуры на стенде: Okta tenant, JWKS-endpoint, client-приложения для каждого источника, source-mapping.

## Решение

Развернуть Okta IdP конфигурацию на MVP стенде для live runs multi-source ingest.

### Okta Tenant

- **Тип:** корпоративный Okta tenant (organization-level);
- **Issuer URL:** `https://<okta-domain>/oauth2/default` (Okta Authorization Server);
- **JWKS-endpoint:** `https://<okta-domain>/oauth2/default/v1/keys`;
- **Token-endpoint:** `https://<okta-domain>/oauth2/default/v1/token`.

Доступность JWKS-endpoint проверяется из LXC стенда:

```bash
curl -s https://<okta-domain>/.well-known/jwks.json | jq '.keys[0].kid'
```

Ожидаемый результат: `kid` ключа (не пустой, не error).

### Client-приложения (OIDC Apps)

Для каждого источника создаётся отдельное Okta OIDC Application:

| Источник | Тип приложения | Audience | Grant Type |
|---|---|---|---|
| Zabbix | Service (M2M) | `bot-platform` | `client_credentials` |
| SIEM (будущее) | Service (M2M) | `bot-platform` | `client_credentials` |
| Корп. боты (будущее) | Service (M2M) | `bot-platform` | `client_credentials` |

**Zabbix client-приложение:**

- **Name:** `zabbix-bot-platform`;
- **Type:** Service (Machine-to-Machine);
- **Grant Type:** `client_credentials`;
- **Audience:** `bot-platform` (кастомный API audience);
- **Секрет:** `client_secret` (генерируется Okta, хранится в env Media type Zabbix — ADR-0022, ревизия 3).

**Выдача JWT:**

```text
POST https://<okta-domain>/oauth2/default/v1/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=<zabbix-client-id>
&client_secret=<zabbix-client-secret>
&audience=bot-platform
```

**Ответ:**

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### JWT Claims

Каждый JWT содержит стандартные claims:

| Claim | Значение | Описание |
|---|---|---|
| `iss` | `https://<okta-domain>/oauth2/default` | Issuer — Okta Authorization Server |
| `sub` | `<client-id>` | Subject — ID client-приложения |
| `aud` | `bot-platform` | Audience — API identifier |
| `exp` | `<unix-timestamp>` | Expiration (TTL) |
| `iat` | `<unix-timestamp>` | Issued At |
| `kid` | `<key-id>` | Key ID для JWKS-верификации |
| `scp` | `["bot.ingest"]` | Scope — право на ingest |

**Кастомный claim для source-mapping:**

| Claim | Значение | Описание |
|---|---|---|
| `bot_source` | `zabbix` | Источник уведомления (для per-source normalizer) |

> **Примечание:** Выбор между `aud` (отдельный audience на источник) и кастомным claim `bot_source` — open question из идеи. ADR фиксирует кастомный claim как MVP-решение: один `aud` (`bot-platform`) для всех источников, source определяется по `bot_source`. Это проще для конфигурации Okta (один audience, разные client-приложения с разными `bot_source` values).

### Source-mapping

Source-mapping определяет, какой normalizer использовать для каждого источника. Конфигурация в `.env` стенда:

```text
# Source mapping: kid → source (для определения normalizer)
SOURCEMapping={"zabbix": {"kid": "<okta-key-id>", "source": "zabbix"}}
```

> **Примечание:** Точная форма source-mapping (kid-based vs aud-based vs bot_source-based) — open question. МVP использует `bot_source` claim. Формат конфигурации будет определён при реализации `JwtSourceAuth`.

### Zabbix Media type — интеграция с Okta

Текущий `max-webhook.js` получает `Token` параметр (статичный токен). После ADR-0022/0024:

1. `Token` параметр переименовывается в `ClientSecret` (или добавляется новый параметр);
2. `max-webhook.js` выполняет OAuth client-credentials flow перед отправкой:
   - `client_id` = из параметра Media type;
   - `client_secret` = из параметра Media type (env);
   - вызов token-endpoint Okta;
   - кэш токена до `expires_in`;
   - `Authorization: Bearer <jwt>` в заголовке к bot-platform;
3. URL и body меняются на endpoint bot-platform (`POST /ingest`).

Это отражено в `docs/zabbix-media-type.md` (правило AGENTS.md).

### Хранение секретов

| Секрет | Где хранится | Не коммитится |
|---|---|---|
| `client_id` (Zabbix) | env Media type Zabbix | да |
| `client_secret` (Zabbix) | env Media type Zabbix | да |
| Okta domain | env Media type Zabbix + bot-platform `.env` | да |
| Okta issuer URL | bot-platform `.env` | да |
| Bot API token | bot-platform `.env` | да |

Все секреты хранятся в `.env` файлах на стенде, исключены из `.gitignore`.

### Проверка работоспособности

После настройки Okta:

1. **JWKS доступен:**
   ```bash
   curl -s https://<okta-domain>/oauth2/default/v1/keys | jq '.keys | length'
   # Ожидаемый результат: >= 1
   ```

2. **Client-credentials flow работает:**
   ```bash
   curl -s -X POST https://<okta-domain>/oauth2/default/v1/token \
     -H 'Content-Type: application/x-www-form-urlencoded' \
     -d 'grant_type=client_credentials&client_id=<id>&client_secret=<secret>&audience=bot-platform'
   # Ожидаемый результат: JSON с access_token
   ```

3. **JWT-верификация работает:**
   ```bash
   node -e "
     const OktaJwtVerifier = require('@okta/jwt-verifier');
     const verifier = new OktaJwtVerifier({ issuer: 'https://<okta-domain>/oauth2/default' });
     verifier.verifyAccessToken('<jwt>', 'bot-platform')
       .then(c => console.log('OK', c.claims))
       .catch(e => console.error('FAIL', e.message));
   "
   # Ожидаемый результат: OK { sub: '...', bot_source: 'zabbix', ... }
   ```

4. **bot-platform ingress принимает JWT:**
   ```bash
   curl -X POST https://<ingress-endpoint>/ingest \
     -H 'Authorization: Bearer <jwt>' \
     -H 'Content-Type: application/json' \
     -d '{"recipient":{"kind":"user","value":"<synthetic-id>"},"message":"test"}'
   # Ожидаемый результат: 200 OK или 4xx (валидация payload)
   ```

### TTL токена

- **Рекомендуемый TTL:** 3600 секунд (1 час);
- **Обоснование:** баланс между frequency alertов ( Zabbix шлёт alerts не чаще раза в минуту) и security ( shorter TTL = лучше);
- **Refresh:** Zabbix Media type запрашивает новый токен перед каждым alert (token-endpoint call), кэширует до `expires_in`;
- **При недоступности Okta:** токен не выдаётся → alert не доставляется (сознательное решение, допущение 2).

## Почему Okta tenant, а не per-source JWKS

- Okta как единый trust-anchor — последовательное решение (ADR-0024);
- Per-source JWKS = управление ключами на каждом источнике, ротация, trust-anchor размывается;
- Okta даёт централизованный аудит выдачи токенов.

## Почему `bot_source` claim, а не отдельный audience

- Один `aud` (`bot-platform`) проще для конфигурации Okta;
- Несколько audience = несколько API в Okta, сложнее management;
- `bot_source` claim — кастомный, добавляется через Okta token hooks или custom claims;
- При росте числа источников — не нужно менять audience-конфигурацию.

## Почему client_credentials, а не authorization_code

- Zabbix — M2M (machine-to-machine), нет user interaction;
- `client_credentials` — стандартный grant для server-to-server;
- `authorization_code` требует browser redirect — не применимо для Zabbix Media type.

## Последствия

- Okta tenant конфигурируется для MVP (один audience, один client для Zabbix);
- `max-webhook.js` получает OAuth client-credentials flow;
- `JwtSourceAuth` верифицирует JWT через `@okta/jwt-verifier` (ADR-0024);
- Source-mapping определяет normalizer по `bot_source` claim;
- Секреты хранятся в env, не в репозитории;
- Недоступность Okta блокирует доставку (сознательное решение).

## Рассмотренные альтернативы

### Static shared-token (без Okta)

Минус: нет централизованного отзыва, нет аудита, нет стандартизированных claims. Убрано из MVP в ревизии 2. Отклонено.

### Per-source JWKS (каждый источник — свой issuer)

Минус: размывает trust-anchor, управление ключами на каждом источнике, ротация. Отклонено в пользу Okta.

### `introspection` endpoint вместо JWKS

Минус: каждый запрос = вызов к Okta (latency, availability). JWKS-кэш даёт zero per-request latency. Отклонено.

### Authorization code flow для Zabbix

Минус: требует browser interaction, не применимо для M2M. `client_credentials` — стандарт. Отклонено.
