# ADR-0018: Ввести pipeline command dispatch (замена router.route)

## Статус

Принято.

## Дата

2026-07-16

## Контекст

Pipeline (`live-pipeline.js`) сейчас линеен: нормализация → `router.route(event, { route: 'identity' })` → отправка. Все входящие события попадают в единый обработчик. Нет механизма для выбора действия на основе содержимого сообщения.

Для системы команд (`/help`, `/id`, `/status`) нужен этап диспатча, который заменяет `router.route()`: если текст начинается с `/`, обработать команду и ответить. Если текст не команда — вернуть «Unknown command».

## Решение

Заменить `router.route()` command dispatch в pipeline:

```text
normalize → isCommand(text)?
  → да:  commandRegistry.lookup(command) → handler(event) → send
  → нет: text-ответ «Unknown command» → send
```

### Новые модули в `core/`

- `command-parser.js` — парсит `/command [args]` из `event.message.text`, возвращает `{ command, args }` или `null`
- `command-registry.js` — статический объект `{ '/help': handler, '/id': handler, '/status': handler }`, lookup по имени команды

### Изменения в `live-pipeline.js`

```text
Было:  normalize → router.route(event, { route: 'identity' }) → send
Стало: normalize → parseCommand(event.message.text)
         → команда: commandRegistry.lookup(name).handler(event) → send
         → не команда: text-ответ «Unknown command» → send
```

`router.route()` больше не вызывается — command dispatch заменил плагиновую маршрутизацию для всех входящих событий.

### Изменения в `dry-run-pipeline.js`

Аналогичное ветвление для паритета тестирования.

### Обработка `bot_added`

Расширить `REPLY_UPDATE_TYPES` на `['message_created', 'bot_added', 'bot_started']`. Для `bot_added` / `bot_started` — автоматический ответ «Ready to help.» без вызова router или command dispatch.

## Почему ветвление, а не middleware

- ADR-0012 отклонил middleware chain
- `if/else` в pipeline проще, чем цепочка middleware
- Pipeline остаётся линейным: два пути, один выход (send)
- Добавление будущих проверок (rate limit, ACL) — дополнительные ветки, не слой middleware

## Почему статический registry, а не plugin-level commands

- Интерфейс плагина `{ name, routes }` (ADR-0012) остаётся без изменений
- Статический объект в `core/` проще для 3-5 команд
- Если команд станет >10, можно перейти на convention-based `commands.js` (новый ADR)

## Почему не расширять event-router

> **Примечание:** `event-router.js` удалён (commit 7585a6f). Раздел сохранён как историческое обоснование решения, принятого до удаления модуля.

- `event-router.js` маршрутизировал по имени route, а не по содержимому текста
- Command dispatch — другая задача: сопоставление `/command` → handler
- Смешение Responsibilities усложнило бы оба механизма

## Последствия

- Добавление команды = одна запись в `command-registry.js`
- Pipeline получает одну дополнительную проверку `if`
- `router.route()` больше не вызывается — command dispatch заменил плагиновую маршрутизацию для всех входящих событий
- Не-командный текст возвращает «Unknown command» вместо identity-ответа
- Решение о типе ответа (welcome / known-command / unknown-command) живёт в общем модуле `pipeline-dispatch.js` (`buildPipelineResponse`). Live и dry-run pipeline потребляют его, поэтому расхождение ветвления структурно невозможно

## Рассмотренные альтернативы

### Middleware chain

Минус: отклонено ADR-0012, избыточно для простого ветвления.

### Расширение event-router

Минус: router маршрутизирует по имени route, не по тексту. Смешение Responsibilities.

### Command dispatch внутри плагина

Минус: нарушает ADR-0012 — плагин получает знание о командной системе, которая не его ответственность.

### Regex-based dispatch

Минус: `startsWith('/')` + split проще и покрывает все нужные случаи. Regex добавляет сложность без выигрыша.
