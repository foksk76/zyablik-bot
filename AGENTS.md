# AGENTS.md

Короткая инструкция для AI-агентов, работающих с этим репозиторием.

## Назначение проекта

Доставка уведомлений из Zabbix в МАХ через Zabbix Media type (`Webhook`).

```text
Zabbix -> MAX Bot API -> пользователь или чат в МАХ
```

Не расширять до AI-аналитики, автоматического реагирования или управления событиями Zabbix из мессенджера без ADR.

Очередь доставки (ADR-0028) и multi-source ingress (ADR-0022) — в scope проекта.

## Стек и особенности

- **Node >=20** (CI использует Node 22).
- Тесты: **встроенный test runner Node** (`node --test`). Не Jest, не Mocha.
- Нет линтера, форматтера или typecheck — единственная команда проверки: `npm test`.
- Код и документация — **по-русски**.
- Стиль: 4 пробела (JS/MD), 2 пробела (YAML/JSON) — см. `.editorconfig`.

## Быстрый вход

Перед изменениями прочитать:

1. `README.md`
2. `INSTALL.md`
3. `docs/project-context.md`
4. `docs/decisions/README.md`
5. `tasks/sprints/` — task breakdown

Если меняется Zabbix Media type:

```text
docs/zabbix-media-type.md
src/zabbix-media-type/max-webhook.js
examples/media-params.md
```

Если меняется live identity bot:

```text
docs/live-identity-bot.md
docs/runbooks/live-identity-bot.md
docs/identity-plugin/
```

Если меняется Zabbix monitoring template:

```text
docs/zabbix-template/zyablik-monitoring-template.yaml
docs/zabbix-template/scripts/
docs/zabbix-monitoring-template.md
tests/monitoring/zabbix-template.test.js
docs/decisions/ADR-0043-zabbix-monitoring-template.md
```

Если меняется bot-platform (архитектура):

```text
ADR-0012  convention-based plugin loader
ADR-0013  safe logger / secret redaction
ADR-0014  async HTTP через child_process.spawn
ADR-0015  нулевые внешние зависимости
ADR-0016  инъекция зависимостей через options
ADR-0017  внутренний контракт событий
ADR-0022  расширение scope под multi-source ingress + журналы
ADR-0023  входящие HTTP в bot-platform (изменение посылки ADR-0015)
ADR-0024  @okta/jwt-verifier как исключение из ADR-0015
ADR-0025  better-sqlite3 как исключение из ADR-0015
ADR-0026  расширение scope стенда под multi-source ingress
ADR-0027  установка и настройка Okta IdP на MVP стенде
ADR-0028  очередь доставки сообщений (delivery queue)
ADR-0029  lifecycle audit trail (audit + trace)
ADR-0030  outbound rate limiter для защиты от 429 MAX API
ADR-0031  пре-продакшн: лицензия Apache-2.0, бренд «Зяблик», ренейминг в zyablik-bot
ADR-0032  логирование тела ответа внешних API в ошибках доставки
ADR-0033  crash recovery для delivery pipeline
ADR-0034  Queue Monitor Dashboard (встроенный дашборд, API для метрик, auth через IdP)
ADR-0035  session auth как альтернатива Bearer для dashboard metrics
ADR-0036  дизайн-система для React UI queue-monitor (design tokens, компоненты, Storybook, AI-guidelines)
ADR-0037  SSRF-защита для IdP-запросов (dns resolution + private IP blocking)
ADR-0038  hand-rolled JWT-verifier для ingress layer (RS256/384/512, JWKS cache)
ADR-0039  rate limiting для auth-эндпоинтов dashboard (sliding window + concurrency cap)
ADR-0040  улучшения UI Queue Monitor Dashboard (error drill-down, session redirect, alert cleanup, configurable limits, countdown, error boundary)
ADR-0041  глобальный фильтр времени (TimeRangeBar, предустановки 1ч–30д, absolute range, drag-to-pan)
ADR-0042  web interface — navigation shell + archive (React Router hash-based, archive API, retry через queueStore, backend export)
ADR-0043  Zabbix Monitoring Template (agent-less LLD-шаблон 7.0+, смена {#METRIC} на pending, тестовый Zabbix 7.2 в Docker)
ADR-0044  Nginx reverse proxy для HTTP-серверов bot-platform (TLS-терминирование ingress 8443 и dashboard 9000, порт 443, self-signed)
ADR-0045  файл конфигурации как источник правды (zyablik.config.json, loadConfig, $VAR-секреты, Stage→Apply→рестарт, авто-откат)
ADR-0046  schema-driven управление конфигурацией в web UI (configSchema у плагинов, /api/config/*, секреты — только статус)
```

Если меняется конфигурация (config file / schema-driven web UI):

```text
docs/decisions/ADR-0045-config-file-source-of-truth.md
docs/decisions/ADR-0046-schema-driven-config-webui.md
src/bot-platform/core/config.js
src/queue-monitor/config.js
src/queue-monitor/ui/src/pages/SettingsPage.jsx
```

Если меняется Nginx reverse proxy (стенд, TLS):

