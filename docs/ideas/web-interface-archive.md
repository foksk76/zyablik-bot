# Web Interface: Archive + Navigation Shell

## Problem Statement

How Might We дать оператору возможность просматривать, искать и повторно
отправлять сообщения из архива доставки, а также расширять интерфейс
бота новыми разделами — в едином веб-интерфейсе с клиентским роутингом?

## Recommended Direction

**Archive First + Navigation Shell**

Расширяем текущий queue-monitor SPA до multi-page control panel:
- React Router для клиентского роутинга (`/dashboard`, `/archive`, `/settings`)
- Навигационный компонент (горизонтальный навбар для 1 оператора)
- Архив сообщений как полноценная страница (поиск, фильтры, пагинация,
  экспорт, детали, retry)
- Страница «Настройки» — заглушка для будущих разделов (Zabbix config,
  плагины, общие параметры)
- Retry = повторная отправка payload через существующий ingress pipeline
  (новое сообщение, аудит-трейл сохраняется)

## Key Assumptions to Validate

- [ ] React Router v6+ корректно работает с Vite + hash-based routing
      (SPA fallback уже настроен в `http-server.js`)
- [ ] Существующий ingress pipeline (`POST /api/ingress`) готов принимать
      retry-payload без дополнительной аутентификации (или с тем же JWT)
- [ ] Навигация не ломает текущий UX дашборда (TimeRangeBar, auto-refresh)
- [ ] Экспорт в CSV/JSON на клиенте (без backend endpoint) — производительность
      при >10k записей

## MVP Scope (Sprint 1)

### In

**Навигация:**
- React Router v6: hash-based routing (`#/dashboard`, `#/archive`, `#/settings`)
- Горизонтальный навбар в header: Дашборд | Архив | Настройки
- Active state для текущей страницы
- Deep linking через hash-пути

**Архив сообщений (`/archive`):**
- Таблица всех сообщений из `delivery_queue` (все статусы)
- Колонки: ID, Дата, Статус, Источник, Получатель, Попытки
- Пагинация (20/50/100 на страницу)
- Текстовый поиск по payload (recipient, message)
- Фильтры: статус (delivered/failed/pending/processing), источник, диапазон дат
- Сортировка по дате (новые/старые)
- Экспорт в CSV и JSON (backend endpoint: `GET /api/archive/export?format=csv|json`)
- Просмотр деталей сообщения (modal или отдельный роут `/archive/:id`)
- Retry (повторная отправка) — кнопка в деталях и в таблице
  - Retry = POST payload через `/api/ingress` → новое сообщение в очереди
  - Оригинальное сообщение остаётся failed (аудит-трейл)
  - Optimistic UI: иконка "отправляется..." → "создано" / "ошибка"

**API (backend):**
- `GET /api/archive/messages` — пагинированный список с фильтрами
  - Query: `page`, `limit`, `status`, `source`, `search`, `from`, `to`, `sort`
  - Response: `{ data: [...], total, page, limit, pages }`
- `GET /api/archive/messages/:id` — детали одного сообщения
- `POST /api/archive/retry/:id` — повторная отправка (proxy через ingress)
- `GET /api/archive/export?format=csv|json` — экспорт с фильтрами (streaming для больших объёмов)
- Все эндпоинты: Bearer Token / Session auth (как `/api/metrics/*`)

**Настройки (`/settings`):**
- Заглушка: "Раздел в разработке"
- Список будущих подразделов (текстом): Zabbix Media Type, Плагины,
  Общие параметры

### Out (Sprint 1)

- Полный функционал настроек (Zabbix config, plugins, general)
- Retry с обновлением статуса (остаётся readonly reader)
- WebSocket/SSE для live-обновлений архива
- Bulk actions (массовый retry, массовый экспорт)
- Аудит-лог действий оператора

## Not Doing (and Why)

- **Write-доступ к `delivery_queue` из queue-monitor** — нарушает ADR-0034
  (readonly replica). Retry через ingress pipeline чище.
- **Плагинная архитектура страниц** — over-engineering для 1 оператора.
  React Router + switch case достаточно.
- **PostgreSQL migration** — SQLite sufficien для текущей нагрузки.
- **SSE/WebSocket** — polling достаточен для архива.
- **Аутентификация retry** — retry-payload проходит через тот же ingress,
  что и оригинальное сообщение (единый JWT/token).

## Architecture Impact

```
src/queue-monitor/
├── api/
│   ├── archive-routes.js    — NEW: /api/archive/* endpoints
│   ├── metrics.js           — unchanged
│   └── ...
├── db/
│   └── reader.js            — расширить: archive queries (пагинация, поиск)
├── ui/
│   └── src/
│       ├── App.jsx          — REFACTOR: React Router wrapper
│       ├── components/
│       │   ├── NavBar.jsx   — NEW: навигационная панель
│       │   └── ...
│       ├── pages/
│       │   ├── DashboardPage.jsx  — MOVE: из App.jsx
│       │   ├── ArchivePage.jsx    — NEW: страница архива
│       │   ├── MessageDetail.jsx  — NEW: детали сообщения
│       │   └── SettingsPage.jsx   — NEW: заглушка
│       └── hooks/
│           └── useArchive.js      — NEW: data fetching для архива
└── http-server.js           — register new routes
```

## Resolved Questions

- [x] CSV-экспорт: **backend endpoint** (`GET /api/archive/export?format=csv`).
      Клиентский генератор при >10k записей медленный.
- [x] Retry: **валидация payload перед отправкой** — проверка актуальности
      recipient, не изменился ли bot token. Retry создаёт новое сообщение.
- [x] Роутинг: **hash-based** (`#/path`). SPA fallback в `http-server.js`
      уже поддерживает.
