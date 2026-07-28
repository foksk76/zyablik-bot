# Implementation Plan: Web Interface — Archive + Navigation Shell

## Overview

Расширяем queue-monitor SPA до multi-page control panel с архивом
сообщений, клиентским роутингом (React Router, hash-based) и навигацией.
Retry через `queueStore.enqueue()` (ADR-0016 injectable dependency).

**Idea:** [docs/ideas/web-interface-archive.md](../docs/ideas/web-interface-archive.md)

## Architecture Decisions

- **React Router v6, hash-based routing** — `#/dashboard`, `#/archive`, `#/settings`
- **Retry = `queueStore.enqueue()`** — прямой вызов через injectable dependency
  (ADR-0016), не HTTP-proxy. Один INSERT, не модификация существующих данных.
- **Backend CSV/экспорт** — streaming endpoint для больших объёмов
- **Readonly reader** — не нарушается. Retry пишет через `queueStore`, не через `reader`.

## Dependency Graph

```
React Router + NavBar (Sprint 31)
    │
    ├── Archive Backend API (Sprint 31)
    │       │
    │       ├── Archive UI (Sprint 32)
    │       │       │
    │       │       ├── Message Detail (Sprint 32)
    │       │       │       │
    │       │       │       └── Retry (Sprint 32)
    │       │       │
    │       │       └── Export (Sprint 32)
    │       │
    │       └── QueueStore injection (Sprint 31)
    │
    └── Settings Stub (Sprint 31)
```

---

## Sprint 31: Navigation Shell + Archive Backend

**Цель:** React Router, NavBar, Settings stub, backend API для архива,
инъекция queueStore в queue-monitor.

### Task 1: Установка React Router

**Status:** Pending

**Description:** Установить `react-router-dom` v6 в `src/queue-monitor/ui/`.

**Acceptance criteria:**
- [ ] `react-router-dom` добавлен в `src/queue-monitor/ui/package.json`
- [ ] `npm install` выполняется без ошибок
- [ ] Версия: `^6.x`

**Files:** `src/queue-monitor/ui/package.json`, `src/queue-monitor/ui/package-lock.json`

**Estimated scope:** XS

---

### Task 2: Рефактор App.jsx — React Router

**Status:** Pending

**Description:** Обернуть приложение в `HashRouter`. Заменить условный
рендеринг на `Routes`/`Route`. Вынести header с навигацией.

**Acceptance criteria:**
- [ ] `App.jsx` использует `HashRouter`, `Routes`, `Route`
- [ ] Маршруты: `#/dashboard` (DashboardPage), `#/archive` (ArchivePage),
      `#/settings` (SettingsPage)
- [ ] Дефолтный роут (`/`) редиректит на `#/dashboard`
- [ ] `NavBar` отображается на всех страницах (вне `Routes`)
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/App.jsx`

**Dependencies:** Task 1

**Estimated scope:** S

---

### Task 3: Компонент NavBar

**Status:** Pending

**Description:** Горизонтальная навигационная панель в header.
Три ссылки: Дашборд, Архив, Настройки. Active state через
`NavLink` из react-router-dom.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/components/NavBar.jsx`
- [ ] Использует `NavLink` из `react-router-dom`
- [ ] Маршруты: `#/dashboard`, `#/archive`, `#/settings`
- [ ] Active state: `className` функция (active → подчёркивание/цвет)
- [ ] Labels: Дашборд, Архив, Настройки
- [ ] Горизонтальный layout, gap между ссылками
- [ ] Доступность: `aria-label` на навигации
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/components/NavBar.jsx` (новый)

**Dependencies:** Task 1

**Estimated scope:** S

---

### Task 4: Страница Settings (заглушка)

**Status:** Pending

**Description:** Заглушка для страницы настроек. Отображает заголовок
и список будущих подразделов.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/pages/SettingsPage.jsx`
- [ ] Заголовок: "Настройки"
- [ ] Текст: "Раздел в разработке"
- [ ] Список будущих подразделов: Zabbix Media Type, Плагины, Общие параметры
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/SettingsPage.jsx` (новый)

**Estimated scope:** XS

---

### Task 5: Archive queries в reader.js

**Status:** Pending

**Description:** Добавить в `reader.js` функции для пагинированного
списка сообщений и деталей одного сообщения.

**Acceptance criteria:**
- [ ] `archiveMessages({ page, limit, status, source, search, from, to, sort })`
      — возвращает `{ data, total, page, limit, pages }`
- [ ] `archiveMessageById(id)` — возвращает объект сообщения или `null`
- [ ] Пагинация: `LIMIT ? OFFSET ?`
- [ ] Фильтры: `status`, `source`, `search` (LIKE по payload), `from`/`to`
      (created_at range)
- [ ] Сортировка: `sort` параметр (`created_at:asc`, `created_at:desc`)
- [ ] `search` ищет по `payload` LIKE `%query%`
- [ ] Все запросы через prepared statements (без SQL-инъекций)
- [ ] Тесты: `tests/queue-monitor/db/reader.test.js` — новые кейсы

**Files:** `src/queue-monitor/db/reader.js`, `tests/queue-monitor/db/reader.test.js`

**Estimated scope:** M

---

### Task 6: Archive routes (backend API)

**Status:** Pending

**Description:** Создать `archive-routes.js` с эндпоинтами для архива.
Зарегистрировать в `http-server.js`.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/api/archive-routes.js`
- [ ] `GET /api/archive/messages` — пагинированный список
      - Query: `page` (default 1), `limit` (default 20, max 100),
        `status`, `source`, `search`, `from`, `to`, `sort`
      - Response: `{ status: 'ok', data: [...], total, page, limit, pages }`
