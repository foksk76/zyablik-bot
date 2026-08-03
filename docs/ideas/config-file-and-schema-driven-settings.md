# Конфигурация: файл как источник правды + schema-driven web UI

## Problem Statement

How Might We дать оператору в продакшне единый способ вносить, хранить и
получать конфигурацию бота (bot-platform + queue-monitor + плагины) через
web UI с просмотром, изменением, применением, импортом/экспортом файла
конфигурации — чтобы это работало в docker compose установке и не ломалось
при добавлении новых плагинов с новыми настройками?

## Recommended Direction

**File-first ядро (A) + schema-платформа (B) как MVP; операционный контур (C) — следующий шаг.**

Сегодня конфигурация — только env-переменные: `createBotPlatformConfig`
в `src/bot-platform/core/config.js:27` и `createQueueMonitorConfig` в
`src/queue-monitor/config.js:7`. Плагины (`plugin-loader.js`) экспортируют
только `routes` — декларации настроек у них нет. Страница «Настройки» в
`src/queue-monitor/ui/src/pages/SettingsPage.jsx:4` — заглушка.

Три решения принято в ходе рефайна:

1. **Источник правды — файл `zyablik.config.json`** (env уходит). Env
   остаётся только для bootstrap (`ZYABLIK_CONFIG` — путь до файла) и для
   секретов через `$VAR`-ссылки в файле (значения живут в окружении /
   docker secrets, а не в самом файле).
2. **Stage → Apply → перезапуск процесса.** Никакого hot-reload. Изменения
   в UI попадают в staged-состояние, явная кнопка Apply пишет файл,
   валидирует и рестартует процесс (systemd `Restart=on-failure` /
   docker restart policy). Процесс один и владеет всеми сервисами
   (ingress + worker + monitor), поэтому полный рестарт применяет всё.
3. **Секреты маскируются, отдельный flow.** Ключи с `secret: true` не
   возвращаются в API-списках, не попадают в экспорт (заменяются на
   `$VAR`/маску), в UI показываются `••••`, reveal — по клику с
   подтверждением и аудитом.

### Ядро (A): file-first конфиг

- `config.js` переписывается на трёхслойный мерж: **defaults → файл →
  bootstrap-env**. `createBotPlatformConfig(env)` становится
  `loadConfig(filePath, env)`; `$VAR`-ссылки резолвятся из `process.env`
  при загрузке. Валидация — единая схема (тип, default, required, secret,
  enum, min/max) для всех секций: `bot`, `queue`, `ingress`, `monitor`,
  `plugins`.
- Tri-state: `zyablik.config.json` (current) + `zyablik.config.json.lkg`
  (last-known-good, для отката) + staged-состояние.
- Всё применение/импорт/откат логируется через ADR-0029 audit.
- **Compose как дизайн-ограничение**: файл живёт в volume (`./config`),
  секреты — в docker secrets/env, путь переопределяется через
  `ZYABLIK_CONFIG`. Сам `docker-compose.yml` для бота — следующий шаг, не
  часть этого MVP.

### Платформа (B): schema-driven

- Плагин рядом с `routes` объявляет `configSchema` (см.
  `src/bot-platform/plugins/identity/index.js:7` как первый кандидат).
  `plugin-loader.js:9` валидирует схему при загрузке.
- Web UI рендерит формы динамически из схемы (`GET /api/config/schema` —
  merged системная + плагинные схемы). Новый плагин с настройками
  появляется в UI без правки фронта.
- `SettingsPage.jsx` превращается из заглушки в рабочую страницу.

### Новые API (на dashboard-сервере, auth по ADR-0035/0034)

- `GET  /api/config` — effective-конфиг (секреты редактированы)
- `GET  /api/config/schema` — merged схема для динамических форм
- `PUT  /api/config/stage` / `GET /api/config/stage` — сохранение и diff
- `POST /api/config/apply` — записать файл + рестарт
- `POST /api/config/rollback` — восстановить lkg
- `GET  /api/config/export` / `POST /api/config/import` — JSON (экспорт
  редактирован, импорт → валидация → staged + diff-превью)
- `POST /api/config/secret/reveal` — разовое раскрытие секрета (аудит)

## Key Assumptions to Validate

- [ ] Полный рестарт процесса применяет все изменения (сегодня процесс один
      и владеет ingress/worker/monitor; при появлении webhook-транспорта или
      внешних процессов допущение ломается)
