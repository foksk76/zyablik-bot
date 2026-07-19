# Sprint 18: Пре-продакшн: лицензия Apache-2.0, бренд «Зяблик», ренейминг в zyablik-bot

## Outcome

Переименовать проект из `zabbix-max-alert-bot` в `zyablik-bot`, добавить
лицензию Apache-2.0 (EN + RU), загрузить логотип и оформить README как
«посадочную страницу» для получателей уведомлений. Один ADR (ADR-0031),
один PR.

Контекст: ADR-0031 принят (2026-07-19). Проект уходит в публичный open
source. Техническое имя `zabbix-max-alert-bot` описывает только Zabbix-кейс,
хотя проект расширяется до multi-source платформы (ADR-0022). Нет лицензии,
нет визуальной идентичности.

340 тестов passing. CI workflows не ссылаются на имя репо (actions/checkout
автоматически определяет).

## Architecture Decisions

- **ADR-0031:** Apache-2.0 (patent protection, CRA-compatible, recognized
  in RU/EU/US). Два файла: LICENSE + LICENSE.ru (официальный перевод).
- **Полный ренейминг:** один PR, все уровни (repo, package, docs, systemd).
  До публикации — ноль внешних ссылок, минимальный риск.
- **SPDX headers:** `// SPDX-License-Identifier: Apache-2.0` во всех
  `src/**/*.js` файлах. Тесты — без headers (не дистрибутивный код).
- **CI workflows без изменений:** `actions/checkout@v4` автоматически
  определяет имя репо. Переименование репо на GitHub — отдельная операция
  после мержа.

## Tasks

### Task 1: LICENSE — создать файл лицензии Apache-2.0 (EN)

**Status:** Done

**Description:** Создать `LICENSE` в корне репо с полным текстом Apache
License 2.0 и строкой copyright: `Copyright 2026 Kirill Fomichev`.

**Acceptance criteria:**
- [x] Файл `LICENSE` существует в корне репо
- [x] Содержит полный текст Apache License 2.0
- [x] Содержит `Copyright 2026 Kirill Fomichev`
- [x] Файл UTF-8 без BOM

**Verification:**
- [x] `head -5 LICENSE` показывает copyright строку
- [x] `wc -l LICENSE` — ~200 строк (полный текст)

**Dependencies:** None

**Files likely touched:**
- `LICENSE` (новый)

**Estimated scope:** XS (1 файл)

---

### Task 2: LICENSE.ru — создать русскую версию лицензии

**Status:** Done

**Description:** Создать `LICENSE.ru` с официальным переводом Apache
License 2.0 на русский язык (Apache-2.0 Foundation). Строка copyright:
`Copyright 2026 Kirill Fomichev`.

**Acceptance criteria:**
- [x] Файл `LICENSE.ru` существует в корне репо
- [x] Содержит официальный перевод Apache 2.0 на русский
- [x] Содержит `Copyright 2026 Kirill Fomichev`
- [x] Файл UTF-8 без BOM

**Verification:**
- [x] `head -5 LICENSE.ru` показывает copyright строку
- [x] Содержимое — русскоязычный текст лицензии

**Dependencies:** None

**Files likely touched:**
- `LICENSE.ru` (новый)

**Estimated scope:** XS (1 файл)

---

### Task 3: package.json — добавить поле license

**Status:** Done

**Description:** Добавить `"license": "Apache-2.0"` в `package.json`.
Не менять name на этом этапе — это отдельная задача.

**Acceptance criteria:**
- [x] `package.json` содержит `"license": "Apache-2.0"`
- [x] `name` остаётся `zabbix-max-alert-bot` (пока не переименовываем)
- [x] JSON валиден

**Verification:**
- [x] `npm test` passes
- [x] `node -e "console.log(require('./package.json').license)"` → `Apache-2.0`

**Dependencies:** None

**Files likely touched:**
- `package.json`

**Estimated scope:** XS (1 файл)

---

### Task 4: SPDX headers — добавить во все src/*.js файлы

**Status:** Done

