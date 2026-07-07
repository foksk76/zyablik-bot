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