- [ ] `GET /api/archive/messages/:id` — детали сообщения
      - Response: `{ status: 'ok', data: { id, reqId, source, payload,
        status, attempts, createdAt, updatedAt } }`
      - 404 если не найдено
- [ ] Все эндпоинты: Bearer Token / Session auth (как `/api/metrics/*`)
- [ ] Регистрация в `src/queue-monitor/index.js`:
      `httpServer.registerRoute('GET', '/api/archive/messages', auth.protectRoute(...))`
- [ ] Тесты: `tests/queue-monitor/api/archive.test.js`

**Files:** `src/queue-monitor/api/archive-routes.js` (новый),
`src/queue-monitor/index.js`, `tests/queue-monitor/api/archive.test.js` (новый)

**Dependencies:** Task 5

**Estimated scope:** M

---

### Task 7: Инъекция queueStore в queue-monitor

**Status:** Pending

**Description:** По ADR-0016, передать `queueStore` как опцию в
`createQueueMonitor()`. Использовать для retry в Sprint 32.

**Acceptance criteria:**
- [ ] `createQueueMonitor(options)` принимает `options.queueStore`
- [ ] `queueStore` сохраняется в замыкании (для использования в retry)
- [ ] Если `queueStore` не передан — retry unavailable (graceful degradation)
- [ ] Изменения в `src/queue-monitor/index.js`
- [ ] Вызов в `src/bot-platform/app.js`: передать `queueStore` при
      инициализации queue-monitor
- [ ] Тесты: `tests/queue-monitor/index.test.js` — queueStore injection

**Files:** `src/queue-monitor/index.js`, `src/bot-platform/app.js`,
`tests/queue-monitor/index.test.js`

**Estimated scope:** S

---

### Checkpoint: Sprint 31 Complete

- [ ] React Router работает, NavBar отображается
- [ ] Дашборд доступен на `#/dashboard`
- [ ] Settings stub доступен на `#/settings`
- [ ] Archive API: `GET /api/archive/messages` и `GET /api/archive/messages/:id`
- [ ] `queueStore` инжектирован в queue-monitor
- [ ] `npm run build` — сборка без ошибок
- [ ] `npm test` — все тесты passing

---

## Sprint 32: Archive UI + Retry + Export

**Цель:** Страница архива с полным функционалом, retry, экспорт.

### Task 8: Хук useArchive

**Status:** Pending

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

### Task 9: ArchivePage — таблица с пагинацией

**Status:** Pending

