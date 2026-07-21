# ADR-0033: Crash recovery для delivery pipeline

## Статус

Принято.

## Дата

2026-07-21

## Контекст

ADR-0028 вводит очередь доставки сообщений с гарантией **at-least-once**.
Code review репозитория (2026-07-21) выявил три связанных пробела в
crash-resilience delivery pipeline, каждый из которых отдельно нарушает
at-least-once гарантию ADR-0028 или наблюдаемость ADR-0029.

### BUG A: зависшие `processing`-строки после краша процесса

`queue/store.js` `dequeue()` помечает строки `status='processing'`, но
никакой TTL/reaper не возвращает их в `pending`. Если процесс упал (OOM,
SIGKILL, crash между `dequeue` и `ack`/`nack`) — сообщение остаётся в
`processing` **навсегда** и теряется. ADR-0028 прямо обещает «Сообщение
гарантированно доставляется» и «SQLite persistence гарантирует delivery
после restart» — это обещание не выполняется при crash процесса.

В существующем репозитории файл `delivery-queue.db-wal` объёмом 4.7 МБ
указывает, что БД никогда не закрывалась чисто — наблюдаемое последствие
этого бага в практике.

### BUG B: poison-message loop в long-polling

`runtime/long-polling.js` `tick()` вызывает `onCycleSuccess` (который
ack-ает marker через `inboundClient.ack(pendingMarker)`) только если
**все** `processUpdate` в цикле успешны. Если одно update выбрасывает,
`catch` прерывает цикл, `onCycleSuccess` пропускается, marker не ack-ается.
Следующий цикл `pollUpdates` возвращает тот же batch → бесконечный цикл на
одном «ядовитом» сообщении без DLQ/skip. Блокируется весь стрим входящих
сообщений MAX, пока poison-message не исчезнет (что не произойдёт — MAX
переотдаёт по marker).

### BUG C: некоординированный graceful shutdown

`createLiveServiceShutdownHandlers` на SIGTERM/SIGINT вызывает только
`liveService.stop()` (останавливает long-polling loop). Queue worker, SQLite
connection и ingress HTTP server создаются как локальные переменные в
`app.startIngressAndQueue`, не возвращаются наружу и не закрываются.
HTTP listen-сокет удерживает event loop → процесс висит до SIGKILL от
systemd. Комбинируется с BUG A: при каждом `systemctl restart` накапливаются
зависшие `processing`-строки.

Методы очистки существуют (`worker.stop()`, `store.close()`, `ingress.stop()`)
— их просто не подключили к signal handlers.

## Решение

Ввести единый shutdown handle и reclaim-механизм для processing-строк. Все
три фикса — связанные resilience-свойства at-least-once доставки.

### Reclaim stale processing-строк (BUG A)

- Миграция SQLite: `ALTER TABLE delivery_queue ADD COLUMN processing_since INTEGER`.
- `dequeue` и `updateStatusProcessing` выставляют `processing_since = now`.
- `reclaimStale(now)` возвращает строки с `processing_since <= now - ttl`
  в `pending` **без инкремента `attempts`** — reclaim трактуется как
  crash-recovery (at-least-once), а не failed-delivery.
- `dequeue` перед `selectPending` вызывает `reclaimStale`.
- `NULL processing_since` трактуется как stale — покрывает строки от кода
  до миграции (они гарантированно stalled, т.к. текущий код всегда ставит
  `processing_since`).
- `nackPending` сбрасывает `processing_since` в NULL.
- Конфиг: `QUEUE_PROCESSING_TTL_SECONDS` (default `300`, range `30–3600`).
  Покрывает типичный `send` + MAX API timeout (90с по умолчанию в
  `live-service.js`) с запасом.

### Per-update try/catch в long-polling (BUG B)

Переписать цикл `tick()`:

```js
let firstError = null;
for (const update of updates) {
  try {
    const result = await processUpdate(update);
    // ... success path
  } catch (error) {
    if (!firstError) firstError = error;
    logger.error('long polling update failed', { error, ... });
    // НЕ прерываем цикл
  }
}
if (onCycleSuccess) onCycleSuccess(state);   // ack ВСЕГДА
if (firstError) throw firstError;            // loop() логирует recovery
```

Эффект: одно сбойное входящее сообщение MAX теряется (логируется), но
остальные 9 из 10 доставляются, marker прогрессирует, poison-loop невозможен.

### Coordinated graceful shutdown (BUG C)

- `startIngressAndQueue` возвращает shutdown handle `{ stop }`.
- Handle вызывает stop() в порядке **worker → ingress → queue-store**
  (обратный порядку регистрации): сначала останавливаем polling, затем
  HTTP listen, затем освобождаем БД.
