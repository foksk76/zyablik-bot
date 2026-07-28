# Sprint 32: Archive UI + Retry + Export

**Цель:** Страница архива с полным функционалом, retry, экспорт.

**Idea:** [docs/ideas/web-interface-archive.md](../../docs/ideas/web-interface-archive.md)
**ADR:** [ADR-0042](../../docs/decisions/ADR-0042-web-interface-archive.md)

**Контекст:** Sprint 31 завершён — React Router, NavBar, archive backend API,
queueStore injection. Все тесты passing.

**Границы:** `src/queue-monitor/` (backend + UI).

## Tasks

### Phase 3: Archive UI

#### Task 8: Хук useArchive

**Status:** Done

**Description:** Хук для data fetching архива. Управляет пагинацией,
фильтрами, сортировкой, загрузкой данных.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/hooks/useArchive.js`
- [ ] Параметры: `{ page, limit, status, source, search, from, to, sort }`
- [ ] Возвращает: `{ data, total, pages, loading, error, refresh }`
- [ ] Fetch при монтировании и при изменении параметров (debounce 300ms для search)
- [ ] AbortController для отмены предыдущего запроса
- [ ] Обработка ошибок (включая SESSION_EXPIRED)

**Files:** `src/queue-monitor/ui/src/hooks/useArchive.js` (новый)

**Estimated scope:** S

---

#### Task 9: ArchivePage — таблица с пагинацией

**Status:** Done

**Description:** Основная страница архива. Таблица с колонками,
пагинация с номерами страниц, сортировка по клику на заголовок.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/pages/ArchivePage.jsx`
- [ ] Таблица с колонками: ID, Дата, Статус, Источник, Получатель, Попытки
- [ ] Пагинация: кнопки «Назад»/«Вперёд» + номера страниц (1 2 3 ... 15)
- [ ] Лимит: 20/50/100 (через limit-dropdown)
- [ ] Сортировка: клик по заголовку колонки → asc/desc (indicators ▲▼)
- [ ] Дефолт: `created_at:desc` (новые сверху)
- [ ] Статус отображается как Badge: Delivered=green, Failed=red, Pending=yellow, Processing=blue
- [ ] Получатель: `recipient.value` из payload JSON (fallback «—» при ошибке парсинга)
- [ ] Дата: `DD.MM.YYYY HH:MM:SS` (без relative time)
- [ ] Клик по строке → `#/archive/:id` (deep linking)
- [ ] Loading skeleton при загрузке
- [ ] Empty state: «Сообщений не найдено» + «Попробуйте изменить фильтры»
- [ ] Error state: текст ошибки + кнопка «Повторить»
- [ ] Кнопка «Обновить» (ручное обновление, без автообновления)
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/ArchivePage.jsx` (новый)

**Dependencies:** Task 8

**Estimated scope:** M

---

#### Task 10: Фильтры архива

**Status:** Done

**Description:** Панель фильтров над таблицей: поиск, статус,
источник, диапазон дат (пресеты + absolute), экспорт.

**Acceptance criteria:**
- [ ] Текстовый input «Поиск по payload...» (placeholder)
- [ ] Wildcards `%` и `_` **не** экранируются в LIKE queries
- [ ] Select для статуса: Все, Delivered, Failed, Pending, Processing
- [ ] Input для источника (текстовый)
- [ ] Пресеты дат: Сегодня, Вчера, Неделя, Месяц + absolute range (from/to)
- [ ] Кнопка «Сбросить фильтры» (видна всегда)
- [ ] Фильтры применяются immediately (без кнопки «Применить»)
- [ ] Debounce 300ms для текстового поиска
- [ ] При изменении фильтра — сброс на страницу 1
- [ ] Кнопка «Экспорт» (CSV/JSON) в панели фильтров
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/ArchivePage.jsx` (модификация)

**Dependencies:** Task 9

**Estimated scope:** S

---

### Checkpoint: Archive UI

- [ ] ArchivePage с таблицей работает
- [ ] Пагинация работает
- [ ] Фильтры работают
- [ ] `npm run build` — сборка без ошибок

---

### Phase 4: Message Details + Retry

#### Task 11: Просмотр деталей сообщения

**Status:** Done

**Description:** Клик по строке таблицы открывает детали сообщения.
Отдельный роут `/archive/:id`.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/pages/MessageDetail.jsx`
- [ ] Роут: `#/archive/:id`
- [ ] Отображает: ID, reqId, Дата создания, Дата обновления, Статус,
      Источник, Попытки, Payload (formatted JSON)
