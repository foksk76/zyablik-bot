# Подключение agent-skills

Документ фиксирует порядок использования внешнего набора skills в проекте.

## Источник

Внешний репозиторий skills:

```text
https://github.com/addyosmani/agent-skills
```

Репозиторий содержит Markdown-first skills для AI coding agents. Для проекта он используется как внешний источник рабочих процессов, а не как runtime-зависимость.

## Принятое решение

1. Не добавлять `agent-skills` как git submodule.
2. Хранить в проекте только ссылку на внешний репозиторий и правила использования.
3. Использовать skills выборочно, в зависимости от задачи.
4. В чате OpenAI применять подход skills как рабочий процесс по смыслу задачи.
5. Для Codex CLI, Codex VS Code Plugin, Codex Desktop и других IDE устанавливать skills в профиль пользователя или в локальную копию репозитория, добавленную в `.gitignore`.

## Рекомендуемые skills

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

## Правила для OpenAI chat

В чате OpenAI skills не устанавливаются как локальный пакет. Они применяются как набор правил и workflow.

Если задача относится к документации, архитектурным решениям, README, changelog или фиксации контекста, использовать `documentation-and-adrs`.

Если нужно точное следование конкретному skill, загружать только нужный файл `SKILL.md` из внешнего репозитория.

## Правила для Codex CLI / IDE

Рекомендуемый вариант — установка в профиль пользователя через CLI:

```bash
npx skills add addyosmani/agent-skills --list
npx skills add addyosmani/agent-skills --skill documentation-and-adrs
```

Альтернативный вариант — локальная копия в игнорируемом каталоге проекта:

```bash
git clone https://github.com/addyosmani/agent-skills.git .agents/external-skills/agent-skills
```

Эта локальная копия нужна только для рабочего окружения и не должна попадать в коммиты.

## documentation-and-adrs

Skill `documentation-and-adrs` подходит для ведения документации проекта.

Использовать его, когда:

- принимается архитектурное решение;
- выбирается один из нескольких вариантов реализации;
- меняется поведение webhook или формат настройки;
- обновляется README или эксплуатационная документация;
- фиксируется контекст, который понадобится будущему инженеру или AI-агенту;
- обновляется changelog.

Для этого проекта ADR хранятся в:

```text
.agents/adr/
```

Документация по настройке и эксплуатации хранится в:

```text
docs/
```

## Что не делать

- Не копировать весь внешний репозиторий в историю проекта.
- Не добавлять `agent-skills` как submodule без отдельного ADR.
- Не загружать все skills в контекст без необходимости.
- Не заменять проектную документацию ссылкой на внешний skill.
