# Task 12.2 spec: internal event contract

Документ подготовлен по skill `spec-driven-development`.

## Status

```text
Implemented / CI pending
```

## Goal

Зафиксировать минимальный внутренний формат события bot-platform, с которым будут работать будущие transport modules и plugins.

Contract нужен для следующих задач:

```text
MAX event normalizer -> internal event -> event router -> identity plugin
```

## Scope

Входит:

- описать минимальный event shape;
- определить допустимые значения recipient kind;
- добавить helper для создания internal event;
- добавить helper для проверки recipient kind;
- добавить README рядом с core module;
- добавить unit-тесты event contract.

Не входит:

- полная модель всех событий МАХ;
- real MAX payload;
- fixtures входящих событий;
- network listener;
- outbound transport;
- хранение событий;
- production audit schema.

## Internal event shape

Минимальный объект события:

```text
{
  source: 'max',
  recipient: {
    kind: 'user' | 'chat',
    value: '<synthetic-or-runtime-value>'
  },
  message: {
    text: '<message text or empty string>'
  },
  raw: {
    kind: 'reference',
    value: '<non-sensitive reference or synthetic object>'
  }
}
```

## Recipient kinds

Допустимые значения:

| Kind | Назначение | Будущее соответствие Zabbix |
|---|---|---|
| `user` | личный пользователь | `RecipientType: user_id` |
| `chat` | групповой чат | `RecipientType: chat_id` |

## Security rules

- Contract не должен требовать реальных идентификаторов в репозитории.
- Тесты используют только synthetic values.
- Raw event не должен автоматически попадать в ответ identity plugin.
- Contract не выполняет сетевые запросы.
- Contract не хранит состояние.

## Module contract

Файл:

```text
src/bot-platform/core/event-contract.js
```

Ожидаемые exports:

```text
SOURCE_MAX
RECIPIENT_KIND_USER
RECIPIENT_KIND_CHAT
RECIPIENT_KINDS
isSupportedRecipientKind(kind)
createInternalEvent(input)
```

## Acceptance criteria

- [x] Event contract описан.
- [x] Contract не содержит реальных идентификаторов.
- [x] Contract поддерживает `user` и `chat` recipient kinds.
- [x] Есть helper `isSupportedRecipientKind`.
- [x] Есть helper `createInternalEvent`.
- [x] Есть unit-тесты.
- [ ] `npm test` подтвержден локально или в GitHub Actions.

## Verification

- [x] Unit-тест проверяет `user` kind.
- [x] Unit-тест проверяет `chat` kind.
- [x] Unit-тест проверяет unknown kind.
- [x] Unit-тест проверяет создание internal event без real payload.
- [ ] GitHub Actions green после commit.

## Next tasks

```text
Task 12.3: добавить обезличенные fixtures входящих событий
Task 12.4: реализовать MAX event normalizer без сети
```
