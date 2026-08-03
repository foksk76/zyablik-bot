# Sprint 40: SettingsPage UI (ADR-0046) — динамические формы из merged-схемы

**Цель:** реализовать schema-driven SettingsPage (ADR-0046): просмотр
effective-конфига (секреты — только статус/маска), динамический рендер
форм из merged-схемы (`GET /api/config/schema`), редактирование через
staged + diff перед Apply, кнопки Apply/Rollback/Export/Import, banner
авто-отката по `GET /api/config/status`. Storybook-компоненты (ADR-0036).

**ADR:** [ADR-0046](../../docs/decisions/ADR-0046-schema-driven-config-webui.md)
[ADR-0036](../../docs/decisions/ADR-0036-design-system.md)
[ADR-0040](../../docs/decisions/ADR-0040-queue-monitor-ui-improvements.md)
[ADR-0042](../../docs/decisions/ADR-0042-web-navigation-archive.md)
**Idea:** [docs/ideas/config-file-and-schema-driven-settings.md](../../docs/ideas/config-file-and-schema-driven-settings.md)

**Контекст:** API готов (Sprint 39). Существующая SettingsPage —
`src/queue-monitor/ui/src/pages/SettingsPage.jsx:4` (ручная форма). Здесь —
замена на динамическую форму из merged-схемы.

**Границы:** только frontend (страница, компоненты, Storybook). Backend не
меняем. Плагины без `configSchema` в UI не видны.

## Architecture Decisions

- **Единый источник схемы** — `GET /api/config/schema` (merged-схема);
  страница не дублирует поля вручную.
- **Секреты** — поле-индикатор «задан/не задан» (маска); значения не
  редактируются и не отправляются в import/export (остаются `$VAR`).
- **Nullable** — tri-state select (`null`/true/false) для полей с
  `nullable: true` (например `idpRelaxSsrf`).
- **Staged-редактирование** — правки сохраняются в staged
  (`PUT /api/config/stage`); перед Apply — diff (изменённые поля), Apply
  инициирует рестарт (202), статус — по `GET /api/config/status`
  (`pending/confirmed/rolled_back`).
- **Banner авто-отката** — при `rolled_back`/`pending` — уведомление с
  причиной (ADR-0040 error drill-down).
- **Компоненты** — дизайн-система ADR-0036, Storybook-обложки для новых
  компонентов.

## Tasks

### Task 1: Просмотр effective-конфига с масками секретов

**Status:** Done

**Description:** Переписать SettingsPage на отображение effective-конфига из
`GET /api/config`: секции (bot/queue/ingress/monitor/plugins), секреты —
маска + статус «задан/не задан». Reuse-компоненты (Card, Section,
Badge) из дизайн-системы.

**Acceptance criteria:**
- [ ] effective-конфиг рендерится по секциям
- [ ] Значения секретов не отображаются (только статус/маска)
- [ ] Storybook-обложки для новых компонентов
- [ ] UI-тесты (рендер, маски)

**Files:** `src/queue-monitor/ui/src/pages/SettingsPage.jsx`,
`src/queue-monitor/ui/src/components/` (новые: ConfigSection, SecretStatus),
Storybook stories, `src/queue-monitor/ui/src/**/*.test.*`

**Dependencies:** Sprint 39 (Task 3)

**Estimated scope:** M

---

### Task 2: Динамический рендер форм из merged-схемы

**Status:** Done

**Description:** Форма генерируется из `GET /api/config/schema`: по типам
полей (text/number/boolean/enum), секциям, `required`, `min/max`,
`description`. Tri-state select для `nullable`.

**Acceptance criteria:**
- [ ] Форма рендерится из merged-схемы без ручного дублирования полей
- [ ] Валидация на клиенте: типы, required, min/max, enum
- [ ] Tri-state для nullable-полей
- [ ] Storybook + UI-тесты

**Files:** `src/queue-monitor/ui/src/pages/SettingsPage.jsx`,
`src/queue-monitor/ui/src/components/ConfigForm.jsx` (новый), stories, тесты

