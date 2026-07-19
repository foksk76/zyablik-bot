# Task 18 Live MAX Identity Bot Acceptance Run

Дата: 2026-07-15
Время: 10:50-10:51 UTC

## Проверка

### 18.9: Live personal-dialog user_id

- Входящее сообщение: пользователь отправил сообщение боту в личном диалоге MAX
- Ответ бота: получен ответ с `RecipientType: user_id` и корректным `To`
- MAX Bot API: `POST /messages` вернул `200 OK`
- Время: 10:50 UTC

### 18.10: Live chat chat_id

- Входящее сообщение: сообщение в групповом чате MAX
- Ответ бота: получен ответ с `RecipientType: chat_id` и корректным `To`
- MAX Bot API: `POST /messages` вернул `200 OK`
- Время: 10:51 UTC

## Результат

Live-приемка MAX Identity Bot выполнена:

- [x] Реальное входящее сообщение МАХ обработано
- [x] Реальный ответ через MAX Bot API отправлен
- [x] Ответ `RecipientType: user_id` в личном диалоге подтвержден
- [x] Ответ `RecipientType: chat_id` в chat-сценарии подтвержден
- [x] Реальные токены и идентификаторы не хранятся в репозитории

## Примечания

- Сервис `zyablik-bot-live.service` обработал live-обновления через long polling
- Transport mode: `long_polling`
- Network enabled: `true`
- Identity plugin корректно форматирует ответ с параметрами для Zabbix
