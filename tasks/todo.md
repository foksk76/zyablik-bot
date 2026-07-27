# Task Checklist — Sprint 31 + Sprint 32 (Web Interface: Archive + Navigation Shell)

## Sprint 31: Navigation Shell + Archive Backend

- [x] **1. React Router** — `react-router-dom` v6 в package.json, `npm install`
- [x] **2. App.jsx рефактор** — HashRouter, Routes, Route, дефолтный редирект на `#/dashboard`
- [x] **3. NavBar** — NavLink компонент, 3 ссылки, active state
- [x] **4. Settings stub** — заглушка "Раздел в разработке"
- [x] **5. Archive queries в reader.js** — `archiveMessages()`, `archiveMessageById()`, пагинация, фильтры
- [x] **6. Archive routes** — `GET /api/archive/messages`, `GET /api/archive/messages/:id`, auth
- [x] **7. queueStore injection** — опция в `createQueueMonitor()`, передача из `app.js`

### Checkpoint: Sprint 31

- [x] `npm run build` — сборка без ошибок
- [x] `npm test` — все тесты passing
- [x] NavBar отображается, роутинг работает
- [x] Archive API отвечает

---

## Sprint 32: Archive UI + Retry + Export

- [x] **8. useArchive hook** — data fetching, пагинация, debounce search, abort
- [x] **9. ArchivePage таблица** — колонки, пагинация, сортировка, loading/empty states
- [x] **10. Фильтры архива** — поиск, статус, источник, диапазон дат
- [x] **11. MessageDetail** — детали сообщения, payload JSON, кнопка retry
- [x] **12. Retry backend** — `POST /api/archive/retry/:id`, validation, `queueStore.enqueue()`
- [x] **13. Retry UI** — кнопка "Повторить", optimistic UI, toast
- [x] **14. Export backend** — `GET /api/archive/export?format=csv|json`, streaming
- [x] **15. Export UI** — кнопка "Экспорт", скачивание CSV/JSON

### Checkpoint: Sprint 32

- [x] `npm run build` — сборка без ошибок
- [x] `npm test` — все тесты passing
- [x] Archive: таблица, фильтры, пагинация
- [x] Retry: работает end-to-end
- [x] Export: скачивание CSV/JSON

---

## Final Verification

- [x] `npm test` — все тесты passing
- [x] `npm run build` (в src/queue-monitor/ui/) — сборка без ошибок
- [ ] Дашборд работает без регрессий
- [x] Архив: поиск, фильтры, пагинация, детали, retry, export
- [x] Настройки: заглушка
