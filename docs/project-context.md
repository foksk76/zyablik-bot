# Project context

Этот документ фиксирует рабочий контекст проекта для инженеров и AI-агентов.

## Что делает проект

Проект добавляет доставку уведомлений из Zabbix в корпоративный мессенджер МАХ через отдельный Zabbix Media type с типом `Webhook`.

Существующий Telegram-канал не заменяется. МАХ добавляется как второй независимый канал доставки.

## Реализованный scope

Проект завершён и выпущен как версия 1.0.0. Финальное принятие доставки зафиксировано:

```text
docs/test-runs/final-acceptance-run.md
```

Подтверждено:

- Zabbix отправляет уведомления в МАХ через Zabbix Media type `Webhook`;
- bot-platform принимает входящие запросы через HTTP-ingress с JWT-аутентификацией
- очередь доставки обеспечивает at-least-once гарантию доставки
- live MAX Identity Bot принимает реальные входящие сообщения и отвечает с `user_id` / `chat_id`
- существующий Telegram-канал продолжает работать;
- GitHub Actions green;
- проект не выходит за согласованные границы.

## Bot-platform

По ADR-0005 для MVP MAX Identity Bot рассматривался Hubot, но Hubot-путь не был
реализован: по [ADR-0049](decisions/ADR-0049-supersede-hubot-with-custom-bot-platform.md)
основным путём реализации стала кастомная bot-platform `src/bot-platform/`.
Node-RED оставлен только как fallback-прототип.

Bot-platform отделена от Zabbix Webhook и используется для identity-сценария и команд:

```text
message_created -> command dispatch -> /help | /id | /status | unknown command reply
message_created (no command) -> unknown command reply
bot_added -> welcome message
bot_started -> welcome message
```

По ADR-0018 pipeline ветвится: если текст начинается с `/`, обрабатывается через command registry; иначе — «Unknown command». По ADR-0019 outbound client поддерживает `kind: 'text'` ответы. По ADR-0020 `bot_added` и ADR-0021 `bot_started` события обрабатываются pipeline и отправляют приветствие.

Live-сценарий с реальным входящим сообщением МАХ и реальным ответом через MAX Bot API вынесен в отдельную задачу (до реорганизации — Task 18, сейчас — спринты 02–07).

Ключевые границы:

- основной путь реализации — кастомная bot-platform (ADR-0012–0048, Hubot не используется, см. ADR-0049);
- Node-RED используется только как fallback-прототип;
- транспорт МАХ отделяется от identity plugin;
- WSL используется как developer sandbox;
- LXC на Proxmox используется как preferred integration stand;
- текущий Zabbix Webhook остается без изменений.

## Граница текущей принятой интеграции

Входит:

- Media type `MAX` в Zabbix;
- webhook-скрипт;
- параметры Zabbix Media type;
- проверка тестовой доставки;
- доставка Problem и Recovery;
- документация по настройке и сопровождению.

По ADR-0022 граница проекта расширена на multi-source ingest + журналы:

Входит (ADR-0022):

- HTTP-ingress (`POST /ingest`) для входящих запросов от внешних источников;
- аутентификация источников через JWT (`@okta/jwt-verifier` — ADR-0024, совместим с OIDC-провайдерами);
- delivery-log в SQLite (`better-sqlite3` — ADR-0025) за абстракцией `LogStore`;
- connection-log и audit-trail в syslog;
- deprecation прямого пути `max-webhook.js → MAX Bot API`;
- расширение стенда outbound-only → inbound-capable (ADR-0026);
- IdP на MVP стенде (NanoIDP для quickstart, Keycloak/Authentik для продакшна);
- очередь доставки сообщений для at-least-once guarantee (ADR-0028).

Не входит без отдельного ADR (без изменений):

- промышленный bot-service;
- автоматическая повторная отправка;
- маршрутизация «на боте» (каналы и подписки);
- дедупликация, агрегация, приоритизация уведомлений;
- обработка инцидентов из МАХ;
- управление событиями Zabbix из мессенджера;
- автоматическое реагирование.

## Ключевые решения

История решений хранится в `docs/decisions/`.

На текущий момент приняты решения (полный список в `docs/decisions/`):

