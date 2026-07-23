# Sprint 24: Дизайн-система для React UI queue-monitor (ADR-0036)

**Цель:** ввести design tokens, shadcn/ui, Lucide Icons, Storybook и
AI-guidelines для `src/queue-monitor/ui/`. Компоненты рефакторятся на
shadcn/ui + tokens. Brand Book фиксирует палитру и типографику.

**ADR:** [ADR-0036](../../docs/decisions/ADR-0036-design-system-for-queue-monitor-ui.md)

**Контекст:** Sprint 21 завершён — React SPA дашборд работает
(SummaryCards, TimeseriesChart, TopTable, ErrorsTable, LoginPage,
DashboardPage). Компоненты стилизованы ad-hoc, без формализованной
системы токенов, без общих primitives. При масштабировании (новые
экраны, новые авторы) это приведёт к дублированию стилей и расхождению
визуального языка.

590 тестов passing на старте спринта. UI-тестов нет (React components
без unit-тестов — это ожидаемо для SPA с 1 оператором).

**Границы:** Решение ограничено `src/queue-monitor/ui/`. Не затрагивает
`src/bot-platform/`, `src/zabbix-media-type/`, root `package.json`.
ADR-0015 policy-test остаётся без изменений.

## Architecture Decisions

- **shadcn/ui:** copy-paste модель — компоненты живут в `src/components/ui/`.
  Нет runtime-зависимости. Кастомизируются через Tailwind + tokens.
- **Lucide Icons:** tree-shakeable SVG, ISC лицензия, совместим с shadcn/ui.
- **Design tokens:** JS-объекты + CSS-переменные. Tailwind подключает через
  `theme.extend`. Tokens — единственный источник цветов/отступов/размеров.
- **Storybook:** devDependency, не попадает в production bundle.
  `.storybook/` в `ui/`, stories в `src/stories/`.
- **Brand Book:** минималистичный (1 страница), основа для tokens.
  Цвета из логотипа (`docs/assets/zyablik-logo.png`) → primary palette.

### Что НЕ делается в этом спринте

- **Dark mode** — не требуется для 1 оператора. Tokens позволяют добавить
  позже (CSS-переменные в `:root` → `@media (prefers-color-scheme)`).
- **Visual regression testing** — Storybook test-runner добавляется при
  необходимости (отдельный ADR).
- **Figma UI Kit** — оверхед для dashboard с 4 экранами.
- **Новые компоненты** — только рефакторинг существующих + shadcn/ui primitives.

## Tasks

### Phase 1: Foundation

#### Task 1: Brand Book

**Status:** Planned

**Description:** Создать `docs/brand-book.md` — минимальный brand book
на основе текущего логотипа (`docs/assets/zyablik-logo.png`). Определить
primary palette (цвета из логотипа), typographic scale (Inter или
system-ui), tone (технический, без маркетинговых формулировок).

**Acceptance criteria:**
- [ ] `docs/brand-book.md` существует
- [ ] Содержит primary palette (3-5 цветов с hex-значениями)
- [ ] Содержит typographic scale (font family, sizes, weights)
- [ ] Содержит tone guidelines (technical, not marketing)
- [ ] Содержит usage examples (dashboard UI, docs, systemd)
- [ ] Цвета экстрагированы из логотипа или обоснованы brand-логикой

**Verification:**
- [ ] Файл читается, нет placeholder-текста
- [ ] `npm test` — без регрессий

**Dependencies:** None

**Files likely touched:**
- `docs/brand-book.md` (новый)

**Estimated scope:** XS (1 файл, docs only)

---

#### Task 2: Design Tokens

**Status:** Planned

**Description:** Создать `src/queue-monitor/ui/src/tokens/` — набор
JS-модулей с design tokens: colors, typography, spacing, radii, shadows.
Tokens экспортируются как JS-объекты и как CSS-переменные
(`:root { --color-primary: ... }`). Colors берутся из Brand Book (Task 1).

