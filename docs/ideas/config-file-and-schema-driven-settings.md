# Конфигурация: файл как источник правды + schema-driven web UI

> **Внимание:** этот pre-ADR idea document заменён принятыми решениями:
> [ADR-0045](../decisions/ADR-0045-config-file-source-of-truth.md) (file-first
> ядро) и [ADR-0046](../decisions/ADR-0046-schema-driven-config-webui.md)
> (schema-driven web UI). Часть «Open Questions» закрыта ADR — они отмечены
> в соответствующем разделе. Дополнительные решения в ходе ревью (авто-откат
> вариант A, секреты — только просмотр статуса, `version`/миграция файла,
> `nullable`, полный инвентарь `.env`, reject литеральных секретов) —
> в ADR-0045/0046.

## Problem Statement

How Might We дать оператору в продакшне единый способ вносить, хранить и
получать конфигурацию бота (bot-platform + queue-monitor + плагины) через
web UI с просмотром, изменением, применением, импортом/экспортом файла
конфигурации — чтобы это работало в docker compose установке и не ломалось
при добавлении новых плагинов с новыми настройками?

## Recommended Direction

**File-first ядро (A) + schema-платформа (B) как MVP; операционный контур (C) — следующий шаг.**

Сегодня конфигурация — только env-переменные: `createBotPlatformConfig`
в `src/bot-platform/core/config.js:146` и `createQueueMonitorConfig` в
`src/queue-monitor/config.js:16`. Плагины (`plugin-loader.js`) экспортируют
только `routes` — декларации настроек у них нет. Страница «Настройки» в
`src/queue-monitor/ui/src/pages/SettingsPage.jsx:4` — заглушка.

Три решения принято в ходе рефайна:

1. **Источник правды — файл `zyablik.config.json`** для управляемых настроек.
   Env остаётся как слой развёртывания: bootstrap (`ZYABLIK_CONFIG` — путь
   до файла), секреты через `$VAR`-ссылки в файле (значения живут в `.env` /
   docker secrets, а не в самом файле) и базовая неизменяемая конфигурация
   (`NODE_EXTRA_CA_CERTS`).
2. **Stage → Apply → перезапуск процесса.** Никакого hot-reload. Изменения
   в UI попадают в staged-состояние, явная кнопка Apply пишет файл,
   валидирует и рестартует процесс через сервис-менеджер (не `on-failure` —
   см. Open Questions Q3). Процесс один и владеет всеми сервисами
   (ingress + worker + monitor), поэтому полный рестарт применяет всё.
3. **Секреты в UI — только просмотр статуса** (решение по Open Question).
   Ключи с `secret: true` не возвращаются в API-списках, не попадают в
   экспорт (заменяются на `$VAR`-ссылку), в UI показываются `••••` и факт
   «задан / не задан». Значение и имя `$VAR` через UI не меняются и не
   раскрываются — секреты задаются в `.env`/docker secret при деплое.
   Reveal-flow убран.

### Ядро (A): file-first конфиг

- `config.js` переписывается на трёхслойный мерж: **defaults → файл →
  .env (bootstrap + секреты + неизменяемая база)**. `createBotPlatformConfig(env)` становится
  `loadConfig(options)` (см. ADR-0045); `$VAR`-ссылки резолвятся из
  `process.env` при загрузке. Валидация — единая схема (тип, default,
  required, secret, enum, min/max) для всех секций: `bot`, `queue`, `ingress`,
  `monitor`, `plugins`.
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
  `plugin-loader.js` валидирует схему при загрузке (в `validatePlugin`,
  `plugin-loader.js:39`).
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
- `GET  /api/config/status` — авто-откат/карантин: факт, причины, banner

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
- Маскирование секретов + просмотр статуса «задан / не задан» в UI
  (редактирование и раскрытие секретов через UI — вне MVP)
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
- **Редактирование и раскрытие секретов через UI** — нет (решение «только
  просмотр статуса»): значения и имена `$VAR` задаются в `.env`/docker secret
  при деплое; UI показывает факт «задан / не задан» и маску, reveal-flow убран
- **Env как слой переопределения настроек** — революция принята: файл —
  источник правды, env только bootstrap + секреты + неизменяемая база. Это
  ломает текущую практику `export QUEUE_*`, зато даёт единый управляемый
  артефакт
- **Управление Zabbix Media type из бота** — параметры webhook живут на
  стороне Zabbix; бот их не меняет и не дублирует (секции в
  `zyablik.config.json` нет — решение по Open Question, «нет»)
- **Hot-reload** — выбран Stage+Apply+рестарт: проще, безопаснее для
  оператора, применимо в systemd и docker одинаково
- **История/версионирование конфига в UI** — для MVP хватает lkg-отката;
  git-backed история — позже

## Open Questions