- использовать явный AI-assisted каркас разработки;
- использовать внешний `agent-skills` без git submodule;
- для документации и ADR применять подход `documentation-and-adrs`;
- хранить архитектурные решения в `docs/decisions/`;
- хранить project-level критерии в `docs/project-acceptance.md`;
- по ADR-0005/ADR-0049 реализация MVP MAX Identity Bot идёт на кастомной bot-platform, а не на Hubot; Node-RED — только fallback-прототип;
- по ADR-0010 требовать live evidence для приемки MAX Identity Bot;
- по ADR-0022 расширить scope на multi-source ingress + журналы;
- по ADR-0023 принять входящие HTTP в bot-platform (stdlib only);
- по ADR-0024 принять `@okta/jwt-verifier` как исключение из ADR-0015 (совместим с OIDC-провайдерами);
- по ADR-0025 принять `better-sqlite3` как исключение из ADR-0015;
- по ADR-0026 расширить границу стенда под multi-source ingress (outbound-only → inbound-capable);
- по ADR-0027 установить и настроить IdP на MVP стенде (NanoIDP для quickstart);
- по ADR-0028 ввести очередь доставки сообщений (delivery queue) для at-least-once guarantee;
- по ADR-0029 ввести lifecycle audit trail (audit + trace) для расследования инцидентов;
- по ADR-0030 ввести outbound rate limiter для защиты от 429 MAX API;
- по ADR-0031 лицензия Apache-2.0, бренд «Зяблик», ренейминг в zyablik-bot;
- по ADR-0032 логировать тело ответа внешних API в ошибках доставки;
- по ADR-0033 crash recovery для delivery pipeline (reclaim stale, poison-loop prevention, graceful shutdown);
- по ADR-0034 ввести Queue Monitor Dashboard (встроенный дашборд, readonly SQLite replica, API для метрик, auth через IdP);
- по ADR-0035 session auth как альтернатива Bearer Token для dashboard metrics;
- по ADR-0036 ввести дизайн-систему для React UI queue-monitor (design tokens, компонентная библиотека, Storybook, AI-guidelines);
- по ADR-0037 ввести SSRF-защиту для IdP-запросов (dns resolution + private IP blocking);
- по ADR-0038 зафиксировать hand-rolled JWT-verifier для ingress layer (RS256/384/512, JWKS cache);
- по ADR-0039 ввести rate limiting для auth-эндпоинтов dashboard (sliding window + concurrency cap);
- по ADR-0040 улучшить UI Queue Monitor Dashboard (error drill-down, session redirect, alert cleanup, configurable limits, countdown, error boundary);
- по ADR-0041 ввести глобальный фильтр времени для Queue Monitor Dashboard (TimeRangeBar, предустановки 1ч–30д, absolute range, drag-to-pan);
- по ADR-0042 расширить scope на web interface (navigation shell + archive: React Router hash-based, archive API, retry через queueStore, backend export);
- по ADR-0043 опубликовать agent-less Zabbix monitoring template 7.0+ (LLD-шаблон на `/api/metrics/*` и `/readyz`, ключи `{#METRIC}` = поля `/summary`, полный набор триггеров, дашборд «Обзор очереди», тестовый Zabbix 7.2 в Docker);
- по ADR-0044 развернуть Nginx reverse proxy на локальном стенде: TLS-терминирование для ingress (`8443`) и dashboard (`9000`), единый порт `443`, самоподписанный сертификат, `IDP_REDIRECT_URI` на `https://`;
- по ADR-0045 ввести файл конфигурации `zyablik.config.json` как источник правды для управляемых настроек (`loadConfig`, `$VAR`-секреты, Stage→Apply→рестарт, версия/миграция, авто-откат к lkg); в `.env` остаются bootstrap, секреты и неизменяемая база;
- по ADR-0046 ввести schema-driven управление конфигурацией в web UI (configSchema у плагинов, `/api/config/*`, секреты — только просмотр статуса);
- не реализовывать автоматическую повторную отправку, маршрутизацию на боте или управление Zabbix из МАХ без отдельного ADR.

## Основные артефакты

```text
src/zabbix-media-type/max-webhook.js              — прямой webhook (Zabbix → MAX Bot API)
src/zabbix-media-type/bot-platform-ingest.js       — webhook через ingress (Zabbix → bot-platform)
src/bot-platform/                                  — bot-platform (ingress, queue, transports, plugins)
docs/zabbix-template/                              — Zabbix monitoring template (ADR-0043) + тестовый стек
```

Если меняется логика webhook-файлов, нужно проверить и при необходимости обновить:

```text
docs/zabbix-media-type.md
CHANGELOG.md
docs/decisions/
```

## Статус реализации multi-source ingest

Стабильно (1.0.0):

```text
src/bot-platform/queue/store.js        — SQLite-based queue store (ADR-0025)
src/bot-platform/queue/worker.js       — Queue worker с retry + backoff (ADR-0028)
src/bot-platform/ingress/              — Ingress pipeline:
  ├── jwt-source-auth.js               — JWT-аутентификация (ADR-0024)
  ├── http-server.js                   — HTTP-сервер POST /ingest (ADR-0023)
  ├── oidc-verifier.js                 — Hand-rolled OIDC-верификатор (ADR-0038): OIDC discovery → jwks_uri с fallback на /.well-known/jwks.json
  ├── normalizers/                     — Per-source нормализаторы
  │   ├── ingest.js                    — Generic ingest normalizer
  │   ├── zabbix.js                    — Zabbix normalizer (legacy, не используется)
  │   └── index.js                     — Normalizer registry
  └── index.js                         — Ingress facade
src/zabbix-media-type/bot-platform-ingest.js — Zabbix 7.2 webhook для bot-platform ingress
src/bot-platform/app.js                — Wiring: ingress + queue в одном процессе
```