- [ ] `$VAR`-резолвинг и file-first не ломают существующие env-based тесты
      (`node --test`) и политики (`docs-leak-guard.test.js`)
- [ ] Схема покрывает все текущие настройки без hand-written форм (проверить
      на секциях `bot`/`queue`/`ingress`/`monitor` + плагин `identity`)
- [ ] Редакция секретов не даёт утечек: ни в API-списках, ни в экспорте,
      ни в логах (ADR-0013 secret redaction)
- [ ] Миграция текущего `.env`-стенда: bootstrap-генерация первого файла из
      env (`--generate-config`) воспроизводит текущее поведение
- [ ] `node >= 20` достаточно; новых внешних зависимостей не требуется
      (ADR-0015 zero-deps, JSON из stdlib)

## MVP Scope

### In (MVP)

- File-first ядро: `loadConfig`, мерж defaults→файл→env, `$VAR`-секреты,
  единая схема, валидация, `--generate-config` для миграции
- Tri-state current / staged / lkg + Apply (запись файла + рестарт) + rollback
- Schema-driven: `configSchema` у плагина `identity`, `plugin-loader`
  валидирует схемы, динамический рендер форм в `SettingsPage.jsx`
- Маскирование секретов + reveal-flow с аудитом (ADR-0029)
- Импорт/экспорт JSON: экспорт редактированный, импорт → валидация →
  staged → diff-превью
- Новые API `/api/config/*` на dashboard-сервере под существующим auth
- Документация: `docs/` (idea → ADR), INSTALL.md, runbook

### Out (MVP)

- `docker-compose.yml` для самого бота (только дизайн-ограничение в этой
  работе; compose — следующий шаг)
- GitOps / git-backed история конфига (откат через lkg-файл)
- Роли и права для нескольких операторов (один оператор)
- Hot-reload без рестарта (отклонено осознанно)
- Webhook-транспорт (независимая тема)

## Not Doing (and Why)

- **Секреты в файле открытым текстом** — нет: остаются в окружении / docker
  secrets, в файле только `$VAR`-ссылки
- **Env как слой переопределения настроек** — революция принята: файл —
  источник правды, env только bootstrap + секреты. Это ломает текущую
  практику `export QUEUE_*`, зато даёт единый управляемый артефакт
- **Управление Zabbix Media type из бота** — параметры webhook живут на
  стороне Zabbix; из бота можно только экспортировать шаблон параметров,
  не менять их
- **Hot-reload** — выбран Stage+Apply+рестарт: проще, безопаснее для
  оператора, применимо в systemd и docker одинаково
- **История/версионирование конфига в UI** — для MVP хватает lkg-отката;
  git-backed история — позже

## Open Questions

- Где хранить staged-состояние: отдельный файл (`zyablik.config.staged.json`)
  или таблица в delivery-queue.db?
- Семантика Apply в docker vs systemd: перезапуск контейнера управляется
  рестарт-политикой, а не SIGTERM-хендлером — нужен единый контракт
  «процесс корректно завершается и перезапускается»?
- Поведение при неразрешённом `$VAR`: fail-fast при старте или
  warn + default? (fail-fast для секретов, warn для остального?)
- Как `queue-monitor` получает свою секцию: `loadConfig` возвращает
  единый объект, а каждый модуль читает свою ветку, или остаются два
  отдельных чтения одного файла?
- Нужен ли в файле раздел с шаблоном параметров Zabbix Media type для
  экспорта, или это лишняя поверхность?

## Связанные решения

- [ADR-0034](../decisions/ADR-0034-queue-monitor-dashboard.md) — dashboard,
  на котором живут новые API и страница настроек
- [ADR-0035](../decisions/ADR-0035-session-auth-for-dashboard-metrics.md) —
  auth для новых `/api/config/*`
- [ADR-0029](../decisions/ADR-0029-lifecycle-audit-trail.md) — аудит apply /
  import / reveal
- [ADR-0015](../decisions/ADR-0015-zero-external-dependencies.md) — ноль
  новых внешних зависимостей
- [ADR-0044](../decisions/ADR-0044-nginx-reverse-proxy.md) — TLS-слой, поверх
  которого работает UI
- `src/bot-platform/core/config.js`, `src/queue-monitor/config.js`,
  `src/bot-platform/core/plugin-loader.js`,
  `src/queue-monitor/ui/src/pages/SettingsPage.jsx`
