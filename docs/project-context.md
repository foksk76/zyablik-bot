# Project context

Этот документ фиксирует рабочий контекст проекта для инженеров и AI-агентов.

## Что делает проект

Проект добавляет доставку уведомлений из Zabbix в корпоративный мессенджер МАХ через отдельный Zabbix Media type с типом `Webhook`.

Существующий Telegram-канал не заменяется. МАХ добавляется как второй независимый канал доставки.

## Принятый scope

Zabbix -> МАХ доставка принята по `docs/project-acceptance.md`. Финальная фиксация доставки хранится в:

```text
docs/test-runs/final-acceptance-run.md
```

Подтверждено:

- Zabbix отправляет уведомления в МАХ через Zabbix Media type `Webhook`;
- существующий Telegram-канал продолжает работать;
- МАХ дублирует Telegram;
- GitHub Actions green;
- проект не выходит за согласованные границы.

По ADR-0010 live-сценарий MAX Identity Bot требует отдельного обезличенного live test-run: реальное входящее сообщение в МАХ и реальный ответ бота через MAX Bot API с `user_id` / `chat_id`. Dry-run, synthetic fixtures и safe test bot подтверждают только готовность кода и формата ответа.

## Post-acceptance follow-up

Открытые follow-up:

```text
Task 18: live MAX Identity Bot for user_id / chat_id
```

Task 13 выполнена и подтверждена (промежуточный прогон удалён из репозитория).

Task 14 уже выполнен и относится к поддерживающим работам bot-platform.

Task 18 входит в актуальную live-приемку MAX Identity Bot по ADR-0010 и требует отдельного обезличенного live test-run.

## Bot-platform

По ADR-0005 выбран Hubot-based MVP MAX Identity Bot. Node-RED оставлен только как fallback-прототип.

Bot-platform отделена от Zabbix Webhook и используется для identity-сценария и команд:

```text
message_created -> command dispatch -> /help | /id | /status | unknown command reply
message_created (no command) -> unknown command reply
bot_added -> welcome message
bot_started -> welcome message
```

По ADR-0018 pipeline ветвится: если текст начинается с `/`, обрабатывается через command registry; иначе — «Unknown command». По ADR-0019 outbound client поддерживает `kind: 'text'` ответы. По ADR-0020 `bot_added` и ADR-0021 `bot_started` события обрабатываются pipeline и отправляют приветствие.

Live-сценарий с реальным входящим сообщением МАХ и реальным ответом через MAX Bot API вынесен в Task 18.

Ключевые границы:

- основной путь реализации — Hubot-based MVP;
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

На текущий момент приняты решения:

- использовать явный AI-assisted каркас разработки;
- использовать внешний `agent-skills` без git submodule;
- для документации и ADR применять подход `documentation-and-adrs`;
- хранить архитектурные решения в `docs/decisions/`;
- хранить project-level критерии в `docs/project-acceptance.md`;
- по ADR-0005 использовать Hubot как основной вариант MVP `MAX Identity Bot`, а Node-RED только как fallback-прототип;
- по ADR-0010 требовать live evidence для приемки MAX Identity Bot;
- по ADR-0022 расширить scope на multi-source ingress + журналы;
- по ADR-0023 принять входящие HTTP в bot-platform (stdlib only);
- по ADR-0024 принять `@okta/jwt-verifier` как исключение из ADR-0015 (совместим с OIDC-провайдерами);
- по ADR-0025 принять `better-sqlite3` как исключение из ADR-0015;
- по ADR-0026 расширить границу стенда под multi-source ingress (outbound-only → inbound-capable);
- по ADR-0027 установить и настроить IdP на MVP стенде (NanoIDP для quickstart);
- по ADR-0028 ввести очередь доставки сообщений (delivery queue) для at-least-once guarantee;
- по ADR-0029 ввести lifecycle audit trail (audit + trace) для расследования инцидентов;
- не реализовывать автоматическую повторную отправку, маршрутизацию на боте или управление Zabbix из МАХ без отдельного ADR.

## Основной артефакт первого этапа

```text
src/zabbix-media-type/max-webhook.js
```

Если меняется логика этого файла, нужно проверить и при необходимости обновить:

```text
docs/zabbix-media-type.md
CHANGELOG.md
docs/decisions/
```

## Статус реализации multi-source ingest

Реализовано (sprint 14-16):

```text
src/bot-platform/queue/store.js        — SQLite-based queue store (ADR-0025)
src/bot-platform/queue/worker.js       — Queue worker с retry + backoff (ADR-0028)
src/bot-platform/ingress/              — Ingress pipeline:
  ├── jwt-source-auth.js               — JWT-аутентификация (ADR-0024)
  ├── http-server.js                   — HTTP-сервер POST /ingest (ADR-0023)
  ├── oidc-verifier.js                 — OIDC-верификатор для HTTP-issuer
  ├── normalizers/                     — Per-source нормализаторы
  │   ├── ingest.js                    — Generic ingest normalizer
  │   ├── zabbix.js                    — Zabbix normalizer (legacy, не используется)
  │   └── index.js                     — Normalizer registry
  └── index.js                         — Ingress facade
src/zabbix-media-type/bot-platform-ingest.js — Zabbix 7.2 webhook для bot-platform ingress
src/bot-platform/app.js                — Wiring: ingress + queue в одном процессе
```

Конфигурация (переменные окружения):

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

Реализовано:

```text
- NanoIDP на MVP стенде (docker compose, порт 8000)
- Live test-run ingest path: zabbix → /ingest → queue → outbound → MAX API 200 → user 219338126
- Keycloak/Authentik для продакшн (документация: docs/nanoidp-setup.md)
```

## Правило для агентов

Не переизобретать принятые решения. Перед предложением нового подхода агент должен проверить:

```text
docs/decisions/README.md
docs/project-acceptance.md
AGENTS.md
```
