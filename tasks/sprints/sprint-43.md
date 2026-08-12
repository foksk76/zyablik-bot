# Sprint 43: Dev-маркеры и чистая сборка (ADR-0047/0048) — реализация механики

**Цель:** реализовать принятый механизм ADR-0047 (dev-маркеры + чистая сборка
+ гейт CI) и зафиксировать жизненный цикл ADR-0048: `scripts/clean-build.js`,
`tests/clean-build.test.js`, команда `npm run build:clean`, шаг в `verify.yml`,
разметка комментариев `DOC-REF` (слой 2) и очистка user-facing строк от номеров
ADR (слой 1). До этого спринта механика существует только как решение в ADR;
`AGENTS.md`/`DEVELOPMENT.md` уже ссылаются на неё, но команда `build:clean`
недоступна.

**ADR:**
[ADR-0047](../../docs/decisions/ADR-0047-dev-markers-and-clean-build.md)
[ADR-0048](../../docs/decisions/ADR-0048-automated-dev-lifecycle.md)
**Источник:** `docs/ideas/automated-dev-lifecycle.md` (ревизия 2), ADR-0047
(раздел «Статус реализации»)

**Контекст:** ограничения проекта — нулевые внешние зависимости для
bot-platform (ADR-0015), единственная проверка `npm test` (ADR-0004),
CI уже запускается на PR/push в `main` (`verify.yml`). Чистая сборка должна
быть hand-rolled на stdlib Node.

**Границы:** без изменений поведения webhook (`src/zabbix-media-type/`).
`src/zabbix-media-type/max-webhook.js` остаётся единым файлом без
dev-маркеров. Изменения — только механика сборки, маркеры, гейт, docs.

## Architecture Decisions

- **DEV-ONLY вырезается только из `src/bot-platform`** (webhook и React UI —
  вне dev-маркеров); `DOC-REF` (слой 2) — из `src/bot-platform` и
  `src/queue-monitor`; `src/queue-monitor` копируется в `dist/clean/` целиком,
  кроме dev-only артефактов UI (см. ADR-0047 «Содержимое dist/clean»).
- **Слой 1:** user-facing строки (`description` в `config-schema.js`,
  `ui/package.json`) правятся в исходнике, а не вырезаются сборкой.
- **Гейт смотрит на результат чистой сборки, а не на diff:** маркеры
  разрешены в `src/` и в `main`, `dist/clean/` обязано быть свободным.
- **Ссылка в маркере обязана существовать:** `ADR-NNNN` (резолвится в
  `docs/decisions/ADR-NNNN-*.md`) или `tasks/sprints/sprint-NN.md`;
  `clean-build.js` валидирует существование и завершается с ошибкой.

## Tasks

### Task 1: `scripts/clean-build.js` + `npm run build:clean` + `tests/clean-build.test.js`

**Status:** Pending

**Description:** hand-rolled Node-скрипт (stdlib, без внешних зависимостей —
ADR-0015). Формирует `dist/clean/` как зеркало `src/bot-platform` (вырезая
`DEV-ONLY`-фрагменты) и `src/queue-monitor` (копия с вырезанием `DOC-REF`,
исключая dev-only артефакты UI: `ui/node_modules/`, `ui/dist/`,
`ui/src/stories/`, `ui/test/`, `ui/.storybook/`, `ui/components.json`).
Валидирует существование файлов-целей ссылок в маркерах. Команда
`npm run build:clean` в `package.json`.

**Acceptance criteria:**
- [ ] `npm run build:clean` формирует `dist/clean/bot-platform` и `dist/clean/queue-monitor` без `DEV-ONLY` и `DOC-REF`
- [ ] Ссылка на несуществующий ADR/спринт в маркере → ошибка сборки с указанием файла и строки
- [ ] `tests/clean-build.test.js` проверяет: нет `DEV-ONLY`/`DOC-REF`/ссылок на документацию, ключевые модули загружаются по абсолютному пути от корня репо
- [ ] `npm test` зелёный (включая новый policy-тест)

