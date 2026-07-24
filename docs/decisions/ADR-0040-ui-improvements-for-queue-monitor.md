# ADR-0040: Улучшения UI Queue Monitor Dashboard

## Статус

Принято.

## Дата

2026-07-24

## Контекст

ADR-0034 вводит Queue Monitor Dashboard. ADR-0036 добавляет дизайн-систему
(shadcn/ui, tokens, Storybook). Текущий UI functional, но содержит ряд
недостатков, выявленных при эксплуатации 1 оператором:

### Pain points

| # | Проблема | Evidence |
|---|---------|----------|
| P1 | Нет drill-down ошибок | ErrorsTable показывает source, recipient, attempts, updated — но не текст ошибки и не payload. Оператор не может диагностировать проблему без ручного запроса к БД |
| P2 | Session expiry без auto-redirect | useMetrics устанавливает error string при 401, но не очищает interval и не редиректит на login. Оператор видит «Сессия истекла» и должен обновить страницу вручную |
| P3 | alert() при logout ошибке | DashboardPage.logout() вызывает `alert()` — нативный браузерный диалог, не совместимый с design system |
| P4 | Фиксированные лимиты | TopTable: limit=5 (hardcoded). ErrorsTable: limit=20 (hardcoded). Оператор не может изменить |
| P5 | Нет countdown до автообновления | 30s polling — «слепой»: оператор не знает, когда данные обновятся следующий раз |
| P6 | Нет error boundary | Один crash в компоненте (malformed data) — white-screen всего dashboard |

### Текущее состояние кода

```text
useMetrics.js:
  - fetchJson бросает Error('SESSION_EXPIRED') при 401
  - setError('Сессия истекла...') — строка, без redirect
  - setInterval(refresh, 30000) — не очищается при session error

DashboardPage.jsx:
  - alert() при logout server error (строка 27)
  - нет error boundary обёртки

ErrorsTable.jsx:
  - parseRecipient(payload) — извлекает recipient.value, остальное игнорируется
  - 5 колонок: ID, Источник, Получатель, Попыток, Обновлено
  - нет expandable rows или detail modal
```

## Решение

Внедрить 6 улучшений в `src/queue-monitor/ui/` в рамках существующей
дизайн-системы (ADR-0036). Все изменения — в слое `ui/`, не затрагивают
backend API.

### 1. Error detail drill-down

**Проблема:** ErrorsTable не показывает текст ошибки и payload.

**Решение:** Expandable rows — клик по строке раскрывает дополнительную
секцию с полным payload (JSON pretty-print).

```jsx
// ErrorsTable.jsx — паттерн
<TableRow onClick={() => toggleRow(row.id)} className="cursor-pointer">
    <TableCell>{row.id}</TableCell>
    ...
</TableRow>
{expandedId === row.id && (
    <TableRow>
        <TableCell colSpan={5}>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">
                {JSON.stringify(JSON.parse(row.payload), null, 2)}
            </pre>
        </TableCell>
    </TableRow>
)}
```

Почему expandable rows, а не Dialog/Sheet:
- Не требует нового shadcn-компонента (ADR-0036: minimalism);
- Контекст сохраняется (оператор видит таблицу + detail);
- Простая реализация — state `expandedId` в компоненте.

**Файлы:** `ErrorsTable.jsx`

### 2. Session expiry auto-redirect

**Проблема:** useMetrics продолжает polling при 401, interval не очищается.

**Решение:** При `SESSION_EXPIRED` — очистить interval, выполнить redirect
через 2 секунды (с сообщением).

```js
// useMetrics.js
if (err.message === 'SESSION_EXPIRED') {
    setError('Сессия истекла. Перенаправление...');
    clearInterval(refreshRef.current);
    setTimeout(() => { window.location.href = '/api/auth/login'; }, 2000);
    return;
}
```

Почему redirect через 2s, а не немедленно:
- Оператор должен увидеть сообщение (0s — мелькнет и исчезнет);
- 2s — достаточно для чтения, не раздражает.

**Файлы:** `useMetrics.js`

### 3. Замена alert() на inline banner

**Проблема:** alert() при logout ошибке — нативный браузерный диалог.

**Решение:** Использовать существующий error banner pattern из DashboardPage.

```jsx
// DashboardPage.jsx
const [logoutError, setLogoutError] = useState(null);

async function logout() {
    try {
        const r = await fetch('/api/auth/logout', { ... });
        if (!r.ok) {
            setLogoutError(`Не удалось выйти (сервер: ${r.status})`);
            return;
        }
    } catch { /* redirect anyway */ }
    window.location.href = '/';
}

// В JSX:
{logoutError && (
    <div className="bg-error-light border border-error/20 text-error-dark text-sm rounded-lg p-3">
        {logoutError}
        <Button variant="ghost" size="sm" className="ml-2" onClick={() => setLogoutError(null)}>
            ×
        </Button>
    </div>
)}
```

**Файлы:** `DashboardPage.jsx`

### 4. Configurable limits

**Проблема:** TopTable limit=5, ErrorsTable limit=20 — hardcoded.

**Решение:** Добавить параметр `limit` в useMetrics, передаваемый из
DashboardPage. UI control — select/button group ( shadcn Button variant="ghost").

```jsx
// DashboardPage.jsx
const [topLimit, setTopLimit] = useState(5);
const [errorsLimit, setErrorsLimit] = useState(20);

const metrics = useMetrics({ windowSeconds, topLimit, errorsLimit, refreshMs: 30000 });

// useMetrics.js — limit как параметр
fetchJson(`/api/metrics/top?by=${topBy}&limit=${topLimit}`),
fetchJson(`/api/metrics/errors?limit=${errorsLimit}`)
```

