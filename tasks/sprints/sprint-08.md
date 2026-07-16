# Sprint 8: ADR-0013 Safe Logger TDD

## Outcome

Добавить тесты для покрытия критических пробелов в архитектуре safe logger (ADR-0013): циклические ссылки, глубоко вложенные объекты, все ключи конфигурации, нестроковые примитивы, множественные секреты, debug/log методы.

## Tasks

### Task 1: Циклические ссылки (WeakSet guard)

**Status:** Closed

**Description:** Проверить, что объект с циклической ссылкой не вызывает бесконечный цикл и замаскирован как `[redacted]`.

**Acceptance criteria:**
- [x] Объект с `circular.self = circular` не вызывает stack overflow
- [x] `circular.self` заменён на `[redacted]`
- [x] `circular.nested.ref` заменён на `[redacted]`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/logger.test.js`

**Estimated scope:** XS (1 test)

### Task 2: Глубоко вложенные объекты (3+ уровней)

**Status:** Closed

**Description:** Проверить маскировку секретов в объектах глубиной 4 уровня.

**Acceptance criteria:**
- [x] `level1.level2.level3.level4.token` заменён на `[redacted]`
- [x] `level1.level2.level3.level4.safe` остался видимым

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/logger.test.js`

**Estimated scope:** XS (1 test)

### Task 3: Все CONFIG_SECRET_KEYS

**Status:** Closed

**Description:** Проверить, что все 7 ключей конфигурации (`maxBotToken`, `token`, `secret`, `password`, `authorization`, `apiKey`, `apiToken`) извлекаются и маскируются.

**Acceptance criteria:**
- [x] Каждый ключ тестируется индивидуально
- [x] Значение заменяется на `[redacted]` в message

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/logger.test.js`

**Estimated scope:** XS (1 test)

### Task 4: Нестроковые примитивы в context

**Status:** Closed

**Description:** Проверить, что `null`, `undefined`, числа, булевы проходят через context без маскировки.

**Acceptance criteria:**
- [x] `num: 42` остаётся `42`
- [x] `bool: true` остаётся `true`
- [x] `nil: null` остаётся `null`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/logger.test.js`

**Estimated scope:** XS (1 test)

### Task 5: Множественные секреты в одном сообщении

**Status:** Closed

**Description:** Проверить, что два разных секрета в одном message оба заменяются на `[redacted]`.

**Acceptance criteria:**
- [x] `alpha-secret` и `beta-secret` оба заменены

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/logger.test.js`

**Estimated scope:** XS (1 test)

### Task 6: debug и log методы

**Status:** Closed

**Description:** Проверить, что `debug()` и `log()` работают корректно.

**Acceptance criteria:**
- [x] `debug()` создаёт entry с level `debug`
- [x] `log()` создаёт entry с level `info`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/logger.test.js`

**Estimated scope:** XS (1 test)

### Task 7: Отсутствующий context

**Status:** Closed

**Description:** Проверить, что `logger.info('msg')` без context не падает.

**Acceptance criteria:**
- [x] Entry создан с `context: undefined`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/bot-platform/logger.test.js`

**Estimated scope:** XS (1 test)

## Checkpoint: After Tasks 1-7

- [x] Все 7 тестов добавлены в `tests/bot-platform/logger.test.js`
- [x] `npm test` passes (151 tests)
- [x] ADR-0013 покрыт тестами для всех критических сценариев