- [ ] Payload отображается в `<pre>` с mono font
- [ ] Кнопка «Назад к архиву»
- [ ] Кнопка «Повторить» (retry) — видна для **всех** статусов (не только failed)
- [ ] Кнопка «Повторить» с иконкой RefreshCw + текст
- [ ] Loading state при загрузке
- [ ] 404 state: «Сообщение не найдено»
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/MessageDetail.jsx` (новый)

**Dependencies:** Task 9

**Estimated scope:** S

---

#### Task 12: Retry — backend endpoint

**Status:** Done

**Description:** `POST /api/archive/retry/:id` — повторная отправка
сообщения через `queueStore.enqueue()`.

**Acceptance criteria:**
- [ ] Эндпоинт в `src/queue-monitor/api/archive-routes.js`
- [ ] Читает сообщение по ID из reader
- [ ] Валидация структуры: `recipient.kind`, `recipient.value`, `text` (все обязательны)
- [ ] Валидация длины: `text` ≤ `MAX_API_TEXT_LIMIT` (4000)
- [ ] **Источник наследуется** из оригинального сообщения
- [ ] **Retry разрешён** даже если source-плагин удалён (worker обработает ошибку)
- [ ] Вызывает `queueStore.enqueue({ payload, source, reqId: newId })`
- [ ] Новый `reqId` = `crypto.randomUUID()` (идемпотентность)
- [ ] Response: `{ status: 'ok', data: { newId, originalId } }`
- [ ] 404 если сообщение не найдено
- [ ] 400 если payload невалиден (структура или длина)
- [ ] 500 если enqueue failed
- [ ] Bearer Token / Session auth
- [ ] Тесты: `tests/queue-monitor/api/archive.test.js`

**Files:** `src/queue-monitor/api/archive-routes.js`, `tests/queue-monitor/api/archive.test.js`

**Dependencies:** Task 7 (Sprint 31), Task 6 (Sprint 31)

**Estimated scope:** S

---

#### Task 13: Retry — UI

**Status:** Done

**Description:** Кнопка «Повторить» в деталях сообщения и в строке таблицы.
Optimistic UI, без подтверждения.

**Acceptance criteria:**
- [ ] Кнопка «Повторить» в `MessageDetail.jsx` (**для всех статусов**, не только failed)
- [ ] Кнопка «Повторить» в строке таблицы `ArchivePage.jsx` (**для всех статусов**)
- [ ] Кнопка: иконка RefreshCw + текст «Повторить»
- [ ] Без подтверждения (optimistic UI)
- [ ] При клике: `POST /api/archive/retry/:id`
- [ ] Состояния: idle → spinner → success/error
- [ ] Успех: toast/banner «Сообщение создано» + обновление списка архива
- [ ] Ошибка backend (400/500): toast/banner с текстом ошибки; кнопка остаётся доступной
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/MessageDetail.jsx`,
`src/queue-monitor/ui/src/pages/ArchivePage.jsx`

**Dependencies:** Task 11, Task 12

**Estimated scope:** S

---

### Checkpoint: Message Details + Retry

- [ ] MessageDetail работает
- [ ] Retry backend отвечает
- [ ] Retry UI работает end-to-end
- [ ] `npm run build` — сборка без ошибок

---

### Phase 5: Export

#### Task 14: Export — backend endpoint

**Status:** Done

**Description:** `GET /api/archive/export?format=csv|json` — экспорт
**всех результатов фильтра** (без пагинации). Streaming для больших объёмов.

**Acceptance criteria:**
- [ ] Эндпоинт в `src/queue-monitor/api/archive-routes.js`
- [ ] Query: `format` (csv|json), + фильтры как в `/api/archive/messages`
- [ ] CSV: заголовки + данные, `Content-Type: text/csv`,
      `Content-Disposition: attachment; filename="archive_YYYY-MM-DD_HHmmss.csv"` (UTC)
- [ ] JSON: `{ data: [...] }`, `Content-Type: application/json`
- [ ] Streaming: batched cursor (1000 строк за раз), не загружать все данные в память
- [ ] Фильтры: те же что в `/api/archive/messages` (status, source, search, from, to)
- [ ] Bearer Token / Session auth
- [ ] Тесты: `tests/queue-monitor/api/archive.test.js`

**Files:** `src/queue-monitor/api/archive-routes.js`, `tests/queue-monitor/api/archive.test.js`

**Dependencies:** Task 5 (Sprint 31)

**Estimated scope:** M

---

#### Task 15: Export — UI

**Status:** Done

**Description:** Кнопка экспорта в панели фильтров архива.
Скачивание **всех результатов фильтра** (без пагинации).

**Acceptance criteria:**
- [ ] Кнопка «Экспорт» в панели фильтров `ArchivePage.jsx`
- [ ] Dropdown: CSV, JSON
- [ ] При клике: `GET /api/archive/export?format=...&...filters` (все результаты фильтра)
- [ ] Скачивание файла через `Blob` + `URL.createObjectURL`
- [ ] Имя файла: `archive_YYYY-MM-DD_HHmmss.csv` / `.json` (UTC)
- [ ] Кнопка неактивна при загрузке
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/ArchivePage.jsx`

**Dependencies:** Task 14

**Estimated scope:** S

---

### Checkpoint: Sprint 32 Complete

- [ ] ArchivePage с таблицей, фильтрами, пагинацией
- [ ] MessageDetail с payload и retry
- [ ] Retry: backend + UI, optimistic UI
- [ ] Export: backend (streaming) + UI (скачивание)
- [ ] `npm run build` — сборка без ошибок
- [ ] `npm test` — все тесты passing

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| React Router ломает текущий UX дашборда | High | Hash routing, проверить все breakpoints |
| queueStore injection нарушает ADR-0034 | Medium | ADR-0016 покрывает injectable deps |
| CSV streaming сложнее чем expected | Low | Batched cursor (1000 rows) |
| Retry создаёт дубликаты при network error | Medium | Новый reqId, идемпотентность |

## Parallelization

- Tasks 8-10 (archive UI) последовательны
- Tasks 11-13 (detail + retry) последовательны, зависят от Tasks 9, 12
- Tasks 14-15 (export) независимы от Tasks 8-13

## Файлы для изменения (сводка)

```
src/queue-monitor/ui/src/hooks/useArchive.js         (новый)
src/queue-monitor/ui/src/pages/ArchivePage.jsx       (новый)
src/queue-monitor/ui/src/pages/MessageDetail.jsx     (новый)
src/queue-monitor/api/archive-routes.js              (модификация — retry + export)
tests/queue-monitor/api/archive.test.js              (модификация — retry + export tests)
```
