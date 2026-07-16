# Sprint 9: ADR-0014 Async HTTP Error Paths TDD

## Outcome

Добавить тесты для покрытия всех error paths в async HTTP через child_process.spawn (ADR-0014): stderr JSON парсинг, пустой stdout, невалидный JSON, spawn error,happy path.

## Tasks

### Task 1: stderr JSON парсинг

**Status:** Closed

**Description:** Проверить, что `runFetchRequest` парсит JSON из stderr при ненулевом коде выхода и извлекает `cause.code`, `cause.message`, `cause.hostname`.

**Acceptance criteria:**
- [x] Ошибка содержит `message: 'synthetic fetch error'`
- [x] `cause.code === 'ECONNREFUSED'`
- [x] `cause.hostname === 'synthetic.host'`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/live-runtime-async-http.test.js`

**Estimated scope:** XS (1 test)

### Task 2: Пустой stderr

**Status:** Closed

**Description:** Проверить generic ошибку при пустом stderr.

**Acceptance criteria:**
- [x] `error.message === 'Live HTTP request failed'`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/live-runtime-async-http.test.js`

**Estimated scope:** XS (1 test)

### Task 3: Невалидный JSON в stderr

**Status:** Closed

**Description:** Проверить, что сырой текст stderr становится сообщением ошибки.

**Acceptance criteria:**
- [x] `error.message === 'not-json-at-all'`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/live-runtime-async-http.test.js`

**Estimated scope:** XS (1 test)

### Task 4: Пустой stdout при успешном выходе

**Status:** Closed

**Description:** Проверить rejection при пустом stdout.

**Acceptance criteria:**
- [x] `error.message === 'Live HTTP request returned an empty response'`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/live-runtime-async-http.test.js`

**Estimated scope:** XS (1 test)

### Task 5: Невалидный JSON в stdout

**Status:** Closed

**Description:** Проверить rejection при невалидном JSON в stdout.

**Acceptance criteria:**
- [x] `error.message === 'Live HTTP request returned invalid JSON'`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/live-runtime-async-http.test.js`

**Estimated scope:** XS (1 test)

### Task 6: Happy path

**Status:** Closed

**Description:** Проверить успешный fetch — child записывает JSON в stdout, parent резолвит parsed object.

**Acceptance criteria:**
- [x] `result.statusCode === 200`
- [x] `result.body` === `{ ok: true }`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/live-runtime-async-http.test.js`

**Estimated scope:** XS (1 test)

## Checkpoint: After Tasks 1-6

- [x] Все 6 тестов добавлены в `tests/bot-platform/live-runtime-async-http.test.js`
- [x] `npm test` passes (151 tests)
- [x] ADR-0014 покрыт тестами для всех error paths