**Acceptance criteria:**
- [ ] `src/tokens/colors.js` — primary, neutral, semantic (success/warning/error) palettes
- [ ] `src/tokens/typography.js` — font sizes (xs/sm/base/lg/xl/2xl), line-heights, font-weights
- [ ] `src/tokens/spacing.js` — 4px grid (1=4px, 2=8px, ... 16=64px)
- [ ] `src/tokens/radii.js` — sm/md/lg/full
- [ ] `src/tokens/shadows.js` — sm/md/lg (elevation)
- [ ] `src/tokens/index.js` — единый экспорт всех tokens
- [ ] Каждый модуль экспортирует и JS-объект, и CSS-переменные через `injectCSSVars()`
- [ ] Primary palette совпадает с Brand Book (Task 1)
- [ ] Все значения — числа (px) или строки (hex, font-family), без Tailwind-классов

**Verification:**
- [ ] `cd src/queue-monitor/ui && node -e "import('./src/tokens/index.js').then(t => console.log(t.colors.primary[500]))"` → hex color
- [ ] `npm test` — без регрессий

**Dependencies:** Task 1 (Brand Book для colors)

**Files likely touched:**
- `src/queue-monitor/ui/src/tokens/colors.js` (новый)
- `src/queue-monitor/ui/src/tokens/typography.js` (новый)
- `src/queue-monitor/ui/src/tokens/spacing.js` (новый)
- `src/queue-monitor/ui/src/tokens/radii.js` (новый)
- `src/queue-monitor/ui/src/tokens/shadows.js` (новый)
- `src/queue-monitor/ui/src/tokens/index.js` (новый)

**Estimated scope:** S (6 файлов, ~200 строк)

---

#### Task 3: Tailwind Config — подключение tokens

**Status:** Planned

**Description:** Обновить `src/queue-monitor/ui/tailwind.config.js` —
подключить design tokens через `theme.extend`. Заменить существующий
`brand` colors на tokens.colors. Добавить typography, spacing, radii,
shadows из tokens.

**Acceptance criteria:**
- [ ] `tailwind.config.js` импортирует tokens
- [ ] `theme.extend.colors` использует tokens.colors (primary, neutral, semantic)
- [ ] `theme.extend.fontSize` использует tokens.typography.sizes
- [ ] `theme.extend.spacing` расширен tokens.spacing
- [ ] `theme.extend.borderRadius` использует tokens.radii
- [ ] `theme.extend.boxShadow` использует tokens.shadows
- [ ] Существующие Tailwind-классы в компонентах работают (backward compat)
- [ ] CSS-переменные генерируются в `:root` через `index.css`

**Verification:**
- [ ] `npm run build` в `ui/` — сборка проходит
- [ ] Tailwind генерирует классы для token-based значений
- [ ] `npm test` — без регрессий

**Dependencies:** Task 2

**Files likely touched:**
- `src/queue-monitor/ui/tailwind.config.js` (модификация)
- `src/queue-monitor/ui/src/index.css` (модификация — CSS-переменные)

**Estimated scope:** XS (2 файла)

---

### Checkpoint: Foundation

- [ ] Brand Book существует и содержит palette + typography
- [ ] Design tokens экспортируются как JS + CSS-переменные
- [ ] Tailwind build работает с tokens
- [ ] `npm test` — без регрессий
- [ ] Review перед Phase 2

---

### Phase 2: shadcn/ui + Lucide

#### Task 4: shadcn/ui init + install components

**Status:** Planned

**Description:** Инициализировать shadcn/ui в `src/queue-monitor/ui/`:
`npx shadcn@latest init --yes --defaults` (non-interactive, создаст
`components.json`, обновит tailwind.config, добавит `lib/utils.js`).
**Важно:** shadcn init может перезаписать `tailwind.config.js` —
после init нужно заново подключить tokens из Task 3 (merge вручную).
Затем добавить компоненты:
`npx shadcn@latest add button card table badge input --yes`.

**Acceptance criteria:**
- [ ] `src/queue-monitor/ui/components.json` существует (shadcn config)
- [ ] `src/queue-monitor/ui/src/lib/utils.js` существует (cn helper)
- [ ] `src/queue-monitor/ui/src/components/ui/button.jsx` существует
- [ ] `src/queue-monitor/ui/src/components/ui/card.jsx` существует
- [ ] `src/queue-monitor/ui/src/components/ui/table.jsx` существует
- [ ] `src/queue-monitor/ui/src/components/ui/badge.jsx` существует
- [ ] `src/queue-monitor/ui/src/components/ui/input.jsx` существует
- [ ] shadcn/ui компоненты кастомизированы через CSS-переменные из tokens
- [ ] `tailwind.config.js` не сломан (merge с Task 3)
- [ ] shadcn/ui `globals.css` импорты добавлены в `index.css`

