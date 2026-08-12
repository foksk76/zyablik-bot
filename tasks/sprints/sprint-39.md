# Sprint 39: Schema-driven конфигурация (ADR-0046) — configSchema, merged-схема, /api/config/*

**Цель:** реализовать schema-driven backend (ADR-0046): `configSchema` у
плагинов (валидация в plugin-loader), merged-схема (система + плагины),
REST API `/api/config/*` (просмотр, схема, stage, apply, rollback, status,
export/import), auth (Bearer + session), single-flight и rate limit.

**ADR:** [ADR-0046](../../docs/decisions/ADR-0046-schema-driven-config-webui.md)
[ADR-0045](../../docs/decisions/ADR-0045-config-file-source-of-truth.md)
[ADR-0039](../../docs/decisions/ADR-0039-auth-rate-limiting-for-dashboard.md)
[ADR-0035](../../docs/decisions/ADR-0035-session-auth-for-dashboard-metrics.md)
[ADR-0042](../../docs/decisions/ADR-0042-web-interface-archive.md) (HTTP-паттерны)
**Idea:** [docs/ideas/config-file-and-schema-driven-settings.md](../../docs/ideas/config-file-and-schema-driven-settings.md)

**Контекст:** ядро и применение готовы (Sprint 37-38). Здесь — API для
SettingsPage (Sprint 40). Внутренний контракт событий — ADR-0017.

**Границы:** только backend (маршруты + валидация + auth). UI — Sprint 40.
Плагины: `configSchema` вводится у identity (первый пример), остальные —
без схемы (настройки невидимы в UI до добавления схемы).

## Architecture Decisions

- **`configSchema` плагина** — декларативный объект формата ADR-0046
  (`{ type, default, required, secret, enum, min, max, nullable,
  description, section }`); plugin-loader валидирует схему на загрузке.
- **Merged-схема** — системная схема (Sprint 37) + схемы плагинов под
  `plugins.<name>.*`; используется и для валидации файла, и для рендера
  форм (Sprint 40).
- **Секреты в API:** только статус «задан/не задан» (маска). Reveal-
  эндпоинта нет. В `GET /api/config` значение секрета не возвращается.
- **Mutating endpoints:** single-flight (409 при параллельной мутации);
  sliding-window rate limit (ADR-0039); auth — Bearer (IdP) + session
  (ADR-0035).
- **Apply:** `202 Accepted` (инициация рестарта асинхронна); состояние —
  опрос `GET /api/config/status`
  (`idle/pending/confirmed/rolled_back/quarantine` + причина, поля ответа —
  ADR-0046).
- **Import:** литеральный секрет в secret-поле — reject со списком полей
  (ADR-0045).

## Tasks

### Task 1: `configSchema` плагина + валидация в plugin-loader

**Status:** Done

**Description:** Контракт `configSchema` в plugin-loader
(`src/bot-platform/core/plugin-loader.js:39`): валидация схемы на загрузке
(известные поля, типы), экспорт в merged-схему. Первый пример — identity
плагин: `configSchema` демонстрирует механизм, но **блок IdP-регистрации
(`IDP_ISSUER`/`IDP_CLIENT_ID`/`IDP_CLIENT_SECRET`/`IDP_REDIRECT_URI`/
`IDP_AUDIENCE`) в файл не переносится** — он остаётся «неизменяемой базой»
в env (ADR-0045, маппинг), а `IDP_CLIENT_SECRET` в схеме не объявляется
вовсе. У identity сейчас нет рантайм-настроек (плагин — только
`name`/`routes`, `src/bot-platform/plugins/identity/index.js`), поэтому
`configSchema` — минимальная демонстрация механизма, а ветка
`plugins.identity.*` в merged-схеме пустая. Примеры рантайм-полей
(`idpRelaxSsrf`, `idpRequireDiscovery`) относятся к системной секции
`monitor.*` (ADR-0045, маппинг), не к identity.

**Acceptance criteria:**
- [ ] plugin-loader валидирует `configSchema`; невалидная схема — ошибка загрузки
- [ ] identity имеет `configSchema` (минимальная); `IDP_*`-блок не объявлен
      в схеме (остаётся в env); `plugins.identity.*` в merged-схеме — пустая
      ветка (рантайм-поля плагина отсутствуют)
- [ ] unit-тесты plugin-loader (валидная/невалидная схема)

**Files:** `src/bot-platform/core/plugin-loader.js`,
`src/bot-platform/plugins/identity/index.js`,
`tests/bot-platform/plugin-loader.test.js`

