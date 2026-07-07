# Чек-лист повторного создания Zabbix Media type MAX

Документ описывает безопасный порядок повторного создания или переноса Media type `MAX` в другую среду Zabbix.

В репозитории не хранятся реальные токены, идентификаторы получателей, внутренние адреса и скриншоты с чувствительными значениями.

## 1. Создание Media type

В Zabbix создать новый способ оповещения:

```text
Имя: MAX
Тип: Webhook
Время ожидания: 10s
Обработка тегов: no
Добавить запись в меню события: no
Активировано: yes
```

В поле скрипта вставить содержимое:

```text
src/zabbix-media-type/max-webhook.js
```

## 2. Параметры Media type

Заполнить параметры по шаблону:

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

## 3. Значения, которые задаются только в целевой среде

```text
Token: токен бота MAX
To: идентификатор получателя MAX
RecipientType: user_id или chat_id
HTTPProxy: HTTP-прокси, если он нужен в целевой среде
```

`Token` и фактическое значение `To` не переносятся через репозиторий.

## 4. Проверка RecipientType и To

Проверить соответствие:

```text
Личная отправка пользователю: RecipientType = user_id, To = <MAX_USER_ID>
Отправка в групповой чат:   RecipientType = chat_id, To = <MAX_CHAT_ID>
```

Порядок получения идентификатора получателя описан в `examples/recipient-id.md`.

## 5. Проверка после создания или переноса

После сохранения Media type выполнить проверки:

```text
Media type enabled: yes
Token заполнен в Zabbix: yes
To задан в Zabbix или через пользовательский Media: yes
RecipientType соответствует To: yes
HTTPProxy заполнен только при необходимости: yes/no
Тестовое сообщение доставлено: yes/no
Problem доставлен: yes/no
Recovery доставлен: yes/no
Telegram-канал не изменялся: yes
```

## 6. Что не переносить через репозиторий

```text
реальный Token
реальный user_id
реальный chat_id
внутренние адреса
скриншоты с чувствительными значениями
экспорт Zabbix с заполненными секретами
```

## 7. Результат проверки

Результат ручной проверки фиксируется только обезличенно:

```text
Media type: MAX
Recipient type: user_id/chat_id
HTTPProxy used: yes/no
Test message delivered: yes/no
Problem delivered: yes/no
Recovery delivered: yes/no
Unresolved macros: yes/no
Status: done/failed/partial
```
