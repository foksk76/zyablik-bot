# Zabbix Media type: MAX

Документ фиксирует минимальные настройки способа оповещения Zabbix для отправки уведомлений в МАХ.

## Общие настройки

```text
Имя: MAX
Тип: Webhook
Время ожидания: 10s
Обработка тегов: no
Добавить запись в меню события: no
Активировано: yes
```

## Параметры

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

## Назначение параметров

- `APIUrl` — адрес метода MAX Bot API для отправки сообщений.
- `HTTPProxy` — необязательный HTTP-прокси для исходящего запроса, если он нужен в среде Zabbix.
- `Message` — тело уведомления из Zabbix.
- `ParseMode` — формат разметки сообщения. Для первого этапа используется `HTML`.
- `RecipientType` — тип получателя: `chat_id` для группового чата или `user_id` для личной отправки.
- `Severity` — уровень важности события Zabbix.
- `Subject` — тема уведомления.
- `To` — идентификатор получателя в МАХ.
- `Token` — токен бота МАХ. В репозитории не хранится.
- `Trigger_status` — статус триггера: проблема или восстановление.

## Получатель уведомления

Параметры `RecipientType` и `To` заполняются парой:

```text
Личная отправка пользователю: RecipientType = user_id, To = <MAX_USER_ID>
Отправка в групповой чат:   RecipientType = chat_id, To = <MAX_CHAT_ID>
```

Значение `To` должно соответствовать выбранному `RecipientType`.

### Получение user_id для личной отправки

1. Пользователь открывает диалог с ботом МАХ.
2. Пользователь отправляет боту тестовое сообщение.
3. Ответственный за настройку получает `user_id` из входящего события бота, журнала тестового обработчика или другого разрешенного инструмента администрирования бота.
4. В Zabbix для пользователя или тестового Media type указывается:

```text
RecipientType: user_id
To: <MAX_USER_ID>
```

5. Выполняется тест Media type или тестовый Action.

### Получение chat_id для группового чата

1. Бот добавляется в тестовый групповой чат МАХ.
2. В чате отправляется тестовое сообщение или выполняется действие, которое формирует входящее событие для бота.
3. Ответственный за настройку получает `chat_id` из входящего события бота, журнала тестового обработчика или другого разрешенного инструмента администрирования бота.
4. В Zabbix для пользователя, группы или тестового Media type указывается:

```text
RecipientType: chat_id
To: <MAX_CHAT_ID>
```

5. Выполняется тест Media type или тестовый Action.

### Безопасность значений

```text
Token: хранится только в Zabbix
To: хранится только в Zabbix или в защищенном рабочем контуре
RecipientType: должен соответствовать типу получателя
Примеры в репозитории: только обезличенные placeholders
```

Реальные токены бота, идентификаторы получателей, внутренние адреса и скриншоты с чувствительными значениями в репозиторий не добавляются.

Дополнительный обезличенный пример приведен в `examples/recipient-id.md`.

## Повторное создание или перенос Media type

Для повторного создания Media type `MAX` в другой среде Zabbix использовать тот же набор общих настроек, параметров и скрипт из:

```text
src/zabbix-media-type/max-webhook.js
```

Минимальный порядок:

1. Создать Media type `MAX` с типом `Webhook`.
2. Вставить актуальный скрипт `src/zabbix-media-type/max-webhook.js`.
3. Заполнить параметры по разделу `Параметры`.
4. В целевой среде задать значения `Token`, `RecipientType`, `To` и при необходимости `HTTPProxy`.
5. Проверить тестовое сообщение.
6. Проверить Problem и Recovery через тестовый Action.
7. Убедиться, что существующие каналы доставки не изменялись.

Значения, которые задаются только в целевой среде:

```text
Token: токен бота MAX
RecipientType: user_id или chat_id
To: <MAX_USER_ID> или <MAX_CHAT_ID>
HTTPProxy: только если нужен исходящий HTTP-прокси
```

Для сверки использовать чек-лист `examples/media-type-recreate-checklist.md`.

## Тестовое сообщение

```text
APIUrl: https://platform-api2.max.ru/messages
HTTPProxy:
Message: Тестовое уведомление из Zabbix
ParseMode: HTML
RecipientType: chat_id
Severity: High
Subject: TEST Zabbix -> MAX
To: <MAX_CHAT_ID>
Token: <MAX_BOT_TOKEN>
Trigger_status: PROBLEM
```

Ожидаемый результат в чате:

```text
⛔ TEST Zabbix -> MAX
Тестовое уведомление из Zabbix
```

## Ограничения MAX Bot API

### Лимит длины сообщения

MAХ Bot API жёстко ограничивает длину поля `text` в теле запроса: **не более 4000 байт**.

Ошибка при превышении:

```json
{"code":"proto.payload","message":"Field 'text' size (4001) must be at most 4000"}
```

**Валидация в bot-platform:**

- HTTP-ingress (`POST /ingest`) отклоняет сообщения > 4000 символов с HTTP 413 до постановки в очередь.
- HTTP-ingress не возвращает тело ошибки MAX API в ответ клиенту — Reject происходит до обращения к MAX API.

**Валидация в max-webhook.js:**

- Прямой путь `max-webhook.js → MAX Bot API` не имеет валидации длины — ошибка возвращается от MAX API напрямую.

### Рекомендации

