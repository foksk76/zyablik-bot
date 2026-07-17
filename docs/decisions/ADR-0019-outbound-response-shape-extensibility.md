# ADR-0019: Расширить outbound response shape для поддержки text-only ответов

## Статус

Принято.

## Дата

2026-07-16

## Контекст

`buildMaxOutboundPayload()` в `outbound-client.js` хардкодит форму ответа:

```js
if (response.kind !== 'identity' || !response.zabbix) {
  throw new Error('Invalid identity response');
}
```

Команды (`/help`, `/status`, `/id`) возвращают текст без полей `zabbix`. Outbound client отвергнет такие ответы.

ADR-0017 определяет **входной** контракт событий, но **выходной** контракт ответов формально не задан. Существующая неявная формула `{ kind: 'identity', zabbix: { recipientType, to }, text }` работает только для identity-плагина.

## Решение

Расширить `buildMaxOutboundPayload()` для поддержки двух форм:

### Identity-ответ (существующий)

```js
{
  kind: 'identity',
  text: '...',
  zabbix: { recipientType: 'user_id', to: '12345' }
}
```

### Text-ответ (новый)

```js
{
  kind: 'text',
  text: '...',
  recipient: { kind: 'chat', value: '2002' }
}
```

### Внутренний контракт ответов

```text
Response = IdentityResponse | TextResponse

IdentityResponse: { kind: 'identity', text, zabbix: { recipientType, to } }
TextResponse:     { kind: 'text',     text, recipient: { kind, value } }
```

### Изменения в `outbound-client.js`

- `buildMaxOutboundPayload()` — ветвление по `response.kind`:
  - `'identity'` → существующая логика (извлекает `recipientType`, `to` из `response.zabbix`)
  - `'text'` → новая логика (извлекает `recipientType`, `to` из `response.recipient.kind` + `response.recipient.value`)
- `buildLiveOutboundBody()` — без изменений (принимает `text`, `notify`, `format`)
- `buildMaxOutboundRequest()` — без изменений (использует `buildMaxOutboundPayload()` для URL)

### Как pipeline передаёт recipient info для команд

Команды не знают о recipient. Pipeline передаёт `event.recipient` в командный handler, который включает его в ответ:

```js
// command handler
function handleHelp(event) {
  return {
    kind: 'text',
    text: 'Available commands: /help, /id, /status',
    recipient: event.recipient  // ← из normalized event
  };
}
```

## Почему два kind, а не один универсальный

- Identity-ответ несёт `zabbix` поля — специфика Zabbix Media type
- Text-ответ несёт `recipient` — специфика pipeline/transport
- Смешение в одном формате усложнит валидацию
- Каждый kind чётко соответствует своему source (plugin vs command)

## Почему не передавать recipient отдельно от response

- Pipeline уже не знает recipient для команд (команда — core, не plugin)
- Включение `recipient` в response делает ответ самодостаточным
- Outbound client не зависит от pipeline — получает полный response

## Последствия

- `buildMaxOutboundPayload()` ветвится по `response.kind`
- Существующие identity-тесты продолжают работать (ветка `kind === 'identity'`)
- Новые тесты покрывают text-ветку
- Добавление нового `kind` в будущем — новая ветка в `buildMaxOutboundPayload()`

## Рассмотренные альтернативы

### Один универсальный формат `{ text, routing }`

Минус: `routing` для identity — `{ recipientType, to }`, для text — `{ kind, value }`. Формат не универсален, а `routing` — union type, который сложнее валидировать.

### Pipeline преобразует text-ответ в identity-ответ

Минус: pipeline должен знать о zabbix-полях, которые его не касаются. Нарушение разделения ответственности.

### Отдельный outbound client для команд

Минус: дублирование HTTP-логики, два клиента для одного API. Избыточно.