- ~~Где хранить staged-состояние: отдельный файл или таблица в
  delivery-queue.db?~~ — **закрыто (решение: отдельный файл, НЕ БД)**.
  Примеры: Pi-hole хранит конфиг файлом + ротация `config_backups/` +
  last-known-good (откат при ошибке парсинга), AdGuard Home — файл с
  атомарной записью (temp+rename), F5 NGINX Instance Manager — staged-конфиги
  как отдельные сущности с последующей публикацией на инстансы.
  Контрпример — Nginx Proxy Manager: источник правды SQLite + генерируемые
  на диск nginx-conf → баг расхождения «БД/UI ≠ файл» (issue #5690), два
  источника правды молча расходятся. Вывод: staged — `zyablik.config.staged.json`
  с атомарной записью, lkg — ротация бэкапов; в БД staged не хранить.
- ~~Семантика Apply в docker vs systemd~~ — **закрыто (решение: рестарт
  делегируется сервис-менеджеру; `Restart=on-failure` для apply НЕ годится)**.
  docker `restart: on-failure` и systemd `Restart=on-failure` перезапускают
  только при ненулевом exit-коде — чистый exit 0 (self-restart после Apply)
  НЕ перезапустится. AdGuard Home при применении делегирует рестарт
  сервис-менеджеру (service control) либо порождает новый процесс и
  завершается; luci-app-adguardhome рестартует сервис снаружи; паттерн
  compose-as-systemd применяет конфиг через `docker compose up -d`
  (рекреация). Решение: Apply → запись файла + валидация → рестарт через
  сервис-менеджер: systemd `Restart=always` + `RestartSec` + `StartLimitBurst`
  (или внешний `systemctl restart`), docker `restart: unless-stopped`
  (не `on-failure`) либо рекреация контейнера; учитывать docker
  10s-правило (политика включается после 10с успешной работы).
- ~~Поведение при неразрешённом `$VAR`: fail-fast при старте или
  warn + default?~~ — **закрыто ADR-0045**: fail-fast для секретов,
  warn + default для остальных ключей.
- ~~Как `queue-monitor` получает свою секцию?~~ — **закрыто ADR-0045**:
  единый `loadConfig(options)`, каждый модуль читает свою ветку из общего
  результата.
- ~~Где живут значения секретов и можно ли редактировать их через UI?~~ —
  **закрыто (решение «только просмотр статуса»)**. Значения — в `.env` /
  docker secrets (слой этапа развёртывания), в файле — `$VAR`-ссылки. UI
  показывает только факт «задан / не задан» и маску `••••`; ни значение, ни
  имя `$VAR` через UI не меняются и не раскрываются (reveal-flow убран).
  В `.env` остаются только секреты и базовая неизменяемая конфигурация
  (`MAX_BOT_TOKEN`, `METRICS_API_KEY`, `SESSION_SECRET`, `IDP_CLIENT_SECRET`,
  `NODE_EXTRA_CA_CERTS`, `ZYABLIK_CONFIG`); всё управляемое — в файле.
- ~~Как защититься от сломавшего работу конфига?~~ — **закрыто (вариант A:
  pre-validate + авто-откат к lkg)**. Apply сначала валидирует staged (схема
  + резолв `$VAR` fail-fast + dry-run) и отклоняет плохой конфиг до рестарта;
  стартовый детектор карантинит невалидный файл в
  `zyablik.config.<ts>.bad.json`, восстанавливает `.lkg` и стартует с ним; при
  невалидном lkg — отказ стартовать (fail loudly) с ограничением цикла
  рестартов; каждое действие аудируется; UI показывает banner через
  `GET /api/config/status`.
- ~~Нужен ли в файле раздел с шаблоном параметров Zabbix Media type для
  экспорта?~~ — **закрыто (решение «нет»)**: секции в `zyablik.config.json`
  не будет — параметры Media type живут на стороне Zabbix, бот ими не
  управляет, дублирование создало бы второй источник правды.

## Связанные решения

- [ADR-0045](../decisions/ADR-0045-config-file-source-of-truth.md) — file-first
  ядро (принятое решение по данному idea-документу)
- [ADR-0046](../decisions/ADR-0046-schema-driven-config-webui.md) — schema-driven
  web UI (принятое решение по данному idea-документу)
- [ADR-0034](../decisions/ADR-0034-queue-monitor-dashboard.md) — dashboard,
  на котором живут новые API и страница настроек
- [ADR-0035](../decisions/ADR-0035-session-auth-for-dashboard-metrics.md) —
  auth для новых `/api/config/*`
- [ADR-0029](../decisions/ADR-0029-lifecycle-audit-trail.md) — аудит apply /
  import / rollback / авто-отката
- [ADR-0015](../decisions/ADR-0015-zero-external-dependencies.md) — ноль
  новых внешних зависимостей
- [ADR-0044](../decisions/ADR-0044-nginx-reverse-proxy.md) — TLS-слой, поверх
  которого работает UI
- `src/bot-platform/core/config.js`, `src/queue-monitor/config.js`,
  `src/bot-platform/core/plugin-loader.js`,
  `src/queue-monitor/ui/src/pages/SettingsPage.jsx`