**Files:** `scripts/clean-build.js`, `package.json`,
`tests/clean-build.test.js`

**Dependencies:** —

**Estimated scope:** M

---

### Task 2: Гейт CI на чистую сборку (`verify.yml`)

**Status:** Pending

**Description:** в `.github/workflows/verify.yml` добавить шаг
`npm run build:clean` + прогон `tests/clean-build.test.js` на PR и push в
`main`. Гейт проверяет результат чистой сборки, а не diff.

**Acceptance criteria:**
- [ ] `verify.yml` содержит шаг `build:clean` + policy-тест чистой сборки
- [ ] `npm test` (с чисткой) зелёный локально

**Files:** `.github/workflows/verify.yml`

**Dependencies:** Task 1

**Estimated scope:** XS

---

### Task 3: Слой 2 — разметка комментариев `DOC-REF`

**Status:** Pending

**Description:** механическая замена ссылок на документацию в комментариях
`src/bot-platform` и `src/queue-monitor`: `// ADR-NNNN ...` →
`// DOC-REF: ADR-NNNN ...` (и блочные `/* DOC-REF */ ... /* END DOC-REF */`),
~80 комментариев. Немаркированная ссылка на документ в комментарии — ошибка
гейта чистой сборки (проверяется тестом слоя 2).

**Acceptance criteria:**
- [ ] Все ссылки на `ADR-NNNN`/`sprint-NN.md`/`docs/`/`tasks/` в комментариях `src/` оформлены `DOC-REF`
- [ ] Немаркированная ссылка в комментарии обнаруживается тестом/гейтом
- [ ] `npm test` зелёный

**Files:** `src/bot-platform/**`, `src/queue-monitor/**`,
`tests/clean-build.test.js`

**Dependencies:** Task 1

**Estimated scope:** M

---

### Task 4: Слой 1 — user-facing строки без номеров ADR

**Status:** Pending

**Description:** из `description` в `src/bot-platform/core/config-schema.js`
и `src/queue-monitor/ui/package.json` убрать ссылки вида `(ADR-NNNN)`;
ссылки перенести в `DOC-REF`-комментарии над полем схемы. Текст остаётся
продуктовым; сборка user-facing строки не трогает.

**Acceptance criteria:**
- [ ] В `description` (`config-schema.js`, `ui/package.json`) нет `ADR-\d{4}`
- [ ] Ссылки сохранены в `DOC-REF`-комментариях
- [ ] `npm test` зелёный

**Files:** `src/bot-platform/core/config-schema.js`,
`src/queue-monitor/ui/package.json`, `tests/clean-build.test.js`

**Dependencies:** —

**Estimated scope:** S

---

## Checkpoint: Sprint 43

- [ ] `scripts/clean-build.js` + `npm run build:clean` работают
- [ ] `tests/clean-build.test.js` проверяет чистый артефакт (слои 1 и 2)
- [ ] `verify.yml` гейт на `dist/clean/`
- [ ] Слой 1 и слой 2 закрыты
- [ ] `npm test` зелёный
- [ ] `DEVELOPMENT.md`/`AGENTS.md` обновлены: пункты про `build:clean`
      переведены из «после реализации» в действующие

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Вырезание ломает «чистый» продукт | High | Policy-тест загружает ключевые модули `dist/clean/`; верификация до merge |
| Рассинхрон `src/` ↔ `dist/clean/` в user-facing строках | Medium | Слой 1 правят в исходнике; diff-гейт + тест на `description` |
| Пропуск маркировки | Medium | Гейт проверяет результат чистой сборки, а не diff (ADR-0047) |

## Файлы для изменения (сводка)

```
scripts/clean-build.js              (Task 1)
package.json                        (Task 1: script build:clean)
tests/clean-build.test.js           (Task 1)
.github/workflows/verify.yml        (Task 2)
src/bot-platform/**                 (Task 3: DOC-REF)
src/queue-monitor/**                (Task 3: DOC-REF)
src/bot-platform/core/config-schema.js  (Task 4: слой 1)
src/queue-monitor/ui/package.json   (Task 4: слой 1)
```