- Ошибки на каждом шаге логируются, но не прерывают остальные shutdown-шаги.
- `liveService.stop()` стал `async` и вызывает `shutdownHandle.stop()`.
- `createLiveServiceShutdownHandlers`: `await liveService.stop()` → `exitFn(0)`.
  `process.exit(0)` нужен, чтобы закрыть HTTP listen-сокет ingress, который
  иначе удерживает event loop. `exitFn` инжектируется для тестируемости
  (default: `process.exit`).

## Почему reclaim без инкремента attempts

- At-least-once (ADR-0028) уже допускает дубли — нивелируются через
  `idempotency_key`.
- Crash-recovery ≠ failed-delivery: increment превратило бы transient crash
  в permanent failure после 5 restarts, нарушая durability гарантию.
- Возврат в `pending` сохраняет оригинальный `next_retry_at = 0` → сообщение
  уходит немедленно при следующем dequeue.

## Почему TTL 300 секунд

- MAX API timeout по умолчанию — 90с (`DEFAULT_HTTP_TIMEOUT_MS` в
  `live-service.js`).
- Один send-цикл: rate-limiter wait (до 5с) + HTTP request (до 90с) +
  обработка ответа ≈ ≤ 100с.
- 300с = 3× запас; строка младше 300с гарантированно ещё в in-flight send.
- Слишком короткий TTL (напр. 60с) рискнул бы вернуть в pending реально
  обрабатываемую строку → лишние дубли.

## Рассмотренные альтернативы

### In-place atomic dequeue (`UPDATE ... RETURNING`)

Минус: одна атомарная операция `UPDATE delivery_queue SET status='processing'
WHERE id IN (SELECT id FROM ... WHERE status='pending' ...) RETURNING *`
устраняет race даже при горизонтальном масштабировании. НО ADR-0028 и
ADR-0009 явно фиксируют **single-process** дизайн (`busy`-guard в worker
достаточен), горизонтальное масштабирование отклонено. Сложность без
benefit для declared scope. Отклонено.

### Per-update retry counter в long-polling

Track per-update failures в state, после N падений того же update — skip.
Минус: требует идентификации update (`message_id`) и персистентного
счётчика между циклами. Для MVP overkill — простое skip+log достаточно,
т.к. repeat-at-failure-rate в MAX long-polling наблюдается оператором через
логи. Отклонено (может быть revisited при реальных poison-message случаях).

### Двухфазный graceful shutdown с дожиданием in-flight send

Минус: in-flight send в MAX API может длиться до 90с + 5с rate-limiter.
systemd `TimeoutStopSec` по умолчанию 90с → kill -9 всё равно. Abort
in-flight send приемлем: at-least-once + reclaim processing-строк (BUG A)
гарантирует повторную доставку при следующем старте. Отклонено.

### Внешний reaper-процесс / cron

Минус: ADR-0009 фиксирует «один runtime, меньше операционных сущностей».
In-process reclaim в `dequeue` (вызывается каждые `QUEUE_INTERVAL_MS` ≈ 5с)
полностью покрывает recovery без новой сущности. Отклонено.

## Последствия

- Миграция SQLite: `ALTER TABLE delivery_queue ADD COLUMN processing_since INTEGER`.
- `queue/store.js`: `reclaimStale`, обновлённые `dequeue`/`updateStatusProcessing`/`nackPending`.
- `runtime/long-polling.js`: per-update try/catch в `tick()`.
- `app.js`: `startIngressAndQueue` возвращает shutdown handle; передаёт его в live-service.
- `runtime/live-service.js`: `liveService.stop()` async + `shutdownHandle`;
  `createLiveServiceShutdownHandlers` с `exitFn`.
- `core/config.js`: `QUEUE_PROCESSING_TTL_SECONDS`.
- Новых внешних зависимостей нет (ADR-0015 соблюдён).
- Обратная совместимость: reclaim корректно обрабатывает строки до миграции
  (NULL `processing_since`); дефолт TTL 300с не меняет поведение в normal operation.

## Тесты

- `tests/bot-platform/queue-store.test.js`: 4 новых теста reclaim-семантики
  (stale → pending без инкремента attempts; TTL-bounds; NULL handling;
  dequeue ordering).
- `tests/bot-platform/long-polling-runtime.test.js`: новый тест на
  poison-loop prevention (сбойное update skip, остальные обработаны,
  `onCycleSuccess` вызван).
- `tests/bot-platform/live-service.test.js`: обновлён тест, кодировавший
  старое багованное поведение («marker НЕ ack при failure»).
- `tests/bot-platform/app-shutdown.test.js` (новый): 6 тестов на shutdown
  handle contract, порядок остановки, устойчивость к ошибкам, signal handler
  + exitFn, инъекция shutdownHandle.

Всего: 353 теста passing (было 340 до ветки).
