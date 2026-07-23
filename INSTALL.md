# INSTALL (v1.0.0)

Краткая установка проекта для настройки доставки Zabbix -> МАХ.

## Требования

```text
Node.js >= 20
npm
make, g++ (для сборки better-sqlite3)
доступ к Zabbix с правами на Media type
токен MAX Bot API
user_id или chat_id получателя в МАХ
```

Для multi-source ingest (HTTP-ingress):

```text
IdP (NanoIDP для MVP / Keycloak для продакшна)
JWT-токен с claim source (например, entitlements: ["zabbix"])
```

Токены и реальные идентификаторы не хранить в репозитории.

## 1. Подготовить рабочую копию

```bash
git clone <repository-url> zyablik-bot
cd zyablik-bot
npm install
npm test
```

Если `better-sqlite3` не собрался, установить build tools:

```bash
# Debian/Ubuntu
sudo apt-get install make g++

# RHEL/CentOS
sudo yum groupinstall "Development Tools"

# macOS
xcode-select --install
```

Затем повторить `npm install`.

## 2. Создать Media type в Zabbix

В Zabbix создать новый Media type:

```text
Name: MAX
Type: Webhook
Timeout: 10s
Enabled: yes
```

В поле `Script` вставить содержимое одного из скриптов:

```text
src/zabbix-media-type/max-webhook.js              — прямой путь (Zabbix → MAX Bot API)
src/zabbix-media-type/bot-platform-ingest.js      — через bot-platform (требует HTTP-ingress и IdP)
```

Выбор зависит от сценария: для простой доставки `max-webhook.js`, для multi-source ingest с очередью — `bot-platform-ingest.js`.

## 3. Заполнить параметры

Минимальный набор параметров:

```text
APIUrl: https://platform-api2.max.ru/messages
HTTPProxy:
Message: {ALERT.MESSAGE}
ParseMode: HTML
RecipientType: chat_id
Severity: {EVENT.SEVERITY}
Subject: {ALERT.SUBJECT}
To: {ALERT.SENDTO}
Token: <MAX_BOT_TOKEN>
Trigger_status: {TRIGGER.STATUS}
```

`HTTPProxy` заполняется только если Zabbix должен ходить в МАХ через HTTP-прокси.

`RecipientType` — необязательный, по умолчанию `chat_id`. Если нужна личная отправка, укажите `user_id`.  
`RecipientType` и `To` должны соответствовать друг другу:

```text
личный пользователь: RecipientType = user_id, To = <MAX_USER_ID>
групповой чат:      RecipientType = chat_id, To = <MAX_CHAT_ID>
```

Подробности есть в `docs/zabbix-media-type.md` и `examples/media-params.md`.

## 4. Проверить доставку

1. Выполнить test send из Media type.
2. Проверить, что сообщение пришло в МАХ.
3. Привязать Media type к тестовому пользователю или группе Zabbix.
4. Проверить Problem-событие.
5. Проверить Recovery-событие.

## 5. Live identity bot

Если нужно получить `user_id` или `chat_id` через ответ бота МАХ, использовать отдельный runbook:

```text
docs/runbooks/live-identity-bot.md
```

Локальный `.env`, токен бота и реальные идентификаторы должны оставаться вне git.

## 6. Очередь доставки (опционально)

Очередь обеспечивает at-least-once доставку сообщений. По умолчанию отключена.

### 6.1 Включить очередь

```bash
export QUEUE_ENABLED=true
```

### 6.2 Настроить параметры (опционально)

```text
QUEUE_MAX_ATTEMPTS=5        — макс. попыток доставки (по умолчанию 5)
QUEUE_INTERVAL_MS=5000      — интервал polling (мс, по умолчанию 5000)
QUEUE_BATCH_SIZE=10         — размер батча (по умолчанию 10)
QUEUE_BACKOFF_BASE=2        — основание экспоненциальной задержки (по умолчанию 2)
QUEUE_BACKOFF_MAX=300       — макс. задержка между попытками (сек, по умолчанию 300)
```

### 6.3 Запустить

```bash
node src/bot-platform/app.js
```

Очередь работает в фоне. Если outbound-отправка не удалась, сообщение будет повторно отправлено с экспоненциальной задержкой.

## 7. HTTP-ingress (опционально)

HTTP-ingress принимает входящие запросы от внешних источников (Zabbix, SIEM и др.) через `POST /ingest`.

### 7.1 Требования

```text
IdP с настроенным OIDC (NanoIDP, Keycloak или Authentik)
JWT-токен с claim source (entitlements или bot_source)
```

