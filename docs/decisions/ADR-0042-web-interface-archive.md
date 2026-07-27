# ADR-0042: Web Interface — Navigation Shell + Archive

## Статус

Принято.

## Дата

2026-07-27

## Контекст

ADR-0034 вводит Queue Monitor Dashboard — одностраничный SPA (React + Vite)
с дашбордом метрик. Дашборд работает стабильно, но оператор не имеет
возможности:

1. Просматривать полную историю доставленных сообщений
2. Искать и фильтровать сообщения по атрибутам
3. Повторно отправлять_failed сообщения
4. Экспортировать данные для отчётов
5. Расширять интерфейс новыми разделами (настройки, плагины)

Текущий UI — одностраничный (без клиентского роутинга). Добавление новых
страниц требует ручного управления state, что не масштабируется.

### Pain points

| # | Проблема | Evidence |
|---|---------|----------|
| W1 | Нет архива сообщений | Оператор запросы к SQLite через `node -e` для поиска конкретных сообщений |
| W2 | Нет поиска/фильтров | Невозможно найти сообщение по получателю или источнику |
| W3 | Нет повторной отправки | Retry требует ручного SQL + перезапуска pipeline |
| W4 | Нет клиентского роутинга | Добавление новой страницы = рефактор App.jsx |
| W5 | Нет экспорта | Отчёты для руководства — ручной копирование из SQLite |

### Прогноз нагрузки архива

- Текущий объём: ~300 msg/мес (247 delivered + 42 failed за 21.07)
- Прогноз +400%: ~1 500 msg/мес
- При 12 мес: ~18 000 msg/year
- SQLite с LIMIT/OFFSET sufficient для 100k+ записей

## Решение

> **Примечание:** ADR-0034 определяет «Historical data archival — Out (MVP)».
> ADR-0042 расширяет scope: архив сообщений входит в scope проекта.

Расширить queue-monitor SPA до multi-page control panel с клиентским
роутингом и страницей архива сообщений.

### 1. Клиентский роутинг — React Router v6

Hash-based routing (`#/path`) вместо HTML5 history (`/path`):

- `#/dashboard` — дашборд метрик (существующий)
- `#/archive` — архив сообщений (новый)
- `#/settings` — настройки (заглушка)

**Почему hash-based:**
- Текущий `http-server.js` (ADR-0023) уже имеет SPA fallback для `index.html`
- Hash routing не требует серверной маршрутизации
- Deep linking работает без дополнительной конфигурации
- Проще для debugging (URL виден в address bar)

**Почему React Router:**
- Стандарт для React SPA
- `NavLink` для active state
- `Routes`/`Route` для декларативного роутинга
- ~7kB gzipped — приемлемо для internal tool

### 2. Навигация — NavBar

Горизонтальная навигационная панель в header:

```
┌──────────────────────────────────────────────────────────────────┐
│ ≡ Зяблик │ Дашборд │ Архив │ Настройки │ user ▾ │ Выйти         │
└──────────────────────────────────────────────────────────────────┘
```

- `NavLink` из react-router-dom для active state
- Горизонтальный layout (1 оператор, 3 раздела — горизонтальный sufficient)
- На mobile: hamburger menu (`≡`), раскрывается вертикально

### 3. Архив сообщений — API

Новые эндпоинты в `src/queue-monitor/api/archive-routes.js`:

| Endpoint | Auth | Описание |
|----------|------|----------|
| `GET /api/archive/messages` | Bearer / Session | Пагинированный список с фильтрами |
| `GET /api/archive/messages/:id` | Bearer / Session | Детали сообщения |
| `POST /api/archive/retry/:id` | Bearer / Session | Повторная отправка |
| `GET /api/archive/export` | Bearer / Session | Экспорт CSV/JSON |

#### GET /api/archive/messages

Query parameters:
- `page` (default 1) — номер страницы
- `limit` (default 20, max 100) — записей на страницу
- `status` — фильтр по статусу (delivered/failed/pending/processing)
- `source` — фильтр по источнику
- `search` — текстовый поиск по payload (LIKE)
- `from` / `to` — unix timestamps для диапазона created_at
- `sort` — сортировка (`created_at:asc`, `created_at:desc`)