**Verification:**
- [ ] `npm run build` в `ui/` — сборка проходит
- [ ] Импорт `import { Button } from './components/ui/button'` работает
- [ ] `npm test` — без регрессий

**Dependencies:** Task 3

**Files likely touched:**
- `src/queue-monitor/ui/components.json` (новый)
- `src/queue-monitor/ui/src/lib/utils.js` (новый)
- `src/queue-monitor/ui/src/components/ui/button.jsx` (новый)
- `src/queue-monitor/ui/src/components/ui/card.jsx` (новый)
- `src/queue-monitor/ui/src/components/ui/table.jsx` (новый)
- `src/queue-monitor/ui/src/components/ui/badge.jsx` (новый)
- `src/queue-monitor/ui/src/components/ui/input.jsx` (новый)
- `src/queue-monitor/ui/tailwind.config.js` (возможно, модификация)
- `src/queue-monitor/ui/src/index.css` (модификация)

**Estimated scope:** M (9+ файлов, но shadcn init/add делает большую часть)

---

#### Task 5: Lucide Icons install

**Status:** Planned

**Description:** Установить `lucide-react` в `src/queue-monitor/ui/`.
Проверить, что tree-shaking работает (build не включает неиспользуемые
иконки). Заменить любые существующие inline SVG на Lucide (если есть).

**Acceptance criteria:**
- [ ] `lucide-react` в `dependencies` в `ui/package.json`
- [ ] `npm run build` — сборка проходит
- [ ] Import `import { AlertCircle } from 'lucide-react'` работает
- [ ] Build size не увеличивается значительно (tree-shake работает)
- [ ] Нет inline SVG в компонентах (заменены на Lucide, если были)

**Verification:**
- [ ] `npm run build` в `ui/` — сборка проходит
- [ ] `npm test` — без регрессий

**Dependencies:** None (независим от Task 4)

**Files likely touched:**
- `src/queue-monitor/ui/package.json` (модификация — npm install)

**Estimated scope:** XS (1 файл, npm install)

---

### Checkpoint: Components Available

- [ ] shadcn/ui Button, Card, Table, Badge, Input доступны
- [ ] Lucide Icons доступны
- [ ] `npm run build` — сборка проходит
- [ ] CSS-переменные из tokens работают с shadcn/ui

---

### Phase 3: Component Refactor

#### Task 6: Refactor SummaryCards

**Status:** Planned

**Description:** Рефактор `SummaryCards.jsx` — заменить ad-hoc стили
на shadcn/ui `Card` + `Badge`. Использовать tokens для цветов
(success/warning/error). Убрать inline styles.

**Acceptance criteria:**
- [ ] Импортирует `Card`, `CardHeader`, `CardContent` из `./ui/card`
- [ ] Импортирует `Badge` из `./ui/badge` (для статусов)
- [ ] Цвета через Tailwind-классы на основе tokens (не hardcoded hex)
- [ ] Skeleton placeholder сохраняется (loading state)
- [ ] Визуально идентично текущему (или лучше)
- [ ] Нет inline `style={}` атрибутов

**Verification:**
- [ ] `npm run build` — сборка проходит
- [ ] Визуальная проверка: карточки выглядят как Card компоненты
- [ ] `npm test` — без регрессий

**Dependencies:** Task 4

**Files likely touched:**
- `src/queue-monitor/ui/src/components/SummaryCards.jsx` (модификация)

**Estimated scope:** S (1 файл)

---

#### Task 7: Refactor ErrorsTable + TopTable

**Status:** Planned

**Description:** Рефактор `ErrorsTable.jsx` и `TopTable.jsx` — заменить
ad-hoc HTML-таблицы на shadcn/ui `Table` (TableHeader, TableRow,
TableHead, TableBody, TableCell). Добавить `Badge` для статусов
и attempts count.

