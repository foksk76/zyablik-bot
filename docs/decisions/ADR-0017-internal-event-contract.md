# ADR-0017: Ввести внутренний контракт событий (canonical event model) для隔离 плагинов от внешних payload

## Статус

Принято.

## Дата

2026-07-15

## Контекст

MAX API отправляет различные форматы payload в зависимости от типа обновления:

- `bot_started`: `{ user: { user_id } }`
- `bot_added`: `{ chat_id }`
- `message_created`: `{ message: { recipient: { chat_type, chat_id }, sender: { user_id }, text } }`

Плагины должны обрабатывать единый формат событий, не зная о различиях внешних payload. Добавление нового транспорта (не MAX) потребует аналогичной нормализации.

## Решение

Ввести canonical event model в `event-contract.js` и нормализатор в `event-normalizer.js`.

### Внутренний формат события

```js
{
  source: 'max',                    // Источник (максимум: 'max')
  recipient: {
    kind: 'user' | 'chat',         // Тип получателя
    value: '<recipient-value>'      // ID получателя
  },
  message: {
    text: ''                        // Текст сообщения
  },
  raw: {
    kind: 'reference',              // Ссылка на оригинал
    value: '<raw-event-reference>'  // ID события
  }
}
```

### Нормализация MAX payload

`normalizeMaxEvent()` решает сложную задачу определения `recipient.kind`:

1. `bot_started` → `RECIPIENT_KIND_USER` (из `user.user_id`)
2. `bot_added` → `RECIPIENT_KIND_CHAT` (из `chat_id`)
3. `message_created` → определяется по `message.recipient.chat_type`:
   - `dialog` → `RECIPIENT_KIND_USER` (из `message.sender.user_id`)
   - `chat`/`group`/`channel` → `RECIPIENT_KIND_CHAT` (из `recipient.chat_id`)

### Почему `recipient.chat_type` авторитетен для message_created

MAX API отправляет `recipient.chat_id` для ОБОИХ типов сообщений (personal и group). `recipient.chat_id`alone не различает их. `message.recipient.chat_type` — единственный надёжный индикатор.

**Критично**: `message.sender` НЕ используется для group messages — ответ будет отправлен как DM пользователю, а не в чат.

## Почему не передавать raw payload плагинам

- Плагины были бы привязаны к формату MAX API
- Добавление нового транспорта потребует изменения всех плагинов
- Тестирование плагинов потребует воссоздания реальных payload

## Почему не middleware chain

- Event contract проще для плагинов, которые просто форматируют сообщения
- Middleware нужен для cross-cutting concerns (logging, auth)
- ADR-0012 уже отклонил middleware для плагинов

## Почему не TypeScript interfaces

- ADR-0015: нулевые зависимости
- CommonJS с `'use strict'` — runtime валидация через `isSupportedRecipientKind()`
- Достаточно для проекта с 1 плагином

## Последствия

- Плагины получают `createInternalEvent()` output, не знания MAX payload
- Добавление нового транспорта = новый normalizer + расширение `SOURCE_*`
- `raw` поле — reference-only, не передаётся в ответ
- Валидация `recipient.kind` через `RECIPIENT_KINDS.includes()`

## Рассмотренные альтернативы

### Pass-through raw payload

Минус: плагины привязаны к формату транспорта, сложно тестировать.

### Event emitter pattern

Минус: избыточно, неявный flow, сложно отслеживать.

### GraphQL subscriptions

Минус: нарушает ADR-0015, избыточно для простых плагинов.

### JSON Schema validation

Минус: добавляет зависимость, runtime overhead, избыточно для 2 типов получателей.
