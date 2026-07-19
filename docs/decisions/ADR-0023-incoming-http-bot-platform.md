# ADR-0023: Принять входящие HTTP-запросы в bot-platform (изменение посылки ADR-0015)

## Статус

Принято.

## Дата

2026-07-17

## Контекст

ADR-0015:40-42 устанавливает:

> Bot-platform не принимает входящие HTTP (long-polling — исходящие)

Это было справедливо для MVP identity-bot: транспорт — long-polling к MAX Bot API, Zabbix webhook обрабатывается отдельным скриптом.

Multi-source ingest (ADR-0022) требует HTTP-ingress для принятия входящих запросов от внешних источников. `http.createServer` из Node stdlib — единственный сервер; внешние зависимости не добавляются.

## Решение

Принять `http.createServer` (Node stdlib) как ingress-сервер в `src/bot-platform/`. Маршрут `POST /ingest`.

### Архитектурное изменение

ADR-0015:40-42 «Bot-platform не принимает входящие HTTP» теряет актуальность. Bot-platform теперь принимает:

- **Исходящие HTTP** (long-polling к MAX Bot API, fetch-скрипт через child_process — ADR-0014);
- **Входящие HTTP** (`POST /ingest` — новый pipeline).

### Связь с ADR-0009

ADR-0009 фиксирует «один runtime, loop в существующем entrypoint». Входящий HTTP-сервер запускается как **второй pipeline** в одном процессе `app.js`:

1. Pipeline 1: long-polling к MAX Bot API (identity/commands) — ADR-0009/0011, без изменений.
2. Pipeline 2: HTTP-ingress (`POST /ingest`) — новый.

Один процесс, два pipeline. Новых systemd-unit'ов нет.

### Ограничение

Ingress-сервер использует **только stdlib** (`http.createServer`). HTTP-фреймворки (express, fastify, koa) не добавляются — это отдельный ADR при необходимости.

### Пререквизиты (must-be-true из идеи)

- Ingress-среда предоставлена (внутренний DNS, порт, TLS-терминирование — ADR-0022);
- Узел ingress может исходяще обращаться к MAX Bot API и Okta JWKS/token-endpoint.

## Почему stdlib, а не express/fastify

- ADR-0015 остаётся в силе для остальной кодовой базы;
- `http.createServer` — встроенный, не добавляет dependencies;
- ingress — один маршрут (`POST /ingest`), фреймворк избыточен;
- если маршрутов станет больше — пересмотреть через ADR.

## Почему не отдельный процесс под ingress

- ADR-0009 фиксирует один runtime;
- отдельный процесс = два systemd-unit, дублирование конфигурации, сложнее тестировать;
- ingress и long-polling разделяют outbound-client и конфигурацию — логично в одном процессе.

## Последствия

- ADR-0015:40-42 помечается как устаревшее (см. ADR-0023);
- `app.js` получает второй pipeline (HTTP-ingress);
- тесты покрывают ingress-маршрут через `http.createServer` (без реальной сети — mock);
- ingress-сервер слушает на отдельном порту (конфигурируется через env).

## Рассмотренные альтернативы

### Оставить ADR-0015:40-42 без изменений

Минус: формулировка «не принимает входящие HTTP» ложно описывает систему после ввода ingress. Нужна честная фиксация.

### Express/fastify для ingress

Минус: добавляет npm-зависимость. Для одного маршрута `POST /ingest` — избыточно. ADR-0015 остаётся в силе.

### Ingress как sidecar-контейнер

Минус: два процесса, IPC, дублирование логики нормализации. Нарушение ADR-0009.
