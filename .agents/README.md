# AI workspace

Каталог `.agents/` хранит рабочий контекст для AI-разработки и помогает не терять рамки проекта между сессиями.

## Структура

```text
.agents/
  project-context.md              краткий контекст проекта
  README.md                       карта AI workspace
  tasks/
    current.md                    текущая задача
    backlog.md                    накопительный список задач
  adr/
    ADR-0001-ai-assisted-dev.md   решение о формате AI-assisted разработки
  checklists/
    pre-commit.md                 проверка перед фиксацией изменений
    security.md                   проверка на чувствительные данные
  prompts/
    implement.md                  шаблон задания на реализацию
    review.md                     шаблон задания на code review
```

## Принцип

Все файлы здесь служебные. Они не заменяют README и документацию, а помогают Codex/AI-агенту быстрее войти в контекст и не раздувать проект лишними функциями.
