# ADR-0014: Использовать async HTTP через child_process.spawn вместо in-process fetch

## Статус

Принято.

## Дата

2026-07-15

## Контекст

Bot-platform выполняет long-polling запросы к MAX API (`GET /updates` до 30 секунд) и отправку сообщений (`POST /messages`). Требования:

- Long-polling запрос не должен блокировать event loop (до 30 секунд ожидания)
- Зависший запрос должен быть принудительно завершён (hard timeout kill)
- Ошибки сети не должны крашить основной процесс

Исходная реализация использовала `spawnSync()` — блокирующую операцию, которая замораживала весь event loop на время long-poll.

## Решение

Выполнять каждый HTTP-запрос в дочернем процессе через `child_process.spawn(process.execPath, ['-e', childScript])`:

### Протокол

1. Родитель записывает JSON-запрос в stdin дочернего процесса
2. Дочерний процесс выполняет `fetch()` (Node.js встроенный)
3. Результат записывается в stdout (успех) или stderr (ошибка)
4. Родитель парсит JSON из stdout/stderr

### Таймаут и kill

- `spawn()` с опцией `timeout: timeoutMs` (по умолчанию 90000ms для long-poll)
- При превышении таймаута Node.js автоматически отправляет `SIGTERM`
- Тест `live-runtime-async-http.test.js` проверяет, что `stop()` возвращает управление немедленно даже если poll never resolves

### childScriptOverride

Тестовый хук для инъекции детерминированного скрипта (например, зависающего) без сети.

```js
// Тест: передаём скрипт который никогда не отвечает
const result = runFetchRequest(binary, request, 100, 'while(true){}');
// → отвергается через 10ms
```

## Почему не in-process fetch()

- In-process `fetch()` с `AbortController` не даёт hard kill процесса
- Зависший DNS или TLS handshake блокует event loop
- Нет process isolation — ошибка в fetch может крашить основной процесс

## Почему не worker_threads

- Worker threads разделяют event loop с родителем
- `worker.terminate()` не garantir.kill если thread завис в native коде
- child_process даёт полную process isolation и hard kill через SIGTERM

## Почему не HTTP-сервер (express/fastify)

- Bot-platform не принимает входящие HTTP-запросы (long-polling — исходящие)
- HTTP-сервер добавляет зависимости (ADR-0015) и порт для прослушивания
- Длинный poll не требует серверной архитектуры

## Последствия

- Каждый HTTP-запрос = fork нового Node.js процесса (~10ms overhead)
- `DEFAULT_HTTP_TIMEOUT_MS = 90000` — для long-poll окна
- Тесты используют `childScriptOverride` для детерминированного тестирования
- `runChildScript()` возвращает Promise сreject при timeout/spawn error/ненулевом коде

## Рассмотренные альтернативы

### spawnSync (предыдущая реализация)

Минус: блокирует event loop на 30+ секунд, systemd не может отправить SIGTERM во время poll.

### In-process fetch + AbortController

Минус: не даёт hard kill, зависший fetch не завершается принудительно.

### Worker threads

Минус: разделяют event loop, `worker.terminate()` не garantiz kill при native deadlock.

### axios/got с таймаутами

Минус: нарушает ADR-0015 (нулевые зависимости), не решает проблему process isolation.
