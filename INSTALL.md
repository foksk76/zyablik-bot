# INSTALL

Краткая установка проекта для настройки доставки Zabbix -> МАХ.

## Требования

```text
Node.js >= 20
npm
доступ к Zabbix с правами на Media type
токен MAX Bot API
user_id или chat_id получателя в МАХ
```

Токены и реальные идентификаторы не хранить в репозитории.

## 1. Подготовить рабочую копию

```bash
git clone <repository-url> zabbix-max-alert-bot
cd zabbix-max-alert-bot
npm install --package-lock=false
npm test
```

Если в вашей среде используется lock-файл, вместо `npm install --package-lock=false` можно выполнить `npm ci`.

## 2. Создать Media type в Zabbix

В Zabbix создать новый Media type:

```text
Name: MAX
Type: Webhook
Timeout: 10s
Enabled: yes
```

В поле `Script` вставить содержимое:

```text
src/zabbix-media-type/max-webhook.js
```

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