**Dependencies:** Sprint 37 (схема поля)

**Estimated scope:** M

---

### Task 2: Merged-схема

**Status:** Done

**Description:** `getMergedConfigSchema()` — системная схема + схемы
плагинов; используется валидатором файла и в `/api/config/schema`.

**Acceptance criteria:**
- [ ] merged-схема содержит системные секции и `plugins.<name>.*`
- [ ] Валидация файла использует merged-схему
- [ ] unit-тест merged-схемы

**Files:** `src/bot-platform/core/config-schema.js`, `src/bot-platform/core/plugin-loader.js`,
`tests/bot-platform/config-schema.test.js`

**Dependencies:** Task 1

**Estimated scope:** S

---

### Task 3: API — просмотр и схема

**Status:** Done

**Description:** `GET /api/config` — effective-конфиг (секреты — только
статус/маска). `GET /api/config/schema` — merged-схема (для рендера форм).

**Acceptance criteria:**
- [ ] `GET /api/config` без значений секретов (статус «задан/не задан»)
- [ ] `GET /api/config/schema` отдаёт merged-схему
- [ ] auth (Bearer + session) на обоих эндпоинтах
- [ ] интеграционные тесты

**Files:** `src/queue-monitor/api/config.js` (новый), `src/queue-monitor/api/index.js`,
`tests/queue-monitor/config-api.test.js`

**Dependencies:** Task 2, Sprint 38

**Estimated scope:** M

---

### Task 4: API — stage, apply, rollback, status

**Status:** Done

**Description:** `GET/PUT /api/config/stage` (staged-снапшот, diff),
`POST /api/config/apply` (202 + status polling), `POST /api/config/rollback`,
`GET /api/config/status` (`pending/confirmed/rolled_back` + причина). Мутации
single-flight (409) + sliding-window rate limit (ADR-0039). Вызывают
функции Sprint 38.

**Acceptance criteria:**
- [ ] stage: GET возвращает текущий staged; PUT валидирует (pre-validate) и
      сохраняет снапшот
- [ ] apply: 202, после — status: pending → confirmed/rolled_back
- [ ] rollback: восстанавливает lkg, status переходит
- [ ] Параллельная мутация — 409; rate limit — 429
- [ ] интеграционные тесты

**Files:** `src/queue-monitor/api/config.js`, `src/queue-monitor/api/index.js`,
`tests/queue-monitor/config-api.test.js`

**Dependencies:** Task 3, Sprint 38

**Estimated scope:** M

---

### Task 5: API — export/import

**Status:** Done

**Description:** `GET /api/config/export` — дамп конфига для резервной
копии (секреты — `$VAR`-ссылки). `POST /api/config/import` — импорт:
валидация (схема + version + $VAR + reject литеральных секретов со списком
полей) → staged.

**Acceptance criteria:**
- [ ] export не содержит литеральных секретов
- [ ] import с литеральным секретом — reject со списком полей
- [ ] import невалидной схемы — ошибка без применения
- [ ] интеграционные тесты

**Files:** `src/queue-monitor/api/config.js`, `src/queue-monitor/api/index.js`,
`tests/queue-monitor/config-api.test.js`

**Dependencies:** Task 4

**Estimated scope:** M

---

## Checkpoint: Sprint 39

- [x] Полный API-флоу e2e: schema → stage → apply → status (confirmed) →
      rollback; import/export
- [x] Секреты не появляются в ответах API (docs-leak-guard + интеграционные)
- [x] 409/429 работают; npm test зелёный (837 pass)
- [ ] Ревью с человеком

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Секреты протекают в ответах API | High | статусы/маски; интеграционные тесты + docs-leak-guard |
| Race между stage/apply/rollback | High | single-flight 409 + статусы в /api/config/status |
| rate limit ломает легитимные сценарии | Medium | параметры по ADR-0039; тесты на границе окна |
| configSchema плагина рассинхронизирован с файлом | Medium | plugin-loader валидирует схему; merged-схема — единый источник |

## Файлы для изменения (сводка)

```
src/bot-platform/core/plugin-loader.js      (configSchema-валидация)
src/bot-platform/plugins/identity/index.js  (configSchema)
src/bot-platform/core/config-schema.js      (merged-схема)
src/queue-monitor/api/config.js             (новый — /api/config/*)
src/queue-monitor/api/index.js              (регистрация маршрутов)
tests/queue-monitor/config-api.test.js      (новый)
tests/bot-platform/plugin-loader.test.js
```
