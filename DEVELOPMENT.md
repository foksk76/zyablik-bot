# Development guide

Этот файл описывает, как вести разработку проекта с участием человека и AI-агентов.

## Рабочий цикл

1. Проверить границы проекта в `AGENTS.md` и `docs/project-context.md`.
2. Проверить критерии завершения первого этапа в `docs/project-acceptance.md`.
3. Проверить прошлые решения в `docs/decisions/README.md`.
4. Проверить план работ в `tasks/sprints/`.
5. Выбрать задачу из `tasks/sprints/`.
6. Выделить изолированную ветку (одна задача — одна ветка → PR в `main`,
   ADR-0048); правки в `main` напрямую не делаются.
7. Внести минимальное изменение. Dev-следы (отладочные логи, заглушки,
   исследовательский код) в `src/bot-platform` строго маркировать
   `/* DEV-ONLY: <ссылка> */ ... /* END DEV-ONLY */` (однострочные —
   `// DEV-ONLY: <ссылка>`); ссылка — на существующий `ADR-NNNN` или
   `tasks/sprints/sprint-NN.md` (ADR-0047).
8. Обновить документацию, если изменилось поведение.
9. Обновить ADR, если изменилось техническое решение, процесс или граница проекта.
10. Перед ревью прогнать чистую сборку и проверку:

```bash
npm run build:clean
npm test
```

11. Оформить результат в PR; ревью человеком идёт по чек-листу (бизнес-логика,
    цели спринта, чистота концепции), синтаксис и dev-мусор проверены
    автоматикой (ADR-0048).

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
scripts/clean-build.js                   чистая сборка (ADR-0047)
tests/clean-build.test.js                policy-тест чистой сборки (ADR-0047)
tests/                                   Node.js policy tests и статические проверки
.github/workflows/verify.yml             автоматический запуск проверок в GitHub Actions
```

## Dev-маркеры и чистая сборка (ADR-0047)

Вся отладочная информация, тестовые заглушки и исследовательский код в
`src/bot-platform` маркируются блочным комментарием:

```js
/* DEV-ONLY: ADR-0047 */
// ... dev-код, заглушка, исследовательский фрагмент
/* END DEV-ONLY */
```

или однострочно — `// DEV-ONLY: <ссылка>`. Ссылка обязана указывать на
существующий файл: `ADR-NNNN` (резолвится в `docs/decisions/ADR-NNNN-*.md`)
или `tasks/sprints/sprint-NN.md` — существование проверяет
`scripts/clean-build.js`.

Ссылки на не-поставляемую документацию в комментариях (`ADR-NNNN`,
`tasks/sprints/sprint-NN.md`, прочее из `docs/`/`tasks/`) оформляются маркером
`DOC-REF` (слой 2, ADR-0047): `// DOC-REF: <ссылка>` — такой комментарий
объясняет продукт через документ, которого нет в релизе, и вырезается чистой
сборкой как `DEV-ONLY`, но помечает только строки комментариев. Применяется
к `src/bot-platform` и `src/queue-monitor`. Немаркированная ссылка на документ
в комментарии — ошибка гейта чистой сборки.

Слой 1: user-facing строки (`description` в `config-schema.js`,
`ui/package.json`) не содержат номеров ADR — ссылки выносятся в
`DOC-REF`-комментарий, текст правится в исходнике, а не сборкой.

`npm run build:clean` вырезает маркированные фрагменты и формирует чистую
версию в `dist/clean/` (зеркало `src/bot-platform` + `src/queue-monitor` без
`DEV-ONLY`). Policy-тест `tests/clean-build.test.js` и гейт CI проверяют, что
в `dist/clean/` нет `DEV-ONLY`, и что ключевые модули загружаются. Dev-стенд
запускается из `main` напрямую (с маркерами); прод — из `dist/clean/`.

**Статус механики (ADR-0047):** `scripts/clean-build.js`,
`tests/clean-build.test.js`, команда `build:clean` и шаг в `verify.yml`
реализуются задачей `tasks/sprints/sprint-43.md`; до её завершения команда
`npm run build:clean` недоступна и шаги выше не выполняются.

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