Response:
```json
{
  "status": "ok",
  "data": [
    {
      "id": 1,
      "reqId": "abc-123",
      "source": "zabbix",
      "payload": "{...}",
      "status": "delivered",
      "attempts": 1,
      "createdAt": 1721764800,
      "updatedAt": 1721764801
    }
  ],
  "total": 300,
  "page": 1,
  "limit": 20,
  "pages": 15
}
```

#### GET /api/archive/messages/:id

Response:
```json
{
  "status": "ok",
  "data": {
    "id": 1,
    "reqId": "abc-123",
    "source": "zabbix",
    "payload": {
      "recipient": { "kind": "user", "value": "12345" },
      "text": "Alert: CPU > 90%"
    },
    "status": "delivered",
    "attempts": 1,
    "createdAt": 1721764800,
    "updatedAt": 1721764801
  }
}
```

### 4. Retry через queueStore.enqueue()

Повторная отправка сообщения — **не** модификация существующей записи,
а создание нового сообщения через `queueStore.enqueue()`.

**Почему не HTTP-proxy через ingress:**
- Ingress требует JWT auth (ADR-0024) — queue-monitor не хранит JWT
- Ingress нормализует payload — повторная нормализация может изменить сообщение
- Прямой вызов `queueStore.enqueue()` проще и надёжнее

**Почему не UPDATE status:**
- Нарушает readonly-принцип reader-а (ADR-0034)
- Теряется аудит-трейл (оригинальное failed сообщение)

**Реализация:**
1. Reader читает сообщение по ID (readonly)
2. Валидация payload: структура (`recipient.kind`, `recipient.value`, `text`) + `MAX_API_TEXT_LIMIT` (4000)
3. `queueStore.enqueue({ payload, source, reqId: newId })` — новый INSERT
4. Оригинальное сообщение остаётся в исходном статусе (аудит-трейл)
5. Новый `reqId` = `crypto.randomUUID()` (идемпотентность)
6. **Источник наследуется** из оригинального сообщения
7. **Retry доступен для всех статусов** (delivered, failed, pending, processing)

**Инъекция queueStore (ADR-0016):**
- `createQueueMonitor(options)` принимает `options.queueStore`
- Вызов в `app.js`: `createQueueMonitor({ queueStore, ... })`
- Если `queueStore` не передан — retry unavailable (graceful degradation)

**Отсутствие плагина source:**
- Retry разрешён даже если source-плагин удалён
- Worker обработает ошибку доставки (source plugin not found)

**UX retry:**
- Без подтверждения (optimistic UI)
- Кнопка «Повторить»: в деталях сообщения + в строке таблицы
- Ошибка backend → toast/banner с текстом ошибки; кнопка остаётся доступной
- Успех → toast/banner «Сообщение создано» + обновление списка

### 5. Экспорт — Backend endpoint

`GET /api/archive/export?format=csv|json` — серверный экспорт с фильтрами.

**Почему backend, не клиентский генератор:**
- При >10k записей клиентский генератор блокирует UI
- Backend может использовать batched cursor (1000 rows)
- CSV/JSON generation — нативная работа для Node.js streams

**Реализация:**
- CSV: `Content-Type: text/csv`, `Content-Disposition: attachment`
- JSON: `Content-Type: application/json`
- Streaming: `db.prepare().iterate()` + `res.write()` + `res.end()`
- Фильтры: те же что в `/api/archive/messages`
- **Экспорт всех результатов фильтра** (без пагинации)
- **Batch size: 1000 строк** (чтение из БД + запись в response)
- **Имя файла**: `archive_YYYY-MM-DD_HHmmss.csv` или `.json` (UTC)

### 6. Archive UX — детали

**Поиск:** Allows wildcards (`%` и `_`) в LIKE queries — **не** экранируются.
Placeholder: «Поиск по payload...».

**Фильтры:**
- Статус: Все, Delivered, Failed, Pending, Processing
- Источник: текстовый input
- Дата: пресеты (сегодня, вчера, неделя, месяц) + absolute range
- Сброс: кнопка «Сбросить» видна всегда
- При изменении фильтра — сброс на страницу 1

**Таблица:**
- Колонки: ID, Дата, Статус, Источник, Получатель, Попытки
- Дата: `DD.MM.YYYY HH:MM:SS` (без relative time)
- Получатель: `recipient.value` из payload (fallback «—» при ошибке парсинга)
- Сортировка: клик по заголовку колонки → asc/desc
- Дефолт: `created_at:desc` (новые сверху)
- Клик по строке → `/archive/:id` (deep linking)

