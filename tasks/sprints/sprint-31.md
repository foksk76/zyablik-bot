# Sprint 31: Navigation Shell + Archive Backend

**Цель:** React Router, NavBar, Settings stub, backend API для архива,
инъекция queueStore в queue-monitor.

**Idea:** [docs/ideas/web-interface-archive.md](../../docs/ideas/web-interface-archive.md)
**ADR:** [ADR-0042](../../docs/decisions/ADR-0042-web-interface-archive.md)

**Контекст:** Sprint 30 завершён — UI improvements (RefreshButton, limit-dropdown,
TimeRangeBar). Все тесты passing.

**Границы:** `src/queue-monitor/` (backend + UI), `src/bot-platform/app.js` (queueStore pass).

## Tasks

### Phase 1: Navigation Shell

#### Task 1: Установка React Router

**Status:** Done

**Description:** Установить `react-router-dom` v6 в `src/queue-monitor/ui/`.

**Acceptance criteria:**
- [ ] `react-router-dom` добавлен в `src/queue-monitor/ui/package.json`
- [ ] `npm install` выполняется без ошибок
- [ ] Версия: `^6.x`

**Files:** `src/queue-monitor/ui/package.json`, `src/queue-monitor/ui/package-lock.json`

**Estimated scope:** XS

---

#### Task 2: Рефактор App.jsx — React Router

**Status:** Done

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

#### Task 3: Компонент NavBar

**Status:** Done

**Description:** Горизонтальная навигационная панель в header.
Три ссылки: Дашборд, Архив, Настройки. Active state через
`NavLink` из react-router-dom. На mobile — hamburger menu.

**Acceptance criteria:**
- [ ] Новый файл `src/queue-monitor/ui/src/components/NavBar.jsx`
- [ ] Использует `NavLink` из `react-router-dom`
- [ ] Маршруты: `#/dashboard`, `#/archive`, `#/settings`
- [ ] Active state: `className` функция (active → подчёркивание/цвет)
- [ ] Labels: Дашборд, Архив, Настройки
- [ ] Горизонтальный layout, gap между ссылками
- [ ] На mobile: hamburger menu (`≡`), раскрывается вертикально
- [ ] Доступность: `aria-label` на навигации, `aria-expanded` на hamburger
- [ ] `npm run build` — сборка без ошибок

**Files:** `src/queue-monitor/ui/src/components/NavBar.jsx` (новый)

**Dependencies:** Task 1

**Estimated scope:** S

---

#### Task 4: Страница Settings (заглушка)

**Status:** Done

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

### Checkpoint: Navigation Shell

- [ ] React Router установлен и настроен
- [ ] NavBar отображается на всех страницах
- [ ] Дашборд доступен на `#/dashboard`
- [ ] Settings stub доступен на `#/settings`
- [ ] `npm run build` — сборка без ошибок

---

### Phase 2: Archive Backend

#### Task 5: Archive queries в reader.js

**Status:** Done

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

#### Task 6: Archive routes (backend API)

**Status:** Done

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

#### Task 7: Инъекция queueStore в queue-monitor

**Status:** Done

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
