# ADR-0012: Использовать convention-based plugin loader для bot-platform

## Статус

Принято.

## Дата

2026-07-15

## Контекст

Bot-platform имеет паттерн плагинов (`src/bot-platform/plugins/identity/`), но регистрация плагинов выполняется вручную:

- `app.js` импортирует и создает плагин через `createIdentityPlugin()`
- `dry-run-pipeline.js` хардкодит импорт `handleIdentityEvent`
- `live-pipeline.js` хардкодит импорт `handleIdentityEvent`
- `core/index.js` содержит `pluginLoader: 'pending'`

Добавление нового плагина требует редактирования `app.js`, `dry-run-pipeline.js` и `live-pipeline.js`. При планируемых 10+ плагинах это неприемлемо.

## Решение

Использовать convention-based auto-discovery плагинов из директории `src/bot-platform/plugins/{name}/`.

### Интерфейс плагина

Каждый плагин экспортирует `{ name, routes }`:

```js
module.exports = {
  name: 'identity',
  routes: {
    identity: handleIdentityEvent
  }
};
```

### Plugin loader

Модуль `src/bot-platform/core/plugin-loader.js`:

- `loadPlugins(pluginsDir)` — сканирует директорию, загружает `index.js` из поддиректорий
- `buildRouteMap(plugins)` — объединяет маршруты, ошибается на дубликатах
- `createPluginLoader(pluginsDir)` — возвращает `{ plugins, routes }`

### Валидация

- `name` плагина должен совпадать с именем директории
- `routes` должен быть объектом с функциями
- Дублирование маршрутов = ошибка
- Директории без `index.js` пропускаются молча

## Почему convention over configuration

- Добавление плагина = создание директории и файлов, без редактирования конфига
- Конвенция проще для соло-разработчика
- Масштабируется до 10+ плагинов без роста сложности

## Почему не config-driven registry

- Требует редактирования конфиг-файла для каждого нового плагина
- Лишний шаг, который можно избежать через конвенцию

## Почему не self-registering plugins

- Import side effects (import = register) усложняют тестирование
- Не идиоматично для Node.js

## Почему не middleware chain

- Избыточно для плагинов, которые просто форматируют сообщения
- Middleware нужен для cross-cutting concerns (logging, auth, rate limiting)

## Последствия

- Добавление плагина: создать `src/bot-platform/plugins/{name}/index.js` с `{ name, routes }`
- `app.js`, `dry-run-pipeline.js`, `live-pipeline.js` больше не хардкодят конкретные плагины
- Тесты передают `routeHandlers` явно
- Существующий identity plugin рефакторен на новый интерфейс

## Рассмотренные альтернативы

### Config-driven registry

Файл `plugins.js` список плагинов. Минус: лишний шаг для каждого плагина.

### Self-registering plugins

Плагин импортирует router и вызывает `router.register()`. Минус: side effects при import.

### Middleware chain

Плагин — функция `(event, next) => ...`. Минус: избыточно для простых плагинов.

### Plugin class with lifecycle

Плагин — класс с `init()`, `handle()`, `stop()`. Минус: лишний boilerplate для простых плагинов.