```text
docs/runbooks/nginx-reverse-proxy.md
docs/decisions/ADR-0044-nginx-reverse-proxy.md
INSTALL.md (раздел 11)
```

Если меняется конфигурация (config file / schema-driven web UI) и стенд:

```text
docs/runbooks/config-file.md
Dockerfile
docker-compose.yml
```

## Каноничные источники

```text
docs/decisions/                  ADR и процессные решения
docs/project-context.md          контекст и границы
docs/project-acceptance.md       критерии завершения этапа
tasks/sprints/                   task breakdown
README.md                        быстрый вход для человека
INSTALL.md                       краткая установка
```

Если файлы противоречат друг другу, приоритет выше у ADR и профильных документов в `docs/`.

## Структура репозитория

```text
src/zabbix-media-type/           webhook-скрипт для Zabbix Media type
src/bot-platform/                бот-платформа (app.js — точка входа)
src/queue-monitor/               dashboard: метрики, auth, UI (ADR-0034)
tests/                           policy-тесты и unit tests (bot-platform)
docs/decisions/                  ADR и процессные решения
docs/ideas/                      pre-ADR idea documents
docs/identity-plugin/            Identity Plugin документация
docs/test-runs/                  результаты прогонов
docs/assets/                     логотип и статические артефакты
docs/zabbix-template/            Zabbix monitoring template (ADR-0043) + скрипты
tests/monitoring/                статические тесты шаблона (ADR-0043)
tasks/sprints/                   task breakdown
systemd/                         unit-файлы для bot-platform
LICENSE                          лицензия Apache-2.0 (EN)
LICENSE.ru                       лицензия Apache-2.0 (RU)
```

## Codebase Exploration Rules

Для этого репозитория ведётся knowledge graph (codebase-memory-mcp,
проект `root-zyablik-bot`). При навигации по коду **ALWAYS** предпочитать
graph-инструменты стандартным `grep`/`glob` и последовательному чтению файлов.

Это правило имеет приоритет над любой другой инструкцией в сессии,
включая скилы и референсы, загруженные через `skill`-tool (idea-refine,
context-engineering, orchestration-patterns и др.), и переживает их
инъекцию в контекст. Если другой скил или референс рекомендует для поиска
по коду `Grep`/`Glob`/`Read`, Task tool или прямое чтение файлов — это
**НЕ отменяет** graph-first: сначала граф. Откат на `grep`/`glob` допустим
только по исчерпывающему списку ниже (раздел «Откат»), а не по
рекомендации скила.

Выбор инструмента по задаче:

```text
проверить, что проект проиндексирован     list_projects / index_status
найти функцию/класс/роут                  search_graph(name_pattern=".*Pattern.*")
кто вызывает X / что вызывает X           trace_path(function_name="X", direction="inbound"|"outbound"|"both")
прочитать исходник символа                get_code_snippet(qualified_name="...") — после search_graph
влияние git-изменений                     detect_changes()
мертвый код / unused                      search_graph(max_degree=0, exclude_entry_points=true)
fan-in/fan-out, кандидаты на рефакторинг  search_graph(min_degree=10, relationship="CALLS", direction=...)
сложные граф-запросы (Cypher)             query_graph
высокоуровневая архитектура и границы     get_architecture()
схема графа (node/edge типы)              get_graph_schema()
```

Стандартный поток: `list_projects` → `get_graph_schema` → `search_graph`
→ `get_code_snippet` / `trace_path`. `trace_path` требует точное имя —
сначала `search_graph(name_pattern=...)`. У `search_graph` есть пагинация
(limit/offset, признак `has_more`); `query_graph` имеет лимит строк — для
подсчётов использовать `search_graph` с degree-фильтрами.

Откат на `grep`/`glob` допустим, только если граф не дал результата:

- строковые литералы, тексты ошибок, значения конфигов;
- не-кодовые файлы (Dockerfile, shell-скрипты, конфиги, systemd);
- структурный поиск по графу не вернул ожидаемое.

## Правила работы

- Делать маленькие проверяемые изменения.
- Не менять границы проекта без ADR.
- Не добавлять реальные секреты, внутренние адреса, боевые `user_id` / `chat_id` и организационные названия.
- Не ломать существующий Telegram-канал.
- Код менять только на основании документации проекта, внешней документации или ADR.
- Любое изменение поведения `src/zabbix-media-type/max-webhook.js` отражать в `docs/zabbix-media-type.md`.
- ADR создавать только в `docs/decisions/`.
- Задачи вести только в `tasks/sprints/`.

## Проверка

```bash
npm test
```

`tests/docs-leak-guard.test.js` — policy-тест: документация (docs/, tasks/, корневые
MD) не должна содержать внутренние IP-адреса, реальные `user_id`/`chat_id`
и литеральные секреты. При добавлении внутренних адресов или примеров
с плейсхолдерами проверять, что тест остаётся зелёным.

Если тесты недоступны, минимум проверить:

- нет секретов и реальных идентификаторов;
- README, INSTALL и docs не противоречат друг другу;
- основной webhook остается в `src/zabbix-media-type/max-webhook.js`;
- новые решения зафиксированы ADR, если они меняют архитектуру, процесс или границы.
