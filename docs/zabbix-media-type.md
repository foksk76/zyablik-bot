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
- `ParseMode` — необязательный: формат разметки сообщения (`HTML` или `markdown`). Если не указан, разметка не применяется.
- `RecipientType` — необязательный: тип получателя — `chat_id` (групповой чат) или `user_id` (личная отправка). По умолчанию `chat_id`.
- `Severity` — необязательный: уровень важности события для выбора иконки. Если не указан, используется иконка по умолчанию.
- `Subject` — тема уведомления.
- `To` — идентификатор получателя в МАХ.
- `Token` — токен бота МАХ. В репозитории не хранится.
- `Trigger_status` — необязательный: статус триггера. Если `OK`, сообщение помечается как восстановление (иконка ✅).

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

## Multi-source ingest (v1.0.0)

Multi-source HTTP-ingress реализован и стабилен (ADR-0022—ADR-0029). Проект поддерживает два пути доставки, которые работают одновременно.

### Пути доставки

**Прямой путь** (`src/zabbix-media-type/max-webhook.js`):

```text
Zabbix → max-webhook.js → MAX Bot API → чат/пользователь
```

Путь без дополнительной инфраструктуры. Параметры: `Token` (токен бота MAX), `APIUrl` (`https://platform-api2.max.ru/messages`).

**Путь через bot-platform** (`src/zabbix-media-type/bot-platform-ingest.js`):

```text
Zabbix → bot-platform-ingest.js → POST /ingest (JWT) → Queue → Outbound → MAX Bot API
```

Путь с IdP, JWT-аутентификацией и очередью доставки. Параметры: `Token` (IdP client secret), `ClientId`, `Audience`, `APIUrl` (IdP token endpoint), `IngestUrl` (bot-platform endpoint).

### Сравнение параметров Media type

| Параметр | max-webhook.js (прямой) | bot-platform-ingest.js (через bot-platform) |
|---|---|---|
| `Token` | Токен бота MAX | IdP client-credentials secret |
| `APIUrl` | `https://platform-api2.max.ru/messages` | URL IdP для получения токена |
| `ClientId` | — | IdP client ID |
| `Audience` | — | IdP audience claim |
| `IngestUrl` | — | URL bot-platform ingress |
| Очередь | Нет | Да (at-least-once) |
| Аутентификация | Bearer token (MAX) | JWT (IdP) |

### OAuth client-credentials flow (bot-platform-ingest)

Перед каждым alert `bot-platform-ingest.js` выполняет:

1. `POST <APIUrl>/token` с `grant_type=client_credentials`, `client_id`, `client_secret`, `audience=bot-platform`;
2. Получает `access_token` (JWT) с TTL;
3. Кэширует токен до `expires_in`;
4. Отправляет `POST <IngestUrl>` с `Authorization: Bearer <jwt>`.

### Статус

```text
Реализовано и стабильно (1.0.0):
- ✅ max-webhook.js — прямой путь (Zabbix → MAX Bot API)
- ✅ bot-platform-ingest.js — путь через bot-platform (Zabbix → ingress → queue → MAX)
- ✅ Queue infrastructure: SQLite store, worker, pipeline integration (ADR-0025, ADR-0028)
- ✅ Ingress pipeline: JWT auth, normalizers, HTTP server (ADR-0023, ADR-0024)
- ✅ App wiring: ingress + queue in one process
- ✅ Live test-run обоих путей подтверждён
- ✅ NanoIDP на MVP стенде (docker compose, порт 8000)
```

### bot-platform-ingest.js

Zabbix 7.2 webhook-скрипт для работы через bot-platform ingress. Совместим с Zabbix Media type webhook interface.

**Совместимость с Zabbix 7.2:** чтение параметров из глобальной переменной `value`, `Zabbix.log()`, `HttpRequest`, `return 'OK'` / `throw 'string'`. Синхронное выполнение без async/await. Только Zabbix webhook mode — standalone CLI удалён.

#### Режим работы

```bash
# Zabbix webhook mode (автоматически при запуске в Zabbix sandbox)
# Параметры передаются через value переменную — скрипт парсит JSON.parse(value)
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
| `Audience` | IdP audience claim | `bot-platform` |
| `IngestUrl` | URL bot-platform ingress | `http://localhost:8443/ingest` |

#### Логирование

Скрипт логирует каждый шаг:

Пример лога в Zabbix (Timestamps добавляются инфраструктурой Zabbix):

```text
[2026-07-18T04:25:00.751Z] [bot-platform-ingest] [INFO] Getting token from http://localhost:8000/token
[2026-07-18T04:25:00.846Z] [bot-platform-ingest] [INFO] Token received (expires in 3600s)
[2026-07-18T04:25:00.846Z] [bot-platform-ingest] [INFO] Sending to http://localhost:8443/ingest
[2026-07-18T04:25:00.849Z] [bot-platform-ingest] [INFO] Response status: 200
[2026-07-18T04:25:00.849Z] [bot-platform-ingest] [INFO] Response body: {"status":"queued"}
```
