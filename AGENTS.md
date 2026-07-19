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
tests/                           policy-тесты и unit tests (bot-platform)
docs/decisions/                  ADR
docs/identity-plugin/            Identity Plugin документация
tasks/sprints/                   task breakdown
systemd/                         unit-файлы для bot-platform
```

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

Если тесты недоступны, минимум проверить:

- нет секретов и реальных идентификаторов;
- README, INSTALL и docs не противоречат друг другу;
- основной webhook остается в `src/zabbix-media-type/max-webhook.js`;
- новые решения зафиксированы ADR, если они меняют архитектуру, процесс или границы.