**Description:** Добавить строку `// SPDX-License-Identifier: Apache-2.0`
в начало каждого `.js` файла в `src/` (38 файлов). Строка добавляется
после любых существующих комментариев `//`, но перед `require()` или
первой строкой кода.

**Acceptance criteria:**
- [x] Все 38 файлов в `src/**/*.js` содержат `// SPDX-License-Identifier: Apache-2.0`
- [x] Строканаходится в первой или второй строке (если первая строка — shebang или другой комментарий)
- [x] Существующий код не изменён

**Verification:**
- [x] `grep -r "SPDX-License-Identifier" src/ | wc -l` → 38
- [x] `npm test` passes

**Dependencies:** Task 3

**Files likely touched:**
- `src/**/*.js` (38 файлов)

**Estimated scope:** S (38 файлов, но однообразная замена)

---

### Task 5: CONTRIBUTING.md — добавить лицензионный grant

**Status:** Done

**Description:** Добавить в `CONTRIBUTING.md` строку о лицензии:
`By contributing, you agree to license your contributions under Apache-2.0`.

**Acceptance criteria:**
- [x] `CONTRIBUTING.md` содержит строку с Apache-2.0 grant
- [x] Ссылка на LICENSE файл присутствует

**Verification:**
- [x] `grep "Apache-2.0" CONTRIBUTING.md` возвращает результат

**Dependencies:** None

**Files likely touched:**
- `CONTRIBUTING.md`

**Estimated scope:** XS (1 файл)

---

### Task 6: Ренейминг package.json — name → zyablik-bot

**Status:** Done

**Description:** Изменить `name` в `package.json` с `zabbix-max-alert-bot`
на `zyablik-bot`. Одновременно обновить `description`:
`"Zyablik — bot for delivering notifications in MAX messenger"`.

**Acceptance criteria:**
- [x] `package.json` name: `zyablik-bot`
- [x] `package.json` description обновлена
- [x] JSON валиден

**Verification:**
- [x] `npm test` passes
- [x] `node -e "console.log(require('./package.json').name)"` → `zyablik-bot`

**Dependencies:** Task 3

**Files likely touched:**
- `package.json`

**Estimated scope:** XS (1 файл)

---

### Task 7: Ренейминг docs — project-context, .agents, INSTALL, AGENTS

**Status:** Done

**Description:** Обновить ссылки на имя проекта в документации:
- `docs/project-context.md`: заголовок и описание
- `.agents/project-context.md`: заголовок и описание
- `INSTALL.md`: `git clone` URL и описание
- `AGENTS.md`: структура репо, техническое имя

**Acceptance criteria:**
- [x] `docs/project-context.md`: нет упоминаний `zabbix-max-alert-bot`
- [x] `.agents/project-context.md`: нет упоминаний `zabbix-max-alert-bot`
- [x] `INSTALL.md`: `git clone` ссылается на `zyablik-bot`
- [x] `AGENTS.md`: структура репо обновлена

**Verification:**
- [x] `grep -r "zabbix-max-alert-bot" docs/ .agents/ INSTALL.md AGENTS.md` → 0 результатов
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `docs/project-context.md`
- `.agents/project-context.md`
- `INSTALL.md`
- `AGENTS.md`

**Estimated scope:** S (4 файла)

---

### Task 8: Реней밍 systemd + runbooks

**Status:** Done

**Description:** Переименовать systemd-сервисы и обновить runbooks:
- `systemd/max-identity-bot.service` → `zyablik-bot.service`
- `systemd/max-identity-bot-live.service` → `zyablik-bot-live.service`
- `docs/runbooks/bot-platform-stand.md`: обновить ссылки на сервисы
- `docs/runbooks/live-identity-bot.md`: обновить ссылки на сервисы

**Acceptance criteria:**
- [x] `systemd/zyablik-bot.service` существует
- [x] `systemd/zyablik-bot-live.service` существует
- [x] `systemd/max-identity-bot.service` удалён
- [x] `systemd/max-identity-bot-live.service` удалён
- [x] Runbooks ссылаются на `zyablik-bot.service`