**Description:** Основная страница архива. Таблица с колонками,
пагинация, сортировка.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/pages/ArchivePage.jsx`
- [ ] Таблица с колонками: ID, Дата, Статус, Источник, Получатель, Попытки
- [ ] Пагинация: кнопки Назад/Вперёд + номер страницы + всего страниц
- [ ] Лимит: 20/50/100 (через limit-dropdown)
- [ ] Сортировка по дате: переключение asc/desc
- [ ] Статус отображается как Badge (цвет по статусу)
- [ ] Получатель извлекается из payload JSON
- [ ] Loading skeleton при загрузке
- [ ] Empty state: "Сообщений не найдено"
- [ ] Error state: сообщение об ошибке
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/ArchivePage.jsx` (новый)

**Dependencies:** Task 8

**Estimated scope:** M

---

### Task 10: Фильтры архива

**Status:** Pending

**Description:** Панель фильтров над таблицей: поиск, статус,
источник, диапазон дат.

**Acceptance criteria:**
- [ ] Текстовый input "Поиск" (ищет по payload)
- [ ] Select для статуса: Все, Delivered, Failed, Pending, Processing
- [ ] Input для источника (текстовый)
- [ ] Два date input для диапазона (from/to)
- [ ] Кнопка "Сбросить фильтры"
- [ ] Фильтры применяются immediately (без кнопки "Применить")
- [ ] Debounce 300ms для текстового поиска
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/ArchivePage.jsx` (модификация)

**Dependencies:** Task 9

**Estimated scope:** S

---

### Task 11: Просмотр деталей сообщения

**Status:** Pending

**Description:** Клик по строке таблицы открывает детали сообщения.
Модальное окно или отдельный роут `/archive/:id`.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/pages/MessageDetail.jsx`
- [ ] Роут: `#/archive/:id`
- [ ] Отображает: ID, reqId, Дата создания, Дата обновления, Статус,
      Источник, Попытки, Payload (formatted JSON)
- [ ] Payload отображается в `<pre>` с syntax highlighting (mono font)
- [ ] Кнопка "Назад к архиву"
- [ ] Кнопка "Повторить" (retry) — видна для failed сообщений
- [ ] Loading state при загрузке
- [ ] 404 state: "Сообщение не найдено"
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/MessageDetail.jsx` (новый)

**Dependencies:** Task 9

**Estimated scope:** S

---

### Task 12: Retry — backend endpoint

**Status:** Pending

**Description:** `POST /api/archive/retry/:id` — повторная отправка
сообщения через `queueStore.enqueue()`.

**Acceptance criteria:**
- [ ] Эндпоинт в `src/queue-monitor/api/archive-routes.js`
- [ ] Читает сообщение по ID из reader
- [ ] Валидация payload: проверка наличия `recipient`, `text`
- [ ] Вызывает `queueStore.enqueue({ payload, source, reqId: newId })`
- [ ] Новый `reqId` = `crypto.randomUUID()` (идемпотентность)
- [ ] Response: `{ status: 'ok', data: { newId, originalId } }`
- [ ] 404 если сообщение не найдено
- [ ] 400 если payload невалиден
- [ ] 500 если enqueue failed
- [ ] Bearer Token / Session auth
- [ ] Тесты: `tests/queue-monitor/api/archive.test.js`

**Files:** `src/queue-monitor/api/archive-routes.js`, `tests/queue-monitor/api/archive.test.js`

**Dependencies:** Task 7, Task 6

**Estimated scope:** S

---

### Task 13: Retry — UI

**Status:** Pending

**Description:** Кнопка "Повторить" в деталях сообщения и в таблице.
Optimistic UI.

**Acceptance criteria:**
- [ ] Кнопка "Повторить" в `MessageDetail.jsx` (для failed)
- [ ] Кнопка "Повторить" в строке таблицы `ArchivePage.jsx` (для failed)
- [ ] При клике: `POST /api/archive/retry/:id`
- [ ] Optimistic UI: иконка spinner → "Создано" / "Ошибка"
- [ ] После успешного retry: обновить список архива
- [ ] Toast/banner с результатом
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/pages/MessageDetail.jsx`,
`src/queue-monitor/ui/src/pages/ArchivePage.jsx`

**Dependencies:** Task 11, Task 12

**Estimated scope:** S

---

### Task 14: Export — backend endpoint

**Status:** Pending

**Description:** `GET /api/archive/export?format=csv|json` — экспорт
с фильтрами. Streaming для больших объёмов.