**Acceptance criteria:**
- [ ] Импортируют Table компоненты из `./ui/table`
- [ ] Импортируют Badge из `./ui/badge`
- [ ] Header/body/row/cell — shadcn/ui компоненты
- [ ] Tokens для цветов (через Tailwind классы)
- [ ] Toggle buttons в TopTable (source/recipient) — shadcn/ui Button
- [ ] Нет inline `style={}` атрибутов

**Verification:**
- [ ] `npm run build` — сборка проходит
- [ ] Визуальная проверка: таблицы выглядят как Table компоненты
- [ ] `npm test` — без регрессий

**Dependencies:** Task 4

**Files likely touched:**
- `src/queue-monitor/ui/src/components/ErrorsTable.jsx` (модификация)
- `src/queue-monitor/ui/src/components/TopTable.jsx` (модификация)

**Estimated scope:** S (2 файла)

---

#### Task 8: Refactor TimeseriesChart

**Status:** Planned

**Description:** Рефактор `TimeseriesChart.jsx` — заменить hardcoded
цвета линий на tokens. Recharts принимает цвета как JS-значения (props),
а не CSS-переменные. Импортировать tokens напрямую:
`import { colors } from '../tokens'`, использовать `colors.primary[500]`
вместо `'#0ea5e9'`.

**Acceptance criteria:**
- [ ] Импортирует colors из tokens
- [ ] Цвета линий (delivered/failed/pending/processing) берутся из tokens
- [ ] Window switcher (1h/6h/12h/24h) — shadcn/ui Button
- [ ] Tooltip/axis стили — tokens
- [ ] Нет hardcoded hex-цветов в компоненте

**Verification:**
- [ ] `npm run build` — сборка проходит
- [ ] Визуальная проверка: график использует brand-цвета
- [ ] `npm test` — без регрессий

**Dependencies:** Task 4

**Files likely touched:**
- `src/queue-monitor/ui/src/components/TimeseriesChart.jsx` (модификация)

**Estimated scope:** S (1 файл)

---

#### Task 9: Refactor LoginPage + DashboardPage

**Status:** Planned

**Description:** Рефактор `LoginPage.jsx` и `DashboardPage.jsx` —
заменить ad-hoc кнопки/link на shadcn/ui `Button`. Использовать
tokens для layout (spacing, radii). Убрать inline styles.

**Acceptance criteria:**
- [ ] LoginPage: import Button from `./ui/button`
- [ ] LoginPage: OAuth link styled as shadcn/ui Button (variant="default")
- [ ] DashboardPage: logout button — shadcn/ui Button (variant="destructive" или "outline")
- [ ] DashboardPage: refresh button — shadcn/ui Button
- [ ] Layout spacing через Tailwind classes (tokens-based)
- [ ] Нет inline `style={}` атрибутов
- [ ] App.jsx — tokens для loading/skeleton стили

**Verification:**
- [ ] `npm run build` — сборка проходит
- [ ] Визуальная проверка: кнопки — shadcn/ui стили
- [ ] `npm test` — без регрессий

**Dependencies:** Task 4

**Files likely touched:**
- `src/queue-monitor/ui/src/pages/LoginPage.jsx` (модификация)
- `src/queue-monitor/ui/src/pages/DashboardPage.jsx` (модификация)
- `src/queue-monitor/ui/src/App.jsx` (возможно, модификация)

**Estimated scope:** S (2-3 файла)

---

### Checkpoint: Refactor Complete

- [ ] Все 6 компонентов используют shadcn/ui + tokens
- [ ] Нет hardcoded hex-цветов в компонентах
- [ ] Нет inline `style={}` атрибутов
- [ ] Визуально идентично текущему (или лучше)
- [ ] `npm run build` — сборка проходит
- [ ] Review перед Phase 4

---

### Phase 4: Storybook

#### Task 10: Storybook setup

**Status:** Planned

**Description:** Установить Storybook в `src/queue-monitor/ui/`.
Storybook init интерактивный — используем ручную настройку:
1) `npm install --save-dev storybook @storybook/react-vite` в `ui/`
2) Создать `.storybook/main.js` и `.storybook/preview.js` вручную
3) Добавить scripts в `package.json`

