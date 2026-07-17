# Bot-platform core

Core содержит минимальные контракты bot-platform.

## Internal event contract

Файл:

```text
event-contract.js
```

Назначение:

```text
MAX transport normalizes incoming event -> internal event -> pipeline (command dispatch + identity handler)
```

## Event shape

```text
{
  source: 'max',
  recipient: {
    kind: 'user' | 'chat',
    value: '<recipient-value>'
  },
  message: {
    text: '<message-text>'
  },
  raw: {
    kind: 'reference',
    value: '<raw-event-reference>'
  }
}
```

## Recipient kind

| Kind | Meaning | Zabbix recipient type |
|---|---|---|
| `user` | personal user | `user_id` |
| `chat` | group chat | `chat_id` |

## Security rules

- Использовать synthetic values в тестах и документации.
- Не хранить реальные идентификаторы в репозитории.
- Не передавать raw event в ответ пользователю автоматически.
- Не выполнять network calls на уровне contract.
- Не хранить состояние на уровне contract.

## Exports

```text
SOURCE_MAX
RECIPIENT_KIND_USER
RECIPIENT_KIND_CHAT
RECIPIENT_KINDS
isSupportedRecipientKind(kind)
createInternalEvent(input)
```

## Config and logger

`config.js` и `logger.js` добавляют минимальный runtime-контракт для будущих задач третьего этапа.

### `config.js`

```text
createBotPlatformConfig(environment)
createLiveRuntimeConfig(environment)
```

`createBotPlatformConfig` читает `MAX_TRANSPORT_MODE` из environment и по умолчанию использует `long_polling`.
Допустимые значения: `long_polling`, `webhook`.

`createLiveRuntimeConfig` строит discriminated live runtime contract:

```text
{ mode: "long_polling", ...validatedLongPollingConfig }
{ mode: "webhook", error: { code: "TRANSPORT_NOT_IMPLEMENTED", message: "Не реализовано: transport mode webhook" } }
```

Для `long_polling` live config требует заполненные `MAX_API_URL` и `MAX_BOT_TOKEN`. Ошибка валидации не раскрывает секреты и использует code `CONFIG_VALIDATION_ERROR`.

### `live-pipeline.js`

```text
createIdentityUpdateProcessor({ outboundClient, commandRegistry, identityHandler, outboundClientOptions })
```

Преобразует нормализованный MAX update в response и отправляет его через injectable outbound client boundary. Long polling runtime использует этот helper через опциональный `processUpdate` callback, а synthetic dry-run path остается без изменений.

Ветвление (ADR-0018): `bot_added`/`bot_started` → приветствие; иначе `parseCommand` → command dispatch → send; не-команда → «Unknown command» reply.

### `command-parser.js`

```text
parseCommand(text)
```

Парсит `/command [args]` из `event.message.text` (ADR-0018). Возвращает `{ command, args }` (command в нижнем регистре, с ведущим `/`) или `null`, если текст не начинается с `/` или команда пуста.

### `pipeline-dispatch.js`

```text
buildPipelineResponse(event, updateType, commandRegistry)
```

Чистая функция (ADR-0018): принимает нормализованный `event`, `updateType` и `commandRegistry`, возвращает объект response для отправки. Не вызывает outbound client — это ответственность pipeline. Ветвление:

- `bot_added` / `bot_started` → приветствие (`WELCOME_TEXT`)
- `message_created` с `/command` → `commandRegistry.lookup(name).handler(event)`
- иначе → «Unknown command»

Оба pipeline (`live-pipeline.js`, `dry-run-pipeline.js`) потребляют этот модуль, что делает расхождение ветвления структурно невозможным.

### `command-registry.js`

```text
createCommandRegistry({ identityHandler })
```

Статический реестр команд (ADR-0018): `/help`, `/id`, `/status`. `lookup(commandName)` возвращает `{ description, handler }` или `null`. `getCommandList()` возвращает `[{ name, description }]` для `/help`. Обработчик `/id` делегирует в `identityHandler` (DI через options), с text-fallback, если handler не передан.

### `pipeline-constants.js`

Константы pipeline: `REPLY_UPDATE_TYPES` (`['message_created', 'bot_added', 'bot_started']` — ADR-0020, ADR-0021), `WELCOME_TEXT`, `UNKNOWN_COMMAND_TEXT`, `RECIPIENT_TYPE_MAP` (внутренний `kind` → MAX API параметр: `user` → `user_id`, `chat` → `chat_id`).

### `logger.js`

```text
createSafeLogger({ secrets, config, write })
maskText(value, secrets)
maskValue(value, secrets)
```

Logger маскирует:

- явные секреты, переданные в `secrets`;
- значения чувствительных ключей вроде `token`, `password`, `authorization`, `apiKey`.