**Пагинация:**
- Кнопки с номерами страниц + «Назад»/«Вперёд»
- Limit dropdown: 20, 50, 100 (default: 20)

**Состояния:**
- Loading: skeleton rows в таблице
- Empty: «Сообщений не найдено» + «Попробуйте изменить фильтры»
- Error: текст ошибки + кнопка «Повторить»

**Обновление:** ручное (кнопка «Обновить»), без автообновления.

**Экспорт:** кнопка «Экспорт» в панели фильтров.

### 7. Архитектура

```
src/queue-monitor/
├── api/
│   ├── archive-routes.js    — NEW: /api/archive/* endpoints
│   ├── metrics.js           — unchanged
│   ├── auth.js              — unchanged
│   └── auth-routes.js       — unchanged
├── db/
│   └── reader.js            — расширить: archiveMessages(), archiveMessageById()
├── ui/
│   └── src/
│       ├── App.jsx          — REFACTOR: HashRouter, Routes
│       ├── components/
│       │   ├── NavBar.jsx   — NEW: навигационная панель
│       │   └── ...          — unchanged
│       ├── pages/
│       │   ├── DashboardPage.jsx  — unchanged
│       │   ├── ArchivePage.jsx    — NEW: страница архива
│       │   ├── MessageDetail.jsx  — NEW: детали сообщения
│       │   └── SettingsPage.jsx   — NEW: заглушка
│       └── hooks/
│           └── useArchive.js      — NEW: data fetching для архива
├── index.js                 — расширить: queueStore injection, archive routes
└── http-server.js           — unchanged
```

## Рассмотренные альтернативы

### HTML5 history routing (/path)

Вместо hash-based (`#/path`).

Минус: требует серверной маршрутизации (все пути → index.html). Текущий
`http-server.js` уже имеет SPA fallback, но для `GET /api/*` и `GET /readyz`
 fallback не срабатывает. Нужно менять логику fallback. Hash-based проще
и безопаснее. Отклонено.

### HTTP-proxy retry через ingress

Очередь retry → HTTP POST → ingress server → queueStore.enqueue().

Минус: ingress требует JWT auth, который queue-monitor не хранит.
Нормализация payload может изменить сообщение. Прямой вызов
`queueStore.enqueue()` проще. Отклонено.

### UPDATE status (modified retry)

Изменить `status = 'pending'` существующей записи.

Минус: нарушает readonly-принцип reader-а (ADR-0034). Теряется
аудит-трейл. worker может обработать строку до завершения retry.
Отклонено.

### Клиентский CSV-генератор

Генерация CSV на стороне клиента (Blob + download).

Минус: при >10k записей блокирует UI (основной поток). Нет streaming.
Backend endpoint масштабируется лучше. Отклонено.

### Плагинная архитектура страниц

Каждая «страница» UI регистрируется как плагин.

Минус: over-engineering для 1 оператора. React Router + switch case
достаточно. Отклонено.

## Последствия

- Новая зависимость: `react-router-dom` v6 в `src/queue-monitor/ui/package.json`
  (отдельный package.json, не затрагивает root ADR-0015)
- Новые файлы: `archive-routes.js`, `NavBar.jsx`, `ArchivePage.jsx`,
  `MessageDetail.jsx`, `SettingsPage.jsx`, `useArchive.js`
- Изменения: `reader.js` (archive queries), `index.js` (queueStore injection,
  archive routes), `App.jsx` (HashRouter), `app.js` (queueStore pass)
- Auth: retry и export используют существующий Bearer Token / Session auth
- Readonly reader: не нарушается. Retry пишет через `queueStore`, не через `reader`
- Тесты: `tests/queue-monitor/api/archive.test.js`, расширение
  `tests/queue-monitor/db/reader.test.js`

## Тесты

- `tests/queue-monitor/api/archive.test.js`: archive endpoints, retry, export
- `tests/queue-monitor/db/reader.test.js`: archiveMessages(), archiveMessageById()
- `tests/queue-monitor/index.test.js`: queueStore injection
- UI: `npm run build` (сборка без ошибок)
