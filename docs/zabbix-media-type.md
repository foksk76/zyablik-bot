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
Message: {ALERT.MESSAGE}
ParseMode: HTML
RecipientType: chat_id
Severity: {EVENT.SEVERITY}
Subject: {ALERT.SUBJECT}
To: {ALERT.SENDTO}
Token: <скрыто>
Trigger_status: {TRIGGER.STATUS}
```

## Назначение параметров

- `APIUrl` — адрес метода MAX Bot API для отправки сообщений.
- `Message` — тело уведомления из Zabbix.
- `ParseMode` — формат разметки сообщения. Для первого этапа используется `HTML`.
- `RecipientType` — тип получателя: `chat_id` для группового чата или `user_id` для личной отправки.
- `Severity` — уровень важности события Zabbix.
- `Subject` — тема уведомления.
- `To` — идентификатор получателя в МАХ.
- `Token` — токен бота МАХ. В репозитории не хранится.
- `Trigger_status` — статус триггера: проблема или восстановление.

## Тестовое сообщение

```text
APIUrl: https://platform-api2.max.ru/messages
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
