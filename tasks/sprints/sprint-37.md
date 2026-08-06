# Sprint 37: Конфигурация (ADR-0045) — file-first ядро: loadConfig, $VAR, версия/миграция, --generate-config

**Цель:** реализовать ядро file-first конфигурации (ADR-0045): единый
`loadConfig(options)` с трёхслойным мержем `defaults → файл → .env`, единая
схема секций (формат ADR-0046), `$VAR`-резолвинг секретов (fail-fast для
секретов, warn+default для остальных, reject литеральных значений),
`version`/миграция формата, `--generate-config` для миграции существующего
`.env`-стенда. Обратная совместимость: без файла процесс стартует на
дефолтах + `.env`-слой.

**ADR:** [ADR-0045](../../docs/decisions/ADR-0045-config-file-source-of-truth.md),
[ADR-0046](../../docs/decisions/ADR-0046-schema-driven-config-webui.md)
(формат схемы поля)
**Idea:** [docs/ideas/config-file-and-schema-driven-settings.md](../../docs/ideas/config-file-and-schema-driven-settings.md)

**Контекст:** ADR-0045/0046 приняты и непротиворечивы документации. Сейчас
конфигурация — только env (`createBotPlatformConfig` в
`src/bot-platform/core/config.js:146`, `createQueueMonitorConfig` в
`src/queue-monitor/config.js:16`). В этом спринте — ядро без UI и без
применения (Stage→Apply—следующий спринт).

**Границы:** только `loadConfig`/схема/резолвинг/генерация + тесты.
Применение (staged/apply/rollback/авто-откат) — Sprint 38. API и UI —
Sprint 39-40. Плагины без `configSchema` (кроме `identity`, если нужно для
валидации merged-схемы) — не трогаем.

## Architecture Decisions

- **Трёхслойный мерж:** `defaults → файл → .env (bootstrap + секреты +
  неизменяемая база)`. При наличии файла управляемые env-переменные **не
  читаются** (тихо игнорируются) — ADR-0045.
- **`.env`-слой** — только: `ZYABLIK_CONFIG`, `NODE_EXTRA_CA_CERTS`,
  секреты (`MAX_BOT_TOKEN`, `METRICS_API_KEY`, `SESSION_SECRET`,
  `IDP_CLIENT_SECRET`), неизменяемая база (`MAX_API_URL`, `IDP_ISSUER`,
  `IDP_CLIENT_ID`, `IDP_REDIRECT_URI`, `IDP_AUDIENCE`).
- **Схема поля** — `{ type, default, required, secret, enum, min, max,
  nullable, description, section }` (ADR-0046); одна декларация для
  валидации файла и рендера форм.
- **`$VAR`-ссылки** — в файле `"maxBotToken": "$MAX_BOT_TOKEN"`;
  неразрешённый секрет — fail-fast, остальные — warn + default; литеральное
  значение в secret-поле — невалидно.
- **`version`** — служебный ключ файла; миграции вверх; отказ при
  `version` > текущей; неизвестные ключи — warn + ignore.
- **Ноль внешних зависимостей** (ADR-0015): схема и валидация — stdlib.

## Tasks

### Task 1: Единая схема секций + валидатор

**Status:** Done

**Description:** Выделить системную схему секций `bot`/`queue`/`ingress`/
`monitor` (формат поля ADR-0046: тип, default, required, secret, enum,
min/max, nullable, description, section). Схема описывает все настройки,
сегодня живущие в `config.js`/`queue-monitor/config.js`. Валидатор —
hand-rolled, без внешних зависимостей.

**Acceptance criteria:**
- [ ] Схема покрывает все текущие поля `createBotPlatformConfig` и
      `createQueueMonitorConfig` (включая `idpRelaxSsrf` = boolean + nullable)
- [ ] Валидатор: типы, required, enum, min/max, nullable; ошибка с полем и
      причиной
- [ ] unit-тесты валидатора (`node --test`)

**Files:** новый `src/bot-platform/core/config-schema.js` (или
`src/bot-platform/core/config/`), `src/bot-platform/core/config.js`,
`tests/bot-platform/config-schema.test.js`

**Estimated scope:** M

---

### Task 2: `loadConfig(options)` — трёхслойный мерж

**Status:** Done

**Description:** Ввести `loadConfig(options)` как замену
`createBotPlatformConfig`/`createQueueMonitorConfig`: мерж
`defaults → файл → .env`, секции `bot`/`queue`/`ingress`/`monitor`/`plugins`
(`plugins.<name>.*`), путь из `ZYABLIK_CONFIG` (по умолчанию
`./config/zyablik.config.json`). `createLiveRuntimeConfig` сохраняется поверх
результата.