**Verification:**
- [x] `ls systemd/` → `zyablik-bot.service`, `zyablik-bot-live.service`
- [x] `grep -r "max-identity-bot" docs/runbooks/` → 0 результатов
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `systemd/zyablik-bot.service` (новый)
- `systemd/zyablik-bot-live.service` (новый)
- `systemd/max-identity-bot.service` (удалён)
- `systemd/max-identity-bot-live.service` (удалён)
- `docs/runbooks/bot-platform-stand.md`
- `docs/runbooks/live-identity-bot.md`

**Estimated scope:** S (6 файлов)

---

### Task 9: README — логотип, badge, описание

**Status:** Done

**Description:** Обновить `README.md`:
- Заголовок: `# Зяблик / Zyablik`
- Логотип в шапке: `![Zyablik](docs/assets/zyablik-logo.png)`
- License badge: `![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)`
- Описание: «Зяблик — бот-получатель уведомлений в MAX»
- Секция `## License` в конце

**Acceptance criteria:**
- [x] README заголовок: `# Зяблик / Zyablik`
- [x] README содержит badge лицензии
- [x] README содержит секцию `## License`
- [x] README ссылается на `docs/assets/zyablik-logo.png`
- [x] Нет упоминаний `zabbix-max-alert-bot` в README

**Verification:**
- [x] `grep "zabbix-max-alert-bot" README.md` → 0 результатов
- [x] `grep "Apache" README.md` → результат
- [x] `npm test` passes

**Dependencies:** Task 1, Task 6

**Files likely touched:**
- `README.md`

**Estimated scope:** S (1 файл)

---

### Task 10: Logo — создать директорию assets

**Status:** Done

**Description:** Создать директорию `docs/assets/` и разместить
заглушку для логотипа. Реальный PNG будет добавлен позже (логотип
готов, нужна загрузка).

**Acceptance criteria:**
- [x] Директория `docs/assets/` существует
- [x] README ссылается на `docs/assets/zyablik-logo.png`
- [x] Если PNG ещё не загружен — README работает без изображения
  (alt text отображается)

**Verification:**
- [x] `ls docs/assets/` → существует
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `docs/assets/` (директория)

**Estimated scope:** XS (директория)

---

## Checkpoint: После Tasks 1-10

- [x] `npm test` passes (340 тестов)
- [x] `grep -r "zabbix-max-alert-bot" src/ docs/ .agents/ tests/ README.md INSTALL.md AGENTS.md CONTRIBUTING.md systemd/` → 0 результатов
- [x] `grep -r "SPDX-License-Identifier" src/ | wc -l` → 38
- [x] `ls LICENSE LICENSE.ru` → оба файла существуют
- [x] `node -e "const p=require('./package.json'); console.log(p.name, p.license)"` → `zyablik-bot Apache-2.0`
- [x] Все доки согласованы друг с другом
- [x] Review перед мержем

---

## Checkpoint: Финальная верификация

- [x] `npm test` passes
- [x] `npm run verify` passes
- [x] README — «посадочная страница» с логотипом и лицензией
- [x] Все файлы лицензированы (Apache-2.0)
- [x] Проект переименован на всех уровнях
- [x] ADR-0031 создан и в индексе

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `npm test` падает после ренейминга | Medium | package-lock перегенерируется автоматически; тесты не зависят от имени пакета |
| `repo-structure.test.js` требует старые имена | Low | Тест проверяет конкретные пути, не имена пакета |
| Логотип не загружен вовремя | Low | README работает без изображения (alt text) |
| CI workflow ломается после rename репо на GitHub | Low | Actions checkout не зависит от имени; rename репо — отдельная операция |
| systemd-сервисы на стенде используют старые имена | Low | Ренейминг в репо — источник новых имен; миграция на стенде отдельно |

## Не входит в спринт

- **Деплой на сервер** — стенды используют старые имена до следующего релиза
- **Публикация в npm** — `"private": true` остаётся
- **Включение в реестр Минцифры** — отдельный процесс
- **Миграция systemd на стенде** — отдельная задача
- **Обновление CHANGELOG.md** — при следующем релизе