Конфигурация (переменные окружения):

> С Sprint 37-41 управляемые настройки перенесены в файл конфигурации
> `zyablik.config.json` (источник правды, ADR-0045): разделы `bot.*`,
> `queue.*`, `ingress.*`, `monitor.*`, `plugins.<name>.*`. Секреты в файле —
> только `$VAR`-ссылки. В `.env` остаются bootstrap (`ZYABLIK_CONFIG`),
> секреты и неизменяемая база (`MAX_API_URL`, IdP-регистрация). Полный
> маппинг env→файл, `--generate-config` и сценарии — в
> `docs/runbooks/config-file.md`, управление через web UI «Настройки»
> (ADR-0046, `/api/config/*`). Ниже — исторический вид переменных,
> которые больше не управляются через env (значения из файла).

```text
QUEUE_ENABLED=false         — включение очереди (по умолчанию false)
QUEUE_MAX_ATTEMPTS=5        — максимальное количество попыток доставки
QUEUE_INTERVAL_MS=5000      — интервал polling очереди
QUEUE_BATCH_SIZE=10         — размер батча для dequeue
INGRESS_ENABLED=false       — включение HTTP-ingress (по умолчанию false)
INGRESS_PORT=8443           — порт HTTP-ingress сервера
IDP_ISSUER=                 — URL Identity Provider (NanoIDP/Keycloak)
IDP_AUDIENCE=               — аудиенция для JWT verification
JWT_CLAIM_NAME=             — имя claim для source identification
JWT_CLAIM_VALUE=            — значение claim для source identification
LOG_AUDIT=false              — включить audit trail (ADR-0029)
LOG_TRACE=true              — включить lifecycle trace (ADR-0029)
```

#### Dashboard (ADR-0034, ADR-0035)

```text
MONITOR_ENABLED=false       — включение dashboard (по умолчанию false)
MONITOR_PORT=9000           — порт dashboard сервера (по умолчанию 9000)
METRICS_API_KEY=            — Bearer token для внешних систем мониторинга (обязательный)
IDP_CLIENT_ID=              — OAuth2 client ID для UI login (опциональный)
IDP_CLIENT_SECRET=          — OAuth2 client secret (опциональный)
IDP_REDIRECT_URI=           — OAuth2 redirect URI (опциональный)
SESSION_SECRET=             — секрет для подписи session cookie (опциональный)
```

UI dashboard использует session auth после OAuth2 логина (ADR-0035).
`METRICS_API_KEY` нужен только для внешних систем (Zabbix, Prometheus, curl).

Конфигурация подтверждена на живом стенде (Sprint 41):

```text
- Стенд стартует из zyablik.config.json (секреты — $VAR-ссылки, без управляемых env)
- Stage → Apply → рестарт → confirmed (свежий pending-маркер в окне StartupWait не откатывает конфиг)
- Неподтверждённый Apply (краш до ready) → авто-откат к lkg + audit config.rollback
- Ручной rollback (POST /api/config/rollback) восстанавливает lkg без рестарта
- Export/import: секреты остаются $VAR-ссылками; литералы режектятся (400)
- UI-флоу Dashboard (#/settings): stage → apply → restart → confirmed → rollback
- Apply через UI/import сохраняет секретные $VAR-поля активного конфига (mergePreservedSecrets)
- Policy-тесты секретов (tests/policy/config-secrets.test.js); npm test 861 pass / 0 fail
- Прогон: docs/test-runs/config-apply-rollback-run.md
```

Статус этапа «Конфигурация файлом» (ADR-0045/0046): **завершён**.
Критерии приёмки этапа — `docs/project-acceptance.md` (§ «Приёмка этапа
„Конфигурация файлом"»), прогон на стенде —
`docs/test-runs/config-apply-rollback-run.md`, follow-up ревью PR #23
(Low, не блокеры) — `tasks/sprints/sprint-42.md`.

Реализовано и подтверждено:

```text
- NanoIDP на MVP стенде (docker compose, порт 8000)
- Live test-run ingest path: zabbix → /ingest → queue → outbound → MAX API 200
- Live test-run direct path: zabbix → max-webhook.js → MAX API 200
- Live MAX Identity Bot: входящие сообщения → ответ с user_id / chat_id
- Keycloak/Authentik для продакшн (документация: docs/nanoidp-setup.md)
```

## Правило для агентов

Не переизобретать принятые решения. Перед предложением нового подхода агент должен проверить:

```text
docs/decisions/README.md
docs/project-acceptance.md
AGENTS.md
```
