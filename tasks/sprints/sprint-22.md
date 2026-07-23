# Спринт 22 — Session Auth для Dashboard Metrics (ADR-0035)

**Цель:** реализовать session-авторизацию как альтернативу Bearer Token для метрик dashboard, чтобы UI работал без ручного ввода API-ключа.

**ADR:** [ADR-0035-session-auth-for-dashboard-metrics.md](../../docs/decisions/ADR-0035-session-auth-for-dashboard-metrics.md)

## Задачи

### 1. [x] Backend: session fallback в protectRoute

**Файл:** `src/queue-monitor/api/auth.js`

- Модифицировать `protectRoute(handler)` — если нет/невалиден Bearer token, проверять session cookie через `readSession()`
- Если ни Bearer, ни session не прошли → 401 Unauthorized (текущее поведение)
- Если session валидна → вызвать handler (без 401)
- Принимать `sessionStore` как опциональный параметр в `createBearerAuth()`
- Если `sessionStore` не передан — работать в bearer-only режиме (обратная совместимость)

**Тесты:** добавить в `tests/queue-monitor/api/auth.test.js`:
- `protectRoute` пропускает при валидной session cookie
- `protectRoute` возвращает 401 если нет ни Bearer, ни session
- `protectRoute` в bearer-only режиме (sessionStore=null) игнорирует cookie

### 2. [x] Backend: экспорт readSession

**Файл:** `src/queue-monitor/api/auth-routes.js`

- `readSession` уже импортируется из `../auth/session` (строка 14) — просто добавить в `module.exports`

### 3. [x] Backend: передача sessionStore в createBearerAuth

**Файл:** `src/queue-monitor/index.js`

- Передать `sessionStore` в `createBearerAuth()` (строка 42) если `authEnabled === true`
- Если `sessionStore === null` (OAuth2 выключен) — createBearerAuth работает как раньше (bearer-only)

### 4. [x] UI: убрать поле METRICS_API_KEY из DashboardPage

**Файл:** `src/queue-monitor/ui/src/pages/DashboardPage.jsx`

- Удалить `apiKey` state и input поле
- Передавать `undefined` или пустую строку в `useMetrics`

### 5. [x] UI: credentials в useMetrics

**Файл:** `src/queue-monitor/ui/src/hooks/useMetrics.js`

- Добавить `credentials: 'same-origin'` к каждому `fetch()` запросу
- Убрать параметр `apiKey` / заголовок `Authorization` из запросов

### 6. [x] Тесты: обновить auth.test.js

**Файл:** `tests/queue-monitor/api/auth.test.js`

- Mock session store для тестов session-fallback
- Покрыть новый код protectRoute

## Приёмочные критерии

- [x] `npm test` — все тесты проходят (0 failures)
- [x] Dashboard UI работает без ввода API-ключа (session cookie используется автоматически)
- [x] Внешние системы (Zabbix, Prometheus) по-прежнему работают через Bearer token
- [x] Бearer-only режим (без OAuth2) работает как раньше — обратная совместимость

## Файлы для изменения

```
src/queue-monitor/api/auth.js         — session fallback в protectRoute
src/queue-monitor/api/auth-routes.js  — экспорт readSession
src/queue-monitor/index.js            — передача sessionStore в createBearerAuth
src/queue-monitor/ui/src/pages/DashboardPage.jsx — убрать API key input
src/queue-monitor/ui/src/hooks/useMetrics.js     — credentials: same-origin
tests/queue-monitor/api/auth.test.js  — новые тесты
```
