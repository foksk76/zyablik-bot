# Zabbix MAX Alert Bot

Небольшой проект для доставки уведомлений из Zabbix в корпоративный мессенджер МАХ.

Смысл простой: события мониторинга должны быстро доходить до тех, кто за них отвечает или заинтересован в их получении. Рабочий канал Telegram остается без изменений. МАХ добавляется как второй канал доставки.

На первом этапе проект не пытается быть большой платформой, SIEM-интеграцией или AI-помощником. Это прикладная интеграция Zabbix -> МАХ для отправки уведомлений о проблемах, сбоях и восстановлении сервисов.

## Задача первого этапа

Реализовать отдельный Media type в Zabbix с типом `Webhook`, который отправляет сообщения в MAX Bot API.

```text
Zabbix Action
  ├─ Telegram Webhook
  └─ MAX Webhook
       └─ MAX Bot API
            └─ чат ответственных или заинтересованных получателей
```

## Repo map

```text
.github/          шаблоны issue, pull request и GitHub Actions workflow
.agents/          рабочий контекст, prompts и чек-листы для AI/Codex
AGENTS.md         инструкции для Codex и AI-агентов
CHANGELOG.md      журнал заметных изменений
DEVELOPMENT.md    процесс разработки
SECURITY.md       правила безопасного ведения проекта
docs/             проектная и эксплуатационная документация
docs/decisions/   каноничное место для ADR
tasks/            план работ и исполняемый список задач
examples/         параметры Zabbix Media type и примеры сообщений
src/              исходники webhook-скрипта для Zabbix
tests/            Node.js policy tests и статические проверки
```

## Основной файл

```text
src/zabbix-media-type/max-webhook.js
```

Это JavaScript-скрипт для Zabbix Media type `Webhook`. Его можно вставить в поле `Скрипт` при создании нового способа оповещения в Zabbix.

## Документация и решения

Документация ведется по подходу `documentation-and-adrs`: фиксируем не только что сделано, но и почему выбран именно такой вариант.

Основные документы:

```text
docs/project-context.md
docs/project-acceptance.md
docs/live-identity-bot.md
docs/documentation-policy.md
docs/decisions/README.md
docs/agent-skills-integration.md
docs/zabbix-media-type.md
```

Критерии завершения проекта хранятся только в `docs/project-acceptance.md`.

Текущий статус live-сценария бота МАХ для `user_id` / `chat_id` описан в `docs/live-identity-bot.md`.

Для локальной проверки bot-platform без реального MAX API см. `docs/third-stage-implementation-plan.md` и `examples/bot-platform/README.md`.

Перед изменением архитектуры, границ проекта, процесса разработки или внешних зависимостей сначала проверяются ADR в `docs/decisions/`.

## Задачи

Задачи ведутся по подходу `planning-and-task-breakdown`.

Каноничные файлы задач:

```text
tasks/plan.md
tasks/todo.md
```

Каждая задача должна иметь описание, acceptance criteria, verification, dependencies, files likely touched и estimated scope.

## Разработка с AI / Codex

Перед началом работы агент должен прочитать:

```text
AGENTS.md
.agents/project-context.md
docs/project-context.md
docs/project-acceptance.md
docs/decisions/README.md
docs/agent-skills-integration.md
tasks/plan.md
tasks/todo.md
```

Внешний набор skills используется ссылкой, без submodule. Детали описаны в `docs/agent-skills-integration.md`.

Для документации и ADR используется `documentation-and-adrs`. Для задач используется `planning-and-task-breakdown`.

Базовая проверка проекта:

```bash
npm test
```

Алиас команды:

```bash
npm run verify
```

Проверка автоматически запускается в GitHub Actions через `.github/workflows/verify.yml`.

## Статус

Zabbix -> МАХ доставка подтверждена: Media type `MAX` работает, существующий Telegram-канал продолжает работать, МАХ дублирует Telegram, GitHub Actions green.

По ADR-0010 live-сценарий MAX Identity Bot считается принятым только после отдельного обезличенного live test-run: бот должен получить реальное сообщение в МАХ и отправить реальный ответ с `user_id` / `chat_id` через MAX Bot API. Dry-run и safe test bot не считаются достаточным доказательством live-приемки.

Post-acceptance follow-up:

- Task 13 выполнена и подтверждена в `docs/test-runs/task-13-transport-mode-switch-run.md`.
- Task 6 и Task 7 остаются future/deferred и не блокируют завершение проекта.
- Task 18.1 закрыта: официальный MAX Bot API source подтвержден.
- Task 18.2 закрыта: первым live transport mode выбран `long_polling`, `webhook` оставлен как `Не реализовано`.
- Task 18.3-18.10 остаются открытыми для live MAX Identity Bot.
