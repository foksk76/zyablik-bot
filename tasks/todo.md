# Task Checklist — Sprint 31 + Sprint 32 (Web Interface: Archive + Navigation Shell)

## Sprint 31: Navigation Shell + Archive Backend

- [ ] **1. React Router** — `react-router-dom` v6 в package.json, `npm install`
- [ ] **2. App.jsx рефактор** — HashRouter, Routes, Route, дефолтный редирект на `#/dashboard`
- [ ] **3. NavBar** — NavLink компонент, 3 ссылки, active state
- [ ] **4. Settings stub** — заглушка "Раздел в разработке"
- [ ] **5. Archive queries в reader.js** — `archiveMessages()`, `archiveMessageById()`, пагинация, фильтры
- [ ] **6. Archive routes** — `GET /api/archive/messages`, `GET /api/archive/messages/:id`, auth
- [ ] **7. queueStore injection** — опция в `createQueueMonitor()`, передача из `app.js`

### Checkpoint: Sprint 31

- [ ] `npm run build` — сборка без ошибок
- [ ] `npm test` — все тесты passing
- [ ] NavBar отображается, роутинг работает
- [ ] Archive API отвечает

---

## Sprint 32: Archive UI + Retry + Export

- [ ] **8. useArchive hook** — data fetching, пагинация, debounce search, abort
- [ ] **9. ArchivePage таблица** — колонки, пагинация, сортировка, loading/empty states
- [ ] **10. Фильтры архива** — поиск, статус, источник, диапазон дат
- [ ] **11. MessageDetail** — детали сообщения, payload JSON, кнопка retry
- [ ] **12. Retry backend** — `POST /api/archive/retry/:id`, validation, `queueStore.enqueue()`
- [ ] **13. Retry UI** — кнопка "Повторить", optimistic UI, toast
- [ ] **14. Export backend** — `GET /api/archive/export?format=csv|json`, streaming
- [ ] **15. Export UI** — кнопка "Экспорт", скачивание CSV/JSON

### Checkpoint: Sprint 32

- [ ] `npm run build` — сборка без ошибок
- [ ] `npm test` — все тесты passing
- [ ] Archive: таблица, фильтры, пагинация
- [ ] Retry: работает end-to-end
- [ ] Export: скачивание CSV/JSON

---

## Final Verification

- [ ] `npm test` — все тесты passing
- [ ] `npm run build` (в src/queue-monitor/ui/) — сборка без ошибок
- [ ] Дашборд работает без регрессий
- [ ] Архив: поиск, фильтры, пагинация, детали, retry, export
- [ ] Настройки: заглушка
