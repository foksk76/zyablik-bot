# Implementation Plan: Convention-Based Plugin Loader

## Overview

Рефакторинг bot-platform: замена ручной привязки плагинов на convention-based auto-discovery. Плагины размещаются в `src/bot-platform/plugins/{name}/index.js` и экспортируют `{ name, routes }`. Модуль `plugin-loader` сканирует директорию, загружает плагины, валидирует интерфейс и собирает карту маршрутов для event router.

Текущая проблема: добавление нового плагина требует редактирования `app.js`, ручной привязки маршрутов и импорта хендлеров в pipeline-файлах. При 10+ плагинах это неприемлемо.

## Architecture Decisions

- **Convention over configuration:** плагины автоматически обнаруживаются по директории, без конфиг-файла
- **Синхронный loader:** `fs.readdirSync` + `require()` — нет async I/O, нет динамической загрузки
- **Чистый break:** `createIdentityPlugin()` scaffold удаляется, все импорты обновляются за один проход
- **Валидация name == directory:** имя плагина должно совпадать с именем директории
- **Дублирование маршрутов = ошибка:** два плагина не могут регистрировать один и тот же route name

## Dependency Graph

```
plugin-loader.js (new)
    │
    ├── identity/index.js (refactor interface)
    │       │
    │       └── handler.js, formatter.js (unchanged)
    │
    ├── core/index.js (export pluginLoader)
    │
    ├── dry-run-pipeline.js (accept routeHandlers param)
    │       │
    │       └── app.js (use plugin loader, pass routes)
    │
    ├── live-pipeline.js (accept routeHandlers param)
    │       │
    │       └── live-service.js (pass routeHandlers)
    │
    └── tests (update + new)
```

## Task List

### Phase 1: Foundation

- [ ] Task 1: Create `src/bot-platform/core/plugin-loader.js`
- [ ] Task 2: Refactor `src/bot-platform/plugins/identity/index.js` to new interface
- [ ] Task 3: Update `src/bot-platform/core/index.js` exports

### Checkpoint: Foundation

- [ ] `npm test` passes (existing tests may need adjustment)
- [ ] Plugin loader module is importable and returns correct structure

### Phase 2: Pipeline Integration

- [ ] Task 4: Update `src/bot-platform/core/dry-run-pipeline.js` to accept routeHandlers
- [ ] Task 5: Update `src/bot-platform/core/live-pipeline.js` to accept routeHandlers
- [ ] Task 6: Update `src/bot-platform/app.js` to use plugin loader
- [ ] Task 7: Update `src/bot-platform/runtime/live-service.js` to pass routeHandlers

### Checkpoint: Pipeline

- [ ] Dry-run pipeline works with plugin-loaded routes
- [ ] Live pipeline accepts routeHandlers parameter
- [ ] `npm test` passes

### Phase 3: Tests & Documentation

- [ ] Task 8: Create `tests/bot-platform/plugin-loader.test.js`
- [ ] Task 9: Update `tests/bot-platform/scaffold.test.js`
- [ ] Task 10: Update `tests/bot-platform/dry-run-pipeline.test.js`
- [ ] Task 11: Create ADR-0012

### Checkpoint: Complete

- [ ] All tests pass
- [ ] ADR-0012 exists in `docs/decisions/`
- [ ] No secrets or real identifiers in code
- [ ] `docs/project-context.md` updated if needed

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing tests during refactor | Medium | Run `npm test` after each task, fix incrementally |
| Live-service.js changes affect live runtime | Medium | Injective HTTP boundary stays; only route wiring changes |
| Plugin loader scan fails silently | Low | Validation throws on malformed plugins; empty directory returns empty map |

## Open Questions

- Должен ли `pluginLoader` быть синглтоном или создаваться на каждый вызов? — Ответ: создаваться на каждый вызов (stateless, simpler)
- Нужен ли ADR для этого изменения? — Да, это архитектурное изменение plugin pattern
