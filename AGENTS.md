# AGENTS.md

Короткая инструкция для Codex и других AI-агентов, работающих с этим репозиторием.

## Назначение проекта

Проект доставляет уведомления из Zabbix в МАХ через отдельный Zabbix Media type с типом `Webhook`.

Текущая граница:

```text
Zabbix -> MAX Bot API -> пользователь или чат в МАХ
```

Не расширять проект до SIEM, AI-аналитики, автоматического реагирования, очереди сообщений, журнала доставки или управления событиями Zabbix из мессенджера без отдельного ADR.

## Быстрый вход

Перед изменениями прочитать:

1. `README.md`
2. `INSTALL.md`
3. `docs/project-context.md`
4. `docs/decisions/README.md`
5. `tasks/plan.md`
6. `tasks/todo.md`

Если меняется Zabbix Media type, дополнительно прочитать:

```text
docs/zabbix-media-type.md
src/zabbix-media-type/max-webhook.js
examples/media-params.md
```

Если меняется live identity bot, дополнительно прочитать:

```text
docs/live-identity-bot.md
docs/runbooks/live-identity-bot.md
docs/task-18-breakdown.md
```

## Каноничные источники

```text
docs/decisions/                 архитектурные и процессные решения
docs/project-context.md          текущий контекст и границы
docs/project-acceptance.md       project-level критерии
docs/documentation-policy.md     правила документации
tasks/plan.md                    план работ
tasks/todo.md                    исполняемый список задач
README.md                        быстрый вход для человека
INSTALL.md                       краткая установка
AGENTS.md                        быстрый вход для AI-агента
```

Если файлы противоречат друг другу, приоритет выше у ADR и профильных документов в `docs/`.

## Правила работы

- Делать маленькие проверяемые изменения.
- Не менять границы проекта без ADR.
- Не добавлять реальные секреты, внутренние адреса, боевые `user_id` / `chat_id` и организационные названия.
- Не ломать существующий Telegram-канал.
- Пользовательскую документацию писать по-русски, коротко и понятно для инженерного ИТ-состава.
- Код менять только на основании документации проекта, внешней документации или ADR.
- Любое изменение поведения `src/zabbix-media-type/max-webhook.js` отражать в `docs/zabbix-media-type.md`.
- ADR создавать только в `docs/decisions/`.
- Задачи вести только в `tasks/plan.md` и `tasks/todo.md`.

## Проверка

Перед завершением задачи запустить:

```bash
npm test
```

Если тесты недоступны, минимум проверить по содержанию файлов:

- нет секретов и реальных идентификаторов;
- README, INSTALL и docs не противоречат друг другу;
- основной webhook остается в `src/zabbix-media-type/max-webhook.js`;
- новые решения зафиксированы ADR, если они меняют архитектуру, процесс или границы.