**Acceptance criteria:**
- [ ] С файлом: файл главный, управляемые env не читаются
- [ ] Без файла: дефолты + `.env`-слой (обратная совместимость)
- [ ] `queue-monitor` читает свою `monitor`-секцию из общего результата
- [ ] Нет регрессий: существующие env-based тесты зелёные

**Files:** `src/bot-platform/core/config.js`, `src/queue-monitor/config.js`,
`tests/bot-platform/config.test.js`, `tests/queue-monitor/config.test.js`

**Dependencies:** Task 1

**Estimated scope:** M

---

### Task 3: `$VAR`-резолвинг и инвариант «секреты не в файле»

**Status:** Done

**Description:** Резолв `$VAR`-ссылок из `process.env`. Неразрешённый
секрет — fail-fast при старте; остальные ключи — warn + default. Литеральное
значение в secret-поле — невалидно (реject при валидации).

**Acceptance criteria:**
- [ ] `"$MAX_BOT_TOKEN"` резолвится; отсутствие в env секрета — fail-fast
- [ ] Отсутствие не-секрета — warn + default
- [ ] Литеральный секрет в файле — валидационная ошибка
- [ ] unit-тесты всех трёх случаев

**Files:** `src/bot-platform/core/config.js`, `src/bot-platform/core/config-schema.js`,
`tests/bot-platform/config.test.js`

**Dependencies:** Task 1

**Estimated scope:** M

---

### Task 4: `version` + миграция формата

**Status:** Done

**Description:** Служебный ключ `version` (по умолчанию 1). `version` >
текущей — отказ загружать (fail loudly). `version` ниже — пошаговая миграция
вверх (массив миграций); write-back результата — на Apply (Sprint 38), в
памяти — при загрузке. Неизвестные ключи при совпадении версии — warn +
ignore.

**Acceptance criteria:**
- [ ] Файл `version` > текущей — отказ с понятной ошибкой
- [ ] Миграция v1→v2 детерминирована и идемпотентна; unit-тест
- [ ] Неизвестный ключ — warn + ignore (запуск не ломается)

**Files:** `src/bot-platform/core/config.js`, `src/bot-platform/core/config-migrations.js`,
`tests/bot-platform/config-migrations.test.js`

**Dependencies:** Task 2

**Estimated scope:** M

---

### Task 5: `--generate-config` (миграция .env-стенда)

**Status:** Done

**Description:** CLI-флаг `app.js` (argv уже разбирается, `src/bot-platform/app.js:293`):
генерация первого `zyablik.config.json` из текущего окружения по маппингу
env→файл (таблица ADR-0045): управляемые — в файл, секреты — `$VAR`-ссылками.
Пишет в путь из `ZYABLIK_CONFIG`; при существующем файле — отказ;
`--dry-run` печатает результат.

**Acceptance criteria:**
- [ ] На копии `.env` генерируется файл, воспроизводящий поведение env-конфига
      (тест сравнения effective-конфига)
- [ ] Существующий файл не перезаписывается; `--dry-run` не пишет
- [ ] Секреты в файле — только `$VAR`-ссылки (проверка `docs-leak-guard`)

**Files:** `src/bot-platform/app.js`, `src/bot-platform/core/config.js`,
`tests/bot-platform/generate-config.test.js`

**Dependencies:** Tasks 2-3

**Estimated scope:** S

---

## Checkpoint: Sprint 37

- [ ] `npm test` — все тесты passing (включая новые unit-тесты ядра)
- [ ] Миграция текущего `.env`-стенда через `--generate-config` воспроизводит
      поведение env-конфига
- [ ] Без файла процесс стартует (дефолты + `.env`-слой)
- [ ] Нет литеральных секретов в сгенерированном файле
- [ ] Ревью с человеком

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Полная схема покрывает не все поля → регрессия | High | Task 1 сверяет схему со всеми полями config.js; env-based тесты остаются зелёными |
| Управляемые env «тихо игнорируются» при файле | Medium | fail-намеренно задокументировано (ADR-0045); `--generate-config` переносит их в файл |
| Миграции не идемпотентны | Medium | unit-тест повторного применения миграции |
| Секреты протекают в сгенерированный файл | High | секреты — только `$VAR`; расширение `docs-leak-guard` |

## Файлы для изменения (сводка)

```
src/bot-platform/core/config.js            (loadConfig, $VAR, version)
src/bot-platform/core/config-schema.js      (новый — системная схема + валидатор)
src/bot-platform/core/config-migrations.js  (новый — миграции версий)
src/queue-monitor/config.js                 (секция из loadConfig)
src/bot-platform/app.js                     (--generate-config, --dry-run)
tests/bot-platform/*.test.js                (новые unit-тесты)
tests/queue-monitor/config.test.js          (адаптация под loadConfig)
```