**Dependencies:** Task 1, Sprint 39 (Task 3)

**Estimated scope:** M

---

### Task 3: Staged-редактирование + diff перед Apply

**Status:** Done

**Description:** Правки сохраняются в staged (`PUT /api/config/stage`);
перед Apply показывается diff изменённых полей; Apply — `POST
/api/config/apply` (202), статус по `GET /api/config/status`.

**Acceptance criteria:**
- [ ] Изменения сохраняются в staged; страница отражает несохранённые правки
- [ ] Diff перед Apply (изменённые поля + old/new)
- [ ] Apply с подтверждением; статус pending → confirmed/rolled_back
- [ ] UI-тесты (diff, flow подтверждения)

**Files:** `src/queue-monitor/ui/src/pages/SettingsPage.jsx`,
`src/queue-monitor/ui/src/components/ConfigDiff.jsx` (новый), stories, тесты

**Dependencies:** Task 2, Sprint 39 (Tasks 4-5)

**Estimated scope:** M

---

### Task 4: Banner авто-отката + status-опрос

**Status:** Done

**Description:** Периодический опрос `GET /api/config/status`; при
`rolled_back`/`pending` — banner с причиной (error drill-down, ADR-0040);
кнопка Rollback (`POST /api/config/rollback`).

**Acceptance criteria:**
- [ ] Banner при rolled_back/pending с причиной
- [ ] Кнопка Rollback с подтверждением
- [ ] Остановка опроса при размонтировании (cleanup)
- [ ] UI-тесты (banner, reason)

**Files:** `src/queue-monitor/ui/src/pages/SettingsPage.jsx`,
`src/queue-monitor/ui/src/components/ConfigBanner.jsx` (новый), stories, тесты

**Dependencies:** Task 3, Sprint 39 (Task 4)

**Estimated scope:** S

---

### Task 5: Export/Import в UI

**Status:** Done

**Description:** Кнопки Export (скачивание JSON из
`GET /api/config/export`) и Import (`POST /api/config/import`, файл → staged;
при reject — показ списка полей с литеральными секретами).

**Acceptance criteria:**
- [ ] Export скачивает JSON без литеральных секретов
- [ ] Import: файл → staged; ошибка с полями — понятное сообщение
- [ ] UI-тесты (import error path)

**Files:** `src/queue-monitor/ui/src/pages/SettingsPage.jsx`, stories, тесты

**Dependencies:** Task 3, Sprint 39 (Task 5)

**Estimated scope:** S

---

## Checkpoint: Sprint 40

- [x] Полный UX-флоу: просмотр → правка → diff → Apply → pending →
      confirmed; rolled_back с banner (компоненты + модель покрыты тестами;
      браузерный e2e — при наличии стенда)
- [x] Секреты не видны в UI (только статус/маска)
- [x] Storybook покрывает новые компоненты
- [x] `npm test` зелёный (846 pass); ревью с человеком — на ревью

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Секреты протекают в UI | High | маска + статусы; тесты не включают значения секретов |
| Схема меняется → форма ломается | Medium | динамический рендер из схемы; версионирование схемы в /api/config/schema |
| Apply неожиданный для пользователя (рестарт) | Medium | diff + подтверждение + status-опрос |
| Плагины без схемы невидимы | Low | задокументировано; схема добавляется вместе с плагином |

## Файлы для изменения (сводка)

```
src/queue-monitor/ui/src/pages/SettingsPage.jsx   (переписать под merged-схему)
src/queue-monitor/ui/src/components/ConfigForm.jsx (новый)
src/queue-monitor/ui/src/components/ConfigDiff.jsx (новый)
src/queue-monitor/ui/src/components/ConfigBanner.jsx (новый)
src/queue-monitor/ui/src/components/SecretStatus.jsx (новый)
src/queue-monitor/ui/src/stories/*.stories.jsx     (новые)
src/queue-monitor/ui/src/**/*.test.js              (UI-тесты)
```