Варианты limit: 5 / 10 / 20 (top), 20 / 50 / 100 (errors).

**Файлы:** `useMetrics.js`, `DashboardPage.jsx`, `TopTable.jsx`, `ErrorsTable.jsx`

### 5. Auto-refresh countdown

**Проблема:** Оператор не знает, когда данные обновятся следующий раз.

**Решение:** Таймер обратного отсчёта рядом с кнопкой «обновить».
Реализация — `useState` с `setInterval` на 1s, decresing counter.

```jsx
// DashboardPage.jsx
const [countdown, setCountdown] = useState(30);

useEffect(() => {
    const tick = setInterval(() => {
        setCountdown((c) => (c <= 1 ? 30 : c - 1));
    }, 1000);
    return () => clearInterval(tick);
}, []);

// В JSX:
<Button variant="ghost" size="sm" onClick={() => { metrics.refresh(); setCountdown(30); }}>
    <RefreshCw className="w-4 h-4 mr-1 shrink-0" />
    обновить ({countdown}с)
</Button>
```

Почему countdown, а не progress bar:
- Простая реализация (1 state + 1 interval);
- Не требует нового компонента;
- Достаточно для 1 оператора.

**Файлы:** `DashboardPage.jsx`

### 6. Error boundary

**Проблема:** Crash в компоненте = white-screen всего dashboard.

**Решение:** React Error Boundary, оборачивающий каждый dashboard panel.
Fallback — error card с кнопкой retry (перезагрузка страницы).

```jsx
// components/ErrorBoundary.jsx (новый файл)
class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError() { return { hasError: true }; }
    render() {
        if (this.state.hasError) {
            return (
                <Card>
                    <CardContent className="py-8 text-center">
                        <p className="text-sm text-error-dark mb-2">Ошибка отображения</p>
                        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                            Перезагрузить
                        </Button>
                    </CardContent>
                </Card>
            );
        }
        return this.props.children;
    }
}
```

Обёртка в DashboardPage:

```jsx
<ErrorBoundary>
    <SummaryCards summary={metrics.summary} />
</ErrorBoundary>
<ErrorBoundary>
    <TimeseriesChart ... />
</ErrorBoundary>
```

Почему отдельные boundary для каждого panel:
- Краш в TimeseriesChart не ломает SummaryCards и TopTable;
- Оператор видит 3 из 4 панелей работающими.

**Файлы:** `components/ErrorBoundary.jsx` (новый), `DashboardPage.jsx`

## Рассмотренные альтернативы

### shadcn Dialog/Sheet для error detail

Минус: добавляет @radix-ui/react-dialog как runtime-зависимость. Для 1
раскрывающейся строки — overkill. Expandable rows проще и не требуют
новых зависимостей. Отклонено.

### Toast-библиотека (react-hot-toast, sonner)

Минус: +1 runtime-зависимость в ui/package.json. Для 2-3 сообщений
достаточно inline banner (паттерн уже используется в DashboardPage).
Отклонено.

### Новый API endpoint для error details

Минус: payload уже приходит в `/api/metrics/errors` — достаточно
отобразить его в UI. Backend-изменения не требуются. Отклонено.

### WebSocket для countdown

Минус: countdown — клиентская логика (30 - N). WebSocket не нужен.
Отклонено.

## Граница решения

Решение ограничено `src/queue-monitor/ui/`:

- не затрагивает `src/bot-platform/`, `src/zabbix-media-type/`;
- не изменяет backend API endpoints;
- не добавляет runtime-зависимостей в `ui/package.json`;
- не расширяет scope проекта.

## Последствия

### Новые файлы

```text
src/queue-monitor/ui/src/components/ErrorBoundary.jsx  — React Error Boundary
```

### Изменённые файлы

```text
src/queue-monitor/ui/src/components/ErrorsTable.jsx    — expandable rows, configurable limit
src/queue-monitor/ui/src/hooks/useMetrics.js           — session redirect, configurable limits
src/queue-monitor/ui/src/pages/DashboardPage.jsx       — alert→banner, countdown, error boundaries, limits
src/queue-monitor/ui/src/components/TopTable.jsx       — configurable limit
```

### Не затронуто

- `src/bot-platform/` — без изменений;
- `src/zabbix-media-type/` — без изменений;
- Backend API — без изменений (payload уже в /api/metrics/errors);
- ADR-0015 policy-test (root) — без изменений;
- `npm test` — все тесты продолжают работать.

### Ожидаемый результат

- `npm test` проходит;
- UI собирается (`npm run build` в `ui/`);
- ошибки раскрываются кликом (payload visible);
- session expiry → auto-redirect через 2s;
- logout error → inline banner (не alert);
- limits настраиваемые (5/10/20 для top, 20/50/100 для errors);
- countdown показывает время до следующего обновления;
- crash одного panel не ломает остальные;
- `docs/ui-guidelines.md` обновлён с паттернами.

## Ссылки

- [ADR-0034](ADR-0034-queue-monitor-dashboard.md) — Queue Monitor Dashboard
- [ADR-0036](ADR-0036-design-system-for-queue-monitor-ui.md) — Дизайн-система
- [ADR-0035](ADR-0035-session-auth-for-dashboard-metrics.md) — Session auth