**Acceptance criteria:**
- [ ] `src/queue-monitor/ui/.storybook/main.js` существует
- [ ] `src/queue-monitor/ui/.storybook/preview.js` существует
- [ ] `package.json` содержит scripts: `storybook`, `build-storybook`
- [ ] Storybook запускается через `npm run storybook`
- [ ] `npm run build` — production build не включает Storybook
- [ ] Storybook — devDependency (не в production bundle)

**Verification:**
- [ ] `npm run storybook` — запускается на localhost:6006
- [ ] `npm run build` — сборка проходит ( без storybook в bundle)
- [ ] `npm test` — без регрессий

**Dependencies:** Task 4

**Files likely touched:**
- `src/queue-monitor/ui/.storybook/main.js` (новый)
- `src/queue-monitor/ui/.storybook/preview.js` (новый)
- `src/queue-monitor/ui/package.json` (модификация — scripts + devDeps)

**Estimated scope:** S (3 файла)

---

#### Task 11: Stories для компонентов

**Status:** Planned

**Description:** Создать stories для shadcn/ui компонентов и
собственных компонентов dashboard: Button, Card, Table, Badge,
SummaryCards, ErrorsTable.

**Acceptance criteria:**
- [ ] `src/stories/Button.stories.jsx` — variants (default, destructive, outline, ghost)
- [ ] `src/stories/Card.stories.jsx` — basic card, card with header
- [ ] `src/stories/Table.stories.jsx` — basic table, with data
- [ ] `src/stories/Badge.stories.jsx` — variants (default, secondary, destructive, outline)
- [ ] `src/stories/SummaryCards.stories.jsx` — with data, loading state
- [ ] `src/stories/ErrorsTable.stories.jsx` — with data, empty state
- [ ] Каждая story демонстрирует компонент в isolation

**Verification:**
- [ ] `npm run storybook` — все stories отображаются
- [ ] `npm run build` — сборка проходит
- [ ] `npm test` — без регрессий

**Dependencies:** Task 10

**Files likely touched:**
- `src/queue-monitor/ui/src/stories/Button.stories.jsx` (новый)
- `src/queue-monitor/ui/src/stories/Card.stories.jsx` (новый)
- `src/queue-monitor/ui/src/stories/Table.stories.jsx` (новый)
- `src/queue-monitor/ui/src/stories/Badge.stories.jsx` (новый)
- `src/queue-monitor/ui/src/stories/SummaryCards.stories.jsx` (новый)
- `src/queue-monitor/ui/src/stories/ErrorsTable.stories.jsx` (новый)

**Estimated scope:** M (6 файлов)

---

### Phase 5: Documentation

#### Task 12: AI-guidelines

**Status:** Planned

**Description:** Создать `docs/ui-guidelines.md` — руководство для AI
и людей по использованию дизайн-системы. Описать: какие компоненты
использовать для типичных паттернов (карточки метрик, таблицы ошибок,
графики), какие паттерны запрещены (inline styles, hardcoded colors),
примеры генерации нового экрана из существующих компонентов.

**Acceptance criteria:**
- [ ] `docs/ui-guidelines.md` существует
- [ ] Содержит: approved components (shadcn/ui + Lucide)
- [ ] Содержит: forbidden patterns (inline styles, hardcoded hex)
- [ ] Содержит: typical patterns (metric cards, data tables, charts)
- [ ] Содержит: example — how to create a new dashboard panel
- [ ] Содержит: link to Brand Book и Storybook

**Verification:**
- [ ] Файл читается, нет placeholder-текста
- [ ] `npm test` — без регрессий

**Dependencies:** Tasks 1-9 (все компоненты должны быть рефакторнуты)

**Files likely touched:**
- `docs/ui-guidelines.md` (новый)

**Estimated scope:** XS (1 файл, docs only)

---

## Checkpoint: Sprint 24 Complete

