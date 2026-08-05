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

> Конфигурация бота — файл `zyablik.config.json` как источник правды для
> управляемых настроек (ADR-0045), управление через web UI «Настройки»
> (ADR-0046). В `.env` остаются bootstrap (`ZYABLIK_CONFIG`), секреты
> (`$VAR`-ссылки в файле) и неизменяемая база (`MAX_API_URL`,
> IdP-регистрация). Быстрый старт: раздел 10; полный runbook —
> `docs/runbooks/config-file.md`.

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
cd /root/nanoidp
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
  -u 'zabbix-bot:<client-secret>' \
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

### 8.4 Мониторинг Zabbix (опционально)

Agent-less шаблон мониторинга (ADR-0043) собирает метрики очереди через
`/api/metrics/*` и `/readyz` без установки Zabbix agent:

1. Импортировать в Zabbix 7.0+ шаблон
   `docs/zabbix-template/zyablik-monitoring-template.yaml`
   (**Data collection -> Templates -> Import**, Create missing/Update existing).
   Шаблон включает 14 items, 1 LLD-правило, 4 триггера, 2 графика и
   дашборд «Обзор очереди» (Data collection -> Templates -> <шаблон> ->
   Dashboards).
2. Привязать шаблон **Zyablik monitoring** к хосту бота.
3. Задать на уровне хоста макросы: `{$ZYABLIK.URL}` (например,
   `http://bot.example.internal`), `{$ZYABLIK.PORT}` (`9000`) и
   `{$ZYABLIK.API_KEY}` — реальный токен `METRICS_API_KEY`.

Локальная проверка импорта в Docker-Zabbix 7.2:

```bash
cd docs/zabbix-template/scripts
docker compose up -d --wait
node import-and-verify.js
docker compose down -v
```

Подробности: `docs/zabbix-monitoring-template.md`.

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

## 10. Конфигурация файлом + docker compose (ADR-0045/0046)

Управляемые настройки бота задаются файлом `zyablik.config.json` (источник
правды), а не env-переменными. В `.env` остаются bootstrap
(`ZYABLIK_CONFIG`), секреты (`MAX_BOT_TOKEN`, `METRICS_API_KEY`,
`SESSION_SECRET`, `IDP_CLIENT_SECRET` — в файле они только `$VAR`-ссылками)
и неизменяемая база (`MAX_API_URL`, IdP-регистрация).

### 10.1 Первый запуск: --generate-config

Из существующего `.env`-стенда создаётся первый конфиг-файл:

```bash
# Просмотр без записи:
node src/bot-platform/app.js --generate-config --dry-run

# Запись ./config/zyablik.config.json (не перезаписывает существующий):
node src/bot-platform/app.js --generate-config
```

### 10.2 Структура файла

```json
{
  "version": 1,
  "bot": { "logLevel": "info", "maxTransportMode": "long_polling",
           "maxBotToken": "$MAX_BOT_TOKEN" },
  "queue": { "enabled": false },
  "ingress": { "enabled": false },
  "monitor": { "enabled": true, "port": 9000,
               "metricsApiKey": "$METRICS_API_KEY",
               "sessionSecret": "$SESSION_SECRET" },
  "plugins": {}
}
```

Секреты — только `$VAR`-ссылки формата `^$[A-Z0-9_]+$`. Схема и версия —
в `docs/runbooks/config-file.md`.

### 10.3 Управление через web UI

Dashboard → **Настройки**: просмотр effective-конфига (секреты — только
статус «задан/не задан»), форма из merged-схемы, staged → diff → Apply
(рестарт) → `pending/confirmed/rolled_back`, Rollback, Export/Import.

### 10.4 Запуск в docker (стенд, ADR-0044)

```bash
docker compose up -d --build
docker compose run --rm zyablik node src/bot-platform/app.js --generate-config
```

`./config` монтируется writable volume; Stage/Apply/Rollback пишут
`.lkg`/`.pending`/`.staged` рядом с активным конфигом. Dashboard —
`http://localhost:9000/`, ingress — `http://localhost:8443`.

## 11. HTTPS через Nginx reverse proxy (опционально)

HTTP-серверы bot-platform (ingress `8443`, dashboard `9000`) по умолчанию
работают на plain HTTP. TLS-терминирование выполняется внешним reverse proxy
(ADR-0026). Полная инструкция по установке и настройке Nginx для локального
стенда — в `docs/runbooks/nginx-reverse-proxy.md`.

Кратко после установки Nginx:

```text
POST /ingest → https://<stand-host>/ingest → http://127.0.0.1:8443
dashboard   → https://<stand-host>/        → http://127.0.0.1:9000
IdP (NanoIDP) → https://<stand-host>:8444  → http://127.0.0.1:8000
```

IdP проксируется через Nginx на тот же origin (`:8444`), чтобы вход в дашборд
был same-site: переход `https://<stand-host>` → `http://<stand-host>:8000`
кросс-сайтовый и в реальном Chrome ломает session-cookie IdP (POST `/authorize`
отвечает `400 unsupported_response_type`).

Изменения в настройке после включения Nginx:

```bash
# bot-platform: OAuth2 redirect должен идти через публичный HTTPS-адрес.
# Secure-флаг session cookie зависит от https:// в этом значении.
export IDP_REDIRECT_URI=https://<stand-host>/api/auth/callback

# IdP должен отдаваться на https://<stand-host>:8444 (тот же origin):
export IDP_ISSUER=https://<stand-host>:8444
export IDP_RELAX_SSRF=true     # приватный IP стенда (ADR-0037)

# Бот ходит и к MAX API, и к IdP по HTTPS: бандл из русского корневого CA
# (MAX API) + self-signed сертификат стенда. Файлы в LF (не CRLF), иначе
# Node не прочитает бандл (PEM "bad end line").
export NODE_EXTRA_CA_CERTS=/etc/nginx/ssl/zyablik-ca-bundle.crt
```

```text
# Zabbix Media type (bot-platform-ingest.js):
IngestUrl: https://<stand-host>/ingest
```

```text
# Zabbix Monitoring template (ADR-0043), если порт 9000 закрыт снаружи:
# HTTP Agent в шаблоне ходит на {$ZYABLIK.URL}:{$ZYABLIK.PORT} → /api/metrics/*
{$ZYABLIK.URL}:  https://<stand-host>
{$ZYABLIK.PORT}: 443
```

Zabbix server и другие клиенты должны доверять самоподписанному сертификату
или внутреннему CA (ADR-0026:112). Это касается и Media type, и HTTP Agent
Monitoring template.
