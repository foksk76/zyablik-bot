# ADR-0035: Session auth как альтернатива Bearer для dashboard metrics

## Статус

Принято.

## Дата

2026-07-22

## Контекст

ADR-0034 определяет два независимых потока auth через единый IdP:

- **UI (оператор)**: OAuth2 Authorization Code + PKCE → session cookie
  (HTTP-only). Middleware на `/api/auth/*`. Logout endpoint.
- **Metrics (внешние системы)**: Bearer Token (`Authorization: Bearer xxx`)
  через ENV `METRICS_API_KEY`. Статический токен, read-only, не требует
  refresh.

После OAuth2 логина оператор всё равно должен ввести `METRICS_API_KEY`
вручную в UI для доступа к `/api/metrics/*`. Это лишний шаг: оператор
уже аутентифицирован через IdP, повторный ввод ключа не добавляет
безопасности. Метрики — read-only данные, идентичные тому, что оператор
уже видит в dashboard.

Внешние системы (Zabbix HTTP Agent, Prometheus blackbox exporter, curl)
продолжают использовать Bearer Token — они не имеют session cookie.

## Решение

Эндпоинты `/api/metrics/*` принимают **два** типа аутентификации:

1. **Bearer Token** (`Authorization: Bearer xxx`) — для внешних систем
   мониторинга. Ключ берётся из ENV `METRICS_API_KEY`.
2. **Session cookie** — для UI после успешного OAuth2 логина.
   Cookie передаётся автоматически (`credentials: 'same-origin'`).

Приоритет проверки: сначала Bearer Token, затем session cookie.
Если оба отсутствуют — 401 Unauthorized.

UI после OAuth2 логина автоматически использует session cookie для
вызовов `/api/metrics/*`. Поле ввода `METRICS_API_KEY` удаляется из UI.

`METRICS_API_KEY` остаётся **обязательным** ENV для работы queue-monitor:
- внешние системы мониторинга используют его для прямых запросов к API;
- его отсутствие блокирует старт модуля (защита от конфигурационной ошибки).

## Изменения в коде

### api/auth.js

`protectRoute()` получает fallback на session cookie. Если Bearer Token
отсутствует или невалиден, проверяется session через `readSession()`:

```text
protectRoute(handler) →
  1. Попытка: Bearer Token auth (timing-safe сравнение)
  2. Fallback: session cookie auth (readSession)
  3. Оба не прошли → 401 Unauthorized
```

### api/auth-routes.js

`readSession()` добавляется в экспорт модуля (сейчас используется
только внутренне в `session()`, `callback()`, `logout()`).

### UI (React SPA)

- `DashboardPage.jsx`: удалить блок ввода `METRICS_API_KEY`
  (строки 9, 17-20, 28-32, 66-88, 98-103).
- `useMetrics.js`: добавить `credentials: 'same-origin'` в fetch-запросы.
- `useMetrics.js`: удалить проверку `if (!apiKey)` и ошибку
  `'METRICS_API_KEY не задан'`.

### ENV

`METRICS_API_KEY` остаётся обязательным ENV. Изменяется только
назначение: ключ для внешних систем, а не для UI.

## Альтернативы

### Server-side proxy (вариант B)

UI вызывает `/api/dashboard/*` (session-protected), сервер внутренне
вызывает тот же reader и возвращает данные. `/api/metrics/*` — только
для Bearer.

Минус: дублирование route-регистрации, больше кода, два эндпоинта
на одни и те же данные. Отклонено.

### Embed ключа в session response (вариант C)

После OAuth2 логина сервер возвращает `METRICS_API_KEY` в
`/api/auth/session`. UI автоматически подставляет его в заголовки.

Минус: `METRICS_API_KEY` попадает в браузер (XSS-риск). Нарушение
модели ADR-0034: ключ — для внешних систем, не для UI. Отклонено.

### Только session auth (вариант D)

Metrics-эндпоинты принимают только session auth. Внешние системы
тоже должны аутентифицироваться через OAuth2.

Минус: ломает Zabbix HTTP Agent, Prometheus blackbox exporter, curl.
Несовместимо с ADR-0034. Отклонено.

## Последствия

- `METRICS_API_KEY` нужен только для не-браузерных клиентов.
- Обратная совместимость: Bearer Token продолжает работать для
  всех существующих внешних интеграций.
- ADR-0034 дополняется этим решением: секция Auth и таблица
  API endpoints обновлены.
- UI становится проще: один логин через IdP, метрики доступны
  автоматически, повторный ввод ключа не требуется.

## Ссылки

- [ADR-0034](ADR-0034-queue-monitor-dashboard.md) — исходная
  архитектура dashboard с двумя потоками auth
- `src/queue-monitor/api/auth.js` — Bearer Token auth
- `src/queue-monitor/api/auth-routes.js` — OAuth2 session auth
- `src/queue-monitor/ui/src/pages/DashboardPage.jsx` — UI dashboard
