# ADR-0015: Использовать нулевые внешние зависимости для bot-platform

## Статус

Принято.

## Дата

2026-07-15

## Контекст

Bot-platform — компонент, который:

- Работает в продакшене с доступом к токенам бота и API
- Разворачивается в минимальном окружении (systemd, LXC)
- Должен|minimis|upply-chain|risks

`package.json` не содержит секции `dependencies` — только `engines: { node: ">=20" }`.

## Решение

Все функции bot-platform используют только Node.js stdlib:

- HTTP-запросы: встроенный `fetch()` через child_process (ADR-0014)
- Файловые операции: `node:fs`, `node:path`
- Плагины: convention-based loader без fs.watch (ADR-0012)
- Логирование: собственный `createSafeLogger()` (ADR-0013)
- Тесты: встроенный `node:test`, `node:assert`

## Почему не axios/node-fetch/got

- Каждый npm-пакет добавляет transitive dependencies
- Supply-chain атаки (typosquatting, maintainer compromise)
- Лишний шаг установки в production (npm install)
- Встроенный `fetch()` в Node.js >=20 полностью покрывает потребности

## Почему не express/fastify/koa

- Bot-platform не принимает входящие HTTP (long-polling — исходящие)
- Zabbix webhook обрабатывается отдельным скриптом (`src/zabbix-media-type/`)
- HTTP-фреймворк = лишние зависимости и attack surface

> **Обновлено (ADR-0023):** Bot-platform теперь принимает входящие HTTP через `http.createServer` (stdlib) — ADR-0023. Данная формулировка устарела для ingress-пути; stdlib-only сервер принят как исключение. Express/fastify/koa по-прежнему отклонены.

## Почему не dotenv

- Конфигурация через `process.env` + `createLiveRuntimeConfig()`
- `.env` файлы не используются в продакшене (systemd Environment=)
- `dotenv` добавляет зависимость для тривиальной функции

## Почему не ts-node/typescript

- Node.js >=20 поддерживает нативный ESM и modern features
- TypeScript добавляет build step и зависимости
- Проект использует CommonJS с `'use strict'` — простой и проверенный подход

## Последствия

- `npm install` не устанавливает ничего (только engines check)
- Нет node_modules для аудита уязвимостей
- Добавление новой зависимости требует обоснования и potentially ADR
- Fetch-скрипт — инлайн строка в `buildFetchChildScript()` (ADR-0014)

## Рассмотренные альтернативы

### Минимальные зависимости (1-2 пакета)

Минус: difficult определить границу. Каждая "безобидная" зависимость ведёт к следующей.

### Peer dependencies

Минус: не решает проблему supply-chain, добавляет complexity.

### Bundling (esbuild/rollup)

Минус: добавляет dev-зависимости и build step. CommonJS модули не требуют bundling.

## Исключения из ADR-0015

Ниже перечислены принятые исключения из политики нулевых зависимостей:

| Исключение | ADR | Граница |
|---|---|---|
| `http.createServer` (stdlib) — ingress-сервер | ADR-0023 | Входящие HTTP, stdlib only |
| `@okta/jwt-verifier` — JWT-проверка | ADR-0024 | Auth-слой `JwtSourceAuth` |
| `better-sqlite3` — delivery-log | ADR-0025 | Слой `LogStore` |

Каждое исключение:

- ограничено конкретным слоем (ingress, auth, storage);
- не распространяется на остальную кодовую базу;
- требует явного ADR-обоснования.