- [ ] `npm test` — все тесты проходят (без регрессий)
- [ ] `npm run build` в `ui/` — сборка проходит
- [ ] `npm run storybook` — запускается, stories отображаются
- [ ] Все компоненты используют shadcn/ui + tokens
- [ ] Brand Book + AI-guidelines существуют
- [ ] Нет hardcoded hex-цветов в компонентах
- [ ] Нет inline `style={}` атрибутов
- [ ] `docs/decisions/README.md` содержит ADR-0036

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| shadcn/ui init меняет tailwind.config.js | Medium | Backup текущего конфига перед init. Merge tokens после init |
| Storybook добавляет ~200MB в node_modules | Low | devDependency в отдельном ui/package.json; не в production |
| Refactor ломает визуал | Medium | Пошаговый refactor с визуальной проверкой. Каждый компонент — отдельный task |
| shadcn/ui CSS-переменные конфликтуют с tokens | Medium | shadcn/ui использует CSS-переменные в `globals.css`; tokens инжектируются в `:root`. Merge вручную |
| Recharts не принимает CSS-переменные напрямую | Low | Recharts цвета — JS-значения, импортируем tokens напрямую |

## Open Questions

- Нужен ли dark mode в будущем? (Tokens готовы, но implementation отдельный ADR)
- Нужен ли visual regression testing? (Storybook test-runner — отдельный ADR)
- Sprint 24 и 25 независимы — могут выполняться параллельно.

## Файлы для изменения (сводка)

```
# Phase 1: Foundation
docs/brand-book.md                                    (новый)
src/queue-monitor/ui/src/tokens/colors.js             (новый)
src/queue-monitor/ui/src/tokens/typography.js         (новый)
src/queue-monitor/ui/src/tokens/spacing.js            (новый)
src/queue-monitor/ui/src/tokens/radii.js              (новый)
src/queue-monitor/ui/src/tokens/shadows.js            (новый)
src/queue-monitor/ui/src/tokens/index.js              (новый)
src/queue-monitor/ui/tailwind.config.js               (модификация)
src/queue-monitor/ui/src/index.css                    (модификация)

# Phase 2: shadcn/ui + Lucide
src/queue-monitor/ui/components.json                  (новый)
src/queue-monitor/ui/src/lib/utils.js                 (новый)
src/queue-monitor/ui/src/components/ui/button.jsx     (новый)
src/queue-monitor/ui/src/components/ui/card.jsx       (новый)
src/queue-monitor/ui/src/components/ui/table.jsx      (новый)
src/queue-monitor/ui/src/components/ui/badge.jsx      (новый)
src/queue-monitor/ui/src/components/ui/input.jsx      (новый)
src/queue-monitor/ui/package.json                     (модификация)

# Phase 3: Component Refactor
src/queue-monitor/ui/src/components/SummaryCards.jsx  (модификация)
src/queue-monitor/ui/src/components/ErrorsTable.jsx   (модификация)
src/queue-monitor/ui/src/components/TopTable.jsx      (модификация)
src/queue-monitor/ui/src/components/TimeseriesChart.jsx (модификация)
src/queue-monitor/ui/src/pages/LoginPage.jsx          (модификация)
src/queue-monitor/ui/src/pages/DashboardPage.jsx      (модификация)
src/queue-monitor/ui/src/App.jsx                      (модификация)

# Phase 4: Storybook
src/queue-monitor/ui/.storybook/main.js               (новый)
src/queue-monitor/ui/.storybook/preview.js            (новый)
src/queue-monitor/ui/src/stories/Button.stories.jsx   (новый)
src/queue-monitor/ui/src/stories/Card.stories.jsx     (новый)
src/queue-monitor/ui/src/stories/Table.stories.jsx    (новый)
src/queue-monitor/ui/src/stories/Badge.stories.jsx    (новый)
src/queue-monitor/ui/src/stories/SummaryCards.stories.jsx (новый)
src/queue-monitor/ui/src/stories/ErrorsTable.stories.jsx  (новый)

# Phase 5: Documentation
docs/ui-guidelines.md                                 (новый)
```

## Parallelization

Внутри Phase 1: Tasks 1-2 последовательны (Brand Book → Tokens),
Task 3 зависит от Task 2.

Phase 2: Task 5 (Lucide) независим от Task 4 (shadcn/ui) —
могут выполняться параллельно.

Phase 3: Tasks 6-9 независимы друг от друга (разные компоненты) —
могут выполняться параллельно. Все зависят от Task 4.

Phase 4: Task 11 зависит от Task 10.

Phase 5: Task 12 зависит от Tasks 1-11.