| Сценарий | Рекомендация |
|---|---|
| Длинные уведомления Zabbix | Обрезать `{ALERT.MESSAGE}` на стороне Zabbix (Macro `{ALERT.MESSAGE:0,3900}`) или в Media type параметрах |
| Кастомные ingest-сообщения | Контролировать длину `message` перед отправкой в `POST /ingest` |
| Диагностика ошибок MAX API | `outbound-client` логирует `responseBody` из ответа MAX API для диагностики |

### Другие ограничения

| Параметр | Значение | Описание |
|---|---|---|
| `text` (MAX API) | ≤ 4000 байт | Жёсткое ограничение protobuf-валидации |
| Request body (ingress) | ≤ 1 МБ | Лимит `maxBodyBytes` в `http-server.js` |
| Retry attempts (queue) | 5 попыток | Настраивается через `QUEUE_MAX_ATTEMPTS` |
| Retry interval | 5 сек (base) | Настраивается через `QUEUE_INTERVAL_MS` |

---

## Planned changes (multi-source ingest)

ADR-0022 расширяет scope проекта на multi-source HTTP-ingress. ADR-0027 определяет интеграцию `max-webhook.js` с IdP (NanoIDP для MVP, Keycloak/Authentik для продакшна). ADR-0028 вводит очередь доставки сообщений для at-least-once guarantee. Ниже — Planned изменения, которые войдут при реализации multi-source ingest:

### Новый путь доставки

Текущий прямой путь (`max-webhook.js → MAX Bot API`) объявляется **deprecated** (ADR-0022). Новый путь:

```text
max-webhook.js → bot-platform POST /ingest → queue (ADR-0028) → outbound → MAX Bot API
```

### Изменения параметров Media type

| Параметр | Было | Стало | Описание |
|---|---|---|---|
| `Token` | Токен бота MAX | `ClientSecret` (IdP) | IdP client-credentials secret |
| `APIUrl` | `https://platform-api2.max.ru/messages` | `https://<bot-platform>/ingest` | Endpoint bot-platform |
| — | — | `ClientId` (новый) | IdP client ID |

Тело запроса меняется на контракт inbound-API (ADR-0022):

```json
{
  "recipient": { "kind": "user|chat", "value": "<id>" },
  "message": "{ALERT.MESSAGE}"
}
```

### OAuth client-credentials flow

Перед каждым alert `max-webhook.js` выполняет:

1. `POST <okta-token-endpoint>` с `grant_type=client_credentials`, `client_id`, `client_secret`, `audience=bot-platform`;
2. Получает `access_token` (JWT) с TTL;
3. Кэширует токен до `expires_in`;
4. Отправляет `POST /ingest` с `Authorization: Bearer <jwt>`.

### Deprecation прямого пути

Прямой путь (`max-webhook.js → MAX Bot API`) удаляется после live-evidence нового ingest-пути (по образцу ADR-0010). Между доказательством и удалением — controlled deprecation period.

### Статус

```text
Реализовано (sprint 14-16):
- ✅ Queue infrastructure: SQLite store, worker, pipeline integration (ADR-0025, ADR-0028)
- ✅ Ingress pipeline: JWT auth, normalizers, HTTP server (ADR-0023, ADR-0024)
- ✅ App wiring: ingress + queue in one process
- ✅ Backward compatibility: direct path still works by default
- ✅ bot-platform-ingest.js — standalone скрипт для Zabbix Media type

В процессе:
- Live test-run ingest path (требует IdP на стенде)
- Deprecation direct path после live-evidence
```

### bot-platform-ingest.js

Standalone скрипт-заменитель `max-webhook.js` для работы через bot-platform ingress.

#### Режимы работы

```bash
# Dry-run — показать что будет отправлено
node src/bot-platform/bot-platform-ingest.js --dry-run --user-id=123 --message="Test"

# Live test — отправить тестовое сообщение через ingress
node src/bot-platform/bot-platform-ingest.js --test --secret=<IDP_CLIENT_SECRET> --user-id=123 --message="Test alert"

# Zabbix webhook mode — читает параметры из stdin
echo '{"Token":"...","To":"123",...}' | node src/bot-platform/bot-platform-ingest.js --zabbix
```

#### Параметры для Zabbix Media type

| Параметр | Описание | Пример |
|---|---|---|
| `Token` | IdP client-credentials secret | `zabbix-bot-secret-2024` |
| `To` | user_id или chat_id в MAX | `123456` |
| `RecipientType` | `user_id` или `chat_id` | `user_id` |
| `Subject` | Тема уведомления | `Host is down` |
| `Message` | Тело уведомления | `{ALERT.MESSAGE}` |
| `Severity` | Уровень важности | `High` |
| `Trigger_status` | Статус триггера | `PROBLEM` |
| `APIUrl` | URL IdP для получения токена | `http://localhost:8000` |
| `ClientId` | IdP client ID | `zabbix-bot` |
| `IngestUrl` | URL bot-platform ingress | `http://localhost:8443/ingest` |

#### Логирование

Скрипт логирует каждый шаг:

```text
[2026-07-18T04:25:00.751Z] [bot-platform-ingest] [INFO] Step 1: Getting token from http://localhost:8000/token
[2026-07-18T04:25:00.846Z] [bot-platform-ingest] [INFO] Step 1: Token received (expires in 3600s)
[2026-07-18T04:25:00.846Z] [bot-platform-ingest] [INFO] Step 2: Sending to http://localhost:8443/ingest
[2026-07-18T04:25:00.849Z] [bot-platform-ingest] [INFO] Step 2: Response status: 200
[2026-07-18T04:25:00.849Z] [bot-platform-ingest] [INFO] Step 2: Response body: {"status":"queued"}
```