**Acceptance criteria:**
- [ ] Эндпоинт в `src/queue-monitor/api/archive-routes.js`
- [ ] Query: `format` (csv|json), + фильтры как в `/api/archive/messages`
- [ ] CSV: заголовки + данные, `Content-Type: text/csv`,
      `Content-Disposition: attachment; filename="archive-YYYY-MM-DD.csv"`
- [ ] JSON: `{ data: [...] }`, `Content-Type: application/json`
- [ ] Streaming: не загружать все данные в память (cursor-based или batched)
- [ ] Bearer Token / Session auth
- [ ] Тесты: `tests/queue-monitor/api/archive.test.js`

**Files:** `src/queue-monitor/api/archive-routes.js`, `tests/queue-monitor/api/archive.test.js`

**Dependencies:** Task 5

**Estimated scope:** M

---

### Task 15: Export — UI

**Status:** Pending

**Description:** Кнопка экспорта в архиве. Скачивание CSV/JSON.

**Acceptance criteria:**
- [ ] Кнопка "Экспорт" в `ArchivePage.jsx`
- [ ] Dropdown: CSV, JSON
- [ ] При клике: `GET /api/archive/export?format=...&...filters`
- [ ] Скачивание файла через `Blob` + `URL.createObjectURL`
- [ ] Имя файла: `archive-YYYY-MM-DD.csv` / `.json`
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

---

## Checkpoint: Feature Complete

- [ ] Навигация: NavBar, hash routing, active state
- [ ] Дашборд: работает без регрессий
- [ ] Архив: таблица, фильтры, пагинация, сортировка, поиск
- [ ] Детали сообщения: payload, метаданные
- [ ] Retry: валидация, enqueue, optimistic UI
- [ ] Export: CSV/JSON backend + UI
- [ ] Настройки: заглушка
- [ ] `npm test` — все тесты passing
- [ ] `npm run build` — сборка без ошибок

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| React Router ломает текущий UX дашборда | High | Hash routing, проверить все breakpoints |
| queueStore injection нарушает ADR-0034 | Medium | ADR-0016 покрывает injectable deps; queueStore — write, reader — readonly |
| CSV streaming сложнее чем expected | Low | Batched cursor (1000 rows) вместо true streaming |
| Retry создаёт дубликаты при network error | Medium | Новый reqId, идемпотентность на стороне queue-store |
| `react-router-dom` добавляет bundle size | Low | ~7kB gzipped, приемлемо для internal tool |

## Parallelization

- Tasks 1-4 (navigation shell) параллельны между собой
- Task 5 (reader queries) независим от Tasks 1-4
- Task 6 (archive routes) зависит от Task 5
- Task 7 (queueStore injection) независим от Tasks 1-6
- Tasks 8-10 (archive UI) последовательны, зависят от Task 6
- Tasks 11-13 (detail + retry) последовательны, зависят от Tasks 9, 12
- Tasks 14-15 (export) независимы от Tasks 8-13

## Файлы для изменения (сводка)

```
# Sprint 31
src/queue-monitor/ui/package.json                    (модификация — react-router-dom)
src/queue-monitor/ui/src/App.jsx                     (рефактор — HashRouter, Routes)
src/queue-monitor/ui/src/components/NavBar.jsx       (новый)
src/queue-monitor/ui/src/pages/SettingsPage.jsx      (новый)
src/queue-monitor/db/reader.js                       (модификация — archive queries)
src/queue-monitor/api/archive-routes.js              (новый)
src/queue-monitor/index.js                           (модификация — queueStore injection, routes)
src/bot-platform/app.js                              (модификация — queueStore pass)
tests/queue-monitor/db/reader.test.js                (модификация — archive tests)
tests/queue-monitor/api/archive.test.js              (новый)
tests/queue-monitor/index.test.js                    (модификация — injection test)

# Sprint 32
src/queue-monitor/ui/src/hooks/useArchive.js         (новый)
src/queue-monitor/ui/src/pages/ArchivePage.jsx       (новый)
src/queue-monitor/ui/src/pages/MessageDetail.jsx     (новый)
tests/queue-monitor/api/archive.test.js              (модификация — retry + export tests)
```
