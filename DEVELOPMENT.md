# Development guide

Этот файл описывает, как вести разработку проекта с участием человека и AI-агентов.

## Рабочий цикл

1. Проверить границы проекта в `AGENTS.md` и `docs/project-context.md`.
2. Проверить критерии завершения первого этапа в `docs/project-acceptance.md`.
3. Проверить прошлые решения в `docs/decisions/README.md`.
4. Проверить план работ в `tasks/sprints/`.
5. Выбрать задачу из `tasks/sprints/`.
6. Внести минимальное изменение.
7. Обновить документацию, если изменилось поведение.
8. Обновить ADR, если изменилось техническое решение, процесс или граница проекта.
9. Запустить проверку:

```bash
npm test
```

10. Оформить результат в PR или коротком описании изменений.

## Основные файлы

```text
README.md                                общее описание проекта
AGENTS.md                                правила для AI-агентов
docs/project-context.md                  полный контекст проекта
docs/project-acceptance.md               критерии завершения первого этапа
docs/decisions/                          ADR и история решений
tasks/sprints/                           task breakdown
src/zabbix-media-type/max-webhook.js     основной webhook-скрипт
docs/zabbix-media-type.md                описание настройки Zabbix Media type
tests/                                   Node.js policy tests и статические проверки
.github/workflows/verify.yml             автоматический запуск проверок в GitHub Actions
```

## Методы разработки, тестирования и прогонов

| Метод | Когда применять | Результат | Skill |
|---|---|---|---|
| Spec-first | Перед новой функцией или изменением поведения | Уточненное описание изменения и границ | `spec-driven-development` |
| Task breakdown | Перед началом реализации | Задача в `tasks/sprints/` с критериями и проверкой | `planning-and-task-breakdown` |
| Incremental change | При правке кода или документации | Минимальный diff без лишней функциональности | `incremental-implementation` |
| Documentation/ADR | При техническом решении или изменении правил | ADR или обновленный документ | `documentation-and-adrs` |
| Repository policy tests | После любой правки | Успешный `npm test` | `code-review-and-quality` |
| Format harness | При проверке формирования сообщения | Проверка текста без реальной отправки | `test-driven-development` |
| Integration run | При проверке Zabbix -> МАХ | Подтвержденная отправка на тестового получателя | `debugging-and-error-recovery` |
| Acceptance run | Перед закрытием первого этапа | Проверка по `docs/project-acceptance.md` | `code-review-and-quality` |
| Security review | Перед публикацией изменений | Нет чувствительных значений и внутренних названий | `security-and-hardening` |

## Виды прогонов

```text
Repo check              npm test
Static docs check       tests/docs-wording.test.js
Media params check      tests/media-params.test.js
Webhook static check    tests/webhook-static.test.js
Structure check         tests/repo-structure.test.js
Format harness          проверка формирования сообщения без отправки
Zabbix Media type test  ручной тест Media type в Zabbix
Integration run         Zabbix -> MAX на тестового получателя
Problem/Recovery run    проверка события и восстановления
Regression run          Telegram-канал продолжает работать
Acceptance run          финальная проверка по docs/project-acceptance.md
```

Если для прогона не хватает документации или подтвержденного поведения API, сначала создается задача на уточнение документации или ADR. Код не пишется на предположениях.

## Изменение webhook-скрипта

Если меняется логика `src/zabbix-media-type/max-webhook.js`, обязательно проверить:

- не поменялся ли формат ожидаемых параметров Zabbix;
- не появились ли реальные значения параметров;
- не сломана ли отправка Problem/Recovery;
- обновлен ли `docs/zabbix-media-type.md`;
- нужен ли новый ADR в `docs/decisions/`.

## Задачи

Задачи ведутся только в:

```text
tasks/sprints/
```

Новая задача должна иметь:

- описание;
- acceptance criteria;
- verification;
- dependencies;
- files likely touched;
- estimated scope;
- method;
- skill.

`.agents/` используется как рабочий контекст агента, но не как хранилище задач.

## Технические решения

Если задача требует нового runtime, тестового harness, отдельного сервиса, очереди, базы данных, новой интеграции или изменения границ этапа, сначала создать ADR в `docs/decisions/`.

ADR должен объяснять:

- контекст;
- принятое решение;
- рассмотренные альтернативы;
- последствия.

## Документация

Короткое правило: код показывает что сделано, документация объясняет почему это сделано именно так.

## Стиль

Документация пишется по-русски, без лишнего маркетинга. Формулировки должны быть понятны инженерам, администраторам мониторинга и сопровождающим сервисов.
