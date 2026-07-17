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

Преобразует нормализованный MAX update в identity response и отправляет его через injectable outbound client boundary. Long polling runtime использует этот helper через опциональный `processUpdate` callback, а synthetic dry-run path остается без изменений.

### `logger.js`

```text
createSafeLogger({ secrets, config, write })
maskText(value, secrets)
maskValue(value, secrets)
```

Logger маскирует:

- явные секреты, переданные в `secrets`;
- значения чувствительных ключей вроде `token`, `password`, `authorization`, `apiKey`.
