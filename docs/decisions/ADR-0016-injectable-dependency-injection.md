# ADR-0016: Использовать инъекцию зависимостей через options объект во всех модулях

## Статус

Принято.

## Дата

2026-07-15

## Контекст

Bot-platform содержит модули, которые зависят от внешних сервисов (HTTP-клиент, long-polling, логгер, update processor). Тестирование этих модулей требует мокирования зависимостей без сторонних библиотек (ADR-0015).

Паттерн: каждый модуль принимает options объект с fallback на реальную реализацию.

## Решение

Единый паттерн инъекции зависимостей через options:

```js
function createSomeModule(options = {}) {
  const logger = options.logger || createSafeLogger({ ... });
  const httpClient = options.httpClient || createNativeFetchHttpClient({ ... });
  const sleep = options.sleep || defaultSleep;
  // ...
}
```

### Покрытие

| Модуль | Инжектируемые зависимости |
|--------|--------------------------|
| `live-service.js` | `httpClient`, `inboundClient`, `outboundClient`, `processUpdate`, `pollUpdates`, `logger`, `fetchBinary`, `httpTimeoutMs`, `sleep` |
| `long-polling.js` | `pollUpdates`, `sleep`, `logger`, `onUpdate`, `onError`, `processUpdate` |
| `outbound-client.js` | `httpClient`, `logger` |
| `inbound-updates.js` | `httpClient`, `logger` |
| `dry-run-pipeline.js` | `routeHandlers` |
| `app.js` | `routeHandlers`, `pollUpdates`, `logger` |

### childScriptOverride

Специальный хук в `runFetchRequest()` для передачи тестового скрипта вместо реального fetch.

## Почему не class-based DI

- Options объект проще для соло-разработчика
- Classes добавляют boilerplate (`constructor`, `this.`)
- Fallback через `||` идиоматичен для CommonJS

## Почему не встроенные моки (proxyquire, rewire)

- ADR-0015 запрещает внешние зависимости
- Options-based DI работает с нативным `node:test`
- Явная инъекция = явные зависимости в тестах

## Почему не全局注入 (globalThis)

- Неявные зависимости, сложно отследить
- Загрязняет глобальное пространство
- Сложнее тестировать изолированно

## Последствия

- Тесты передают mock-объекты через options, не используя мок-библиотеки
- `autoStart: false` в long-polling позволяет тестам управлять стартом
- `childScriptOverride` в `runFetchRequest()` — тестовый хук для детерминированного тестирования
- Добавление новой зависимости = добавление параметра в options объект

## Рассмотренные альтернативы

### Proxyquire/rewire

Минус: нарушает ADR-0015, неявные моки, сложность отладки.

### Class-based DI контейнер

Минус: избыточно для 6 модулей, добавляет boilerplate.

### Global injection (globalThis)

Минус: неявные зависимости, загрязнение глобального namespace.

### Jest mocks

Минус: нарушает ADR-0015, использует встроенный test runner (ADR-0004).
