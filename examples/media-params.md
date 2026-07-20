# Пример параметров Zabbix Media type

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

`HTTPProxy` — необязательный параметр. Заполняется только если Zabbix должен отправлять исходящий запрос через HTTP-прокси.

`RecipientType` — необязательный, по умолчанию `chat_id`. Указывается только если нужна личная отправка (`user_id`).  
`RecipientType` и `To` заполняются согласованно:

```text
RecipientType: user_id
To: <MAX_USER_ID>

RecipientType: chat_id
To: <MAX_CHAT_ID>
```

Порядок получения идентификатора получателя описан в `examples/recipient-id.md`.

Чек-лист повторного создания или переноса Media type приведен в `examples/media-type-recreate-checklist.md`.

Для боевой настройки токен и идентификатор получателя не хранятся в репозитории и задаются только в настройках Zabbix или защищенном рабочем контуре.
