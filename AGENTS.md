# AGENTS.md

Инструкции для Codex и других AI-агентов, работающих с этим репозиторием.

## Назначение проекта

Проект решает узкую прикладную задачу: доставка уведомлений из Zabbix в МАХ через отдельный Zabbix Media type с типом `Webhook`.

Текущая граница: транспорт уведомлений Zabbix -> МАХ. Без SIEM-интеграции, без AI-аналитики, без автоматического реагирования и без управления событиями Zabbix из мессенджера.

## Перед началом работы

1. Прочитать `README.md`.
2. Прочитать `.agents/project-context.md`.
3. Прочитать `docs/project-context.md`.
4. Проверить план задач в `tasks/plan.md`.
5. Проверить исполняемый список задач в `tasks/todo.md`.
6. Проверить прошлые решения в `docs/decisions/README.md`.
7. Проверить правила внешних skills в `docs/agent-skills-integration.md`.
8. Не менять границы проекта без отдельного решения в ADR.

## Каноничные источники контекста

```text
README.md                         быстрый вход в проект
docs/project-context.md            рабочий контекст и границы проекта
docs/documentation-policy.md       правила ведения документации
docs/decisions/                    каноничное место для ADR
tasks/plan.md                      план работ по planning-and-task-breakdown
tasks/todo.md                      исполняемый список задач
AGENTS.md                          правила для AI-агентов
.agents/                           рабочая область агента, не хранилище решений и задач
```

Если между файлами есть противоречие, приоритет такой:

```text
docs/decisions/ -> docs/project-context.md -> tasks/plan.md -> tasks/todo.md -> AGENTS.md -> README.md -> .agents/
```

## Внешний набор skills

Основной внешний набор skills:

```text
https://github.com/addyosmani/agent-skills
```

Репозиторий `agent-skills` не добавляется как git submodule и не включается в историю этого проекта целиком.

Для разработки используются только ссылки, локальная установка в профиль пользователя или локальная копия в игнорируемом каталоге.

## Рекомендуемые skills

Для этого проекта рекомендуются:

```text
using-agent-skills
spec-driven-development
planning-and-task-breakdown
incremental-implementation
test-driven-development
code-review-and-quality
security-and-hardening
debugging-and-error-recovery
documentation-and-adrs
```

## Использование в чате OpenAI

При разработке в чате OpenAI применяй skills как рабочие процессы по смыслу задачи.

Правило:

- задача на описание, README, ADR, changelog, архитектурное решение или фиксацию контекста -> использовать `documentation-and-adrs`;
- новая функциональность -> сначала `spec-driven-development`, затем `planning-and-task-breakdown`;
- изменение webhook-кода -> `incremental-implementation` и `test-driven-development`;
- проверка изменений -> `code-review-and-quality` и при необходимости `security-and-hardening`;
- ошибка или неожиданное поведение -> `debugging-and-error-recovery`.

Если текст конкретного skill не загружен в контекст, использовать внешний репозиторий как источник и загружать только нужный `SKILL.md`, а не весь набор skills.

## Использование в Codex CLI / Codex IDE / других IDE

При переключении из чата OpenAI на локальную разработку установить skills одним из способов:

```bash
npx skills add addyosmani/agent-skills --list
npx skills add addyosmani/agent-skills --skill planning-and-task-breakdown
npx skills add addyosmani/agent-skills --skill documentation-and-adrs
```

или локально, в игнорируемую директорию проекта:

```bash
git clone https://github.com/addyosmani/agent-skills.git .agents/external-skills/agent-skills
```

Каталоги для локальных skills добавлены в `.gitignore`.

## Правила изменений

- Делать маленькие, проверяемые изменения.
- Не добавлять реальные секреты, внутренние адреса, боевые идентификаторы чатов и организационные названия.
- Не ломать существующий Telegram-канал. МАХ рассматривается как дополнительный канал доставки.
- Для пользовательской документации писать по-русски, коротко и понятно для инженерного ИТ-состава.
- Для кода использовать простой стиль, без лишних зависимостей и скрытой магии.
- Любое изменение поведения webhook фиксировать в `docs/zabbix-media-type.md`.
- Любое архитектурное решение или существенное изменение документации вести через подход `documentation-and-adrs`.
- ADR создавать в `docs/decisions/`, а не в `.agents/`.
- Задачи создавать и обновлять в `tasks/plan.md` и `tasks/todo.md`, а не в `.agents/`.

## Проверка перед завершением задачи

Запустить локальную проверку репозитория:

```bash
bash scripts/verify-repo.sh
```

Если скрипт недоступен в среде выполнения, вручную проверить:

- нет реальных секретов и внутренних адресов;
- README не противоречит документации;
- основной webhook-скрипт находится в `src/zabbix-media-type/max-webhook.js`;
- изменения не расширяют проект за пределы текущего этапа;
- новые решения зафиксированы в `docs/decisions/`, если они меняют архитектуру, процесс или границы проекта;
- новые задачи оформлены в `tasks/todo.md` с acceptance criteria, verification, dependencies и estimated scope.

## Как отвечать на review

- Сначала признать найденную проблему, если она подтверждается.
- Предлагать минимальное исправление.
- Не добавлять новые функции вместо исправления замечания.
- Если замечание меняет архитектуру, оформить ADR в `docs/decisions/`.
