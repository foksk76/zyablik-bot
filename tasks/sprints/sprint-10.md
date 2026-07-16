# Sprint 10: ADR-0015 Zero Dependencies Policy Test

## Outcome

Добавить policy-тесты, автоматически проверяющие что `package.json` не содержит runtime или dev зависимостей (ADR-0015).

## Tasks

### Task 1: Policy test — нет runtime dependencies

**Status:** Closed

**Description:** Прочитать `package.json`, проверить что `dependencies` отсутствует или пуст.

**Acceptance criteria:**
- [x] `pkg.dependencies === undefined || Object.keys(pkg.dependencies).length === 0`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/repo-structure.test.js`

**Estimated scope:** XS (1 test)

### Task 2: Policy test — нет devDependencies

**Status:** Closed

**Description:** Проверить отсутствие `devDependencies`.

**Acceptance criteria:**
- [x] `pkg.devDependencies === undefined || Object.keys(pkg.devDependencies).length === 0`

**Verification:**
- [x] `npm test` passes

**Dependencies:** None

**Files likely touched:**
- `tests/repo-structure.test.js`

**Estimated scope:** XS (1 test)

## Checkpoint: After Tasks 1-2

- [x] 2 policy-теста добавлены в `tests/repo-structure.test.js`
- [x] `npm test` passes (151 tests)
- [x] ADR-0015 автоматически проверяется при каждом `npm test`
