# ADR-0020: Расширить scope pipeline для обработки `bot_added` событий

## Статус

Принято.

## Дата

2026-07-16

## Контекст

`live-pipeline.js` фильтрует события по `REPLY_UPDATE_TYPES`:

```js
const REPLY_UPDATE_TYPES = Object.freeze(['message_created']);
```

`bot_added` и `bot_started` игнорируются. Конфигурация long polling (`config.js:8`) уже собирает `bot_added`:

```js
const DEFAULT_MAX_POLL_TYPES = Object.freeze(['message_created', 'bot_started', 'bot_added']);
```

Для системы команд нужна автоматическая отправка приветствия при добавлении бота в группу (`bot_added`). Текущий фильтр это блокирует.

## Решение

Расширить `REPLY_UPDATE_TYPES` на `['message_created', 'bot_added']`.

### Обработка `bot_added` в pipeline

`bot_added` обрабатывается **до** command dispatch:

```text
normalize → updateType === 'bot_added'?
  → да:  send(welcomeMessage) — return
  → нет: parseCommand → command dispatch → send
```

### Приветственное сообщение

```text
Ready to help.
```

Короткое, без inline вывода `/help`. Пользователь запускает `/help` явно.

### Формат ответа

Pipeline формирует text-ответ (ADR-0019) с `event.recipient`:

```js
{
  kind: 'text',
  text: 'Ready to help.',
  recipient: event.recipient
}
```

## Почему `bot_added`, а не `bot_started`

- `bot_added` — бот добавлен в **группу** (chat). Ответ идёт в чат, виден всем участникам.
- `bot_started` — пользователь начал диалог в **личном** сообщении. Автоматическое приветствие в личке может быть навязчивым.
- Групповой контекст — основной use case для Zabbix-уведомлений.

## Почему не вызывать `/help` автоматически

- `/help` выводит список команд — это информационный ответ, не приветствие
- Автоматический вывод `/help` при добавлении в чат перегружает интерфейс
- «Ready to help.» — достаточно, чтобы пользователь знал: бот работает и готов к командам

## ~~Почему не обрабатывать `bot_started`~~ (устарело — см. ADR-0021)

- `bot_started` — личный контекст, автоматическое приветствие может раздражать
- Если позже понадобится — новый ADR с обоснованием

> **Обновлено (ADR-0021):** `bot_started` теперь обрабатывается — см. ADR-0021. Данная секция устарела.

## Последствия

- `REPLY_UPDATE_TYPES` расширяется с 1 на 2 элемента (позже ADR-0021 расширил до 3)
- Pipeline получает дополнительную проверку `updateType === 'bot_added'` перед command dispatch
- Outbound client поддерживает text-ответы (ADR-0019)
- Существующие тесты `identity-update-filter.test.js` требуют обновления (маппинг `bot_added` с `mode: 'ignored'` → `mode: 'live'`/`mode: 'dry-run'`)

## Рассмотренные альтернативы

### Автоматический `/help` при `bot_added`

Минус: перегружает интерфейс, длинный вывод при первом контакте.

### Обработка `bot_started` аналогично

> **Обновлено (ADR-0021):** Эта альтернатива позже принята в ADR-0021 — `bot_started` теперь обрабатывается.

Минус (на момент ADR-0020): навязчиво в личном контексте. Нет текущей потребности.

### Обработка всех update types

Минус: `bot_stopped`, `bot_removed`, `chat_title_changed` и др. не требуют ответа. Расширение scope без необходимости.

### Вынос `bot_added` в отдельный pipeline

Минус: дублирование HTTP-логики (normalize, send). Избыточно для одного дополнительного update type.