Подробнее: `docs/nanoidp-setup.md`

### 7.2 Установить IdP (NanoIDP для MVP)

```bash
cd infra/nanoidp
docker compose up -d
```

### 7.3 Настроить переменные окружения

```bash
export INGRESS_ENABLED=true
export INGRESS_PORT=8443
export IDP_ISSUER=http://localhost:8000
export IDP_AUDIENCE=bot-platform
export JWT_CLAIM_NAME=entitlements
export JWT_CLAIM_VALUE=zabbix
```

### 7.4 Запустить

```bash
node src/bot-platform/app.js
```

Сервер запустится на указанном порту. Запросы принимаются на `POST /ingest`.

### 7.5 Формат запроса

```bash
# Получить токен от NanoIDP
TOKEN=$(curl -s -X POST http://localhost:8000/token \
  -u 'zabbix-bot:zabbix-bot-secret-2024' \
  -d 'grant_type=client_credentials' | jq -r '.access_token')

# Отправить событие
curl -X POST http://localhost:8443/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": { "kind": "user", "value": "<MAX_USER_ID>" },
    "message": "Test alert from Zabbix"
  }'
```

### 7.6 Нормализаторы

Поддерживаемые источники:

```text
zabbix — Zabbix alerts (по умолчанию)
```

Для добавления нового источника создать нормализатор в `src/bot-platform/ingress/normalizers/` и зарегистрировать в `index.js`.

## 8. Dashboard queue-monitor (опционально)

Dashboard показывает метрики очереди доставки в реальном времени: статусы, топы, ошибки, временные ряды.

### 8.1 Включить dashboard

```bash
export MONITOR_ENABLED=true
export METRICS_API_KEY=<сгенерировать-токен>
```

`METRICS_API_KEY` — обязательный токен для доступа к `/api/metrics/*`. Нужен внешним системам мониторинга (Zabbix, Prometheus, curl). UI dashboard использует session auth после OAuth2 логина — повторный ввод ключа не требуется (ADR-0035).

### 8.2 Настроить OAuth2 UI login (опционально)

```bash
export IDP_CLIENT_ID=dashboard
export IDP_CLIENT_SECRET=<client-secret>
export IDP_REDIRECT_URI=http://localhost:9000/api/auth/callback
export SESSION_SECRET=<сгенерировать-секрет>
```

Если OAuth2 не настроен, dashboard работает в режиме Bearer-only (без UI login).

#### Rate limiting auth-эндпоинтов (опционально)

При включённом OAuth2 `/api/auth/login` и `/api/auth/callback` защищены
rate limiter'ом (Sprint 23): 20 запросов на 60с окно + не более 5
одновременно идущих callback'ов (callback делает исходящие запросы к IdP).
При превышении — `429 Too Many Requests` с заголовком `Retry-After`.
Защита включена по умолчанию; переменные для тонкой настройки:

```bash
# AUTH_RATE_LIMIT=true               # включить/выключить
# AUTH_RATE_LIMIT_MAX=20             # лимит запросов на окно
# AUTH_RATE_LIMIT_WINDOW_MS=60000    # размер sliding window (мс)
# AUTH_RATE_CONCURRENCY=5            # max одновременных callback'ов
```

#### SSRF-защита IdP-эндпоинтов (опционально)

При включённом OAuth2 все исходящие запросы к IdP (discovery, token, userinfo)
проходят SSRF-проверку (Sprint 23): hostname резолвится, и если хотя бы один
A/AAAA-record попадает в private/reserved/loopback/link-local диапазон
(включая cloud metadata `169.254.169.254`), запрос отклоняется на старте.

```bash
# IDP_REQUIRE_DISCOVERY=false        # true = требовать валидный /.well-known
#                                    #       вместо fallback на /authorize /token /userinfo
```

### 8.3 Запустить

```bash
node src/bot-platform/app.js
```

Dashboard доступен на `http://localhost:9000/`.

## 9. Запуск с очередью и ingress

Для запуска с обеими функциями:

```bash
export QUEUE_ENABLED=true
export INGRESS_ENABLED=true
export INGRESS_PORT=8443
export IDP_ISSUER=http://localhost:8000
export IDP_AUDIENCE=bot-platform
export JWT_CLAIM_NAME=entitlements
export JWT_CLAIM_VALUE=zabbix
export MONITOR_ENABLED=true
export METRICS_API_KEY=<сгенерировать-токен>

node src/bot-platform/app.js
```

Сервер будет:
1. Принимать входящие запросы через HTTP-ingress
2. Ставить сообщения в очередь
3. Отправлять сообщения через MAX Bot API с retry
