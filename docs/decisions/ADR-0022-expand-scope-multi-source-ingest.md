# ADR-0022: Расширить scope проекта под multi-source ingest + журналы

## Статус

Принято.

## Дата

2026-07-17

## Контекст

`docs/project-context.md` фиксирует жёсткую границу проекта:

> Не входит без отдельного ADR:
> - промышленный bot-service;
> - очередь сообщений;
> - база данных;
> - журнал доставки;
> - автоматическая повторная отправка;
> - маршрутизация уведомлений вне Zabbix;
> - обработка инцидентов из МАХ;
> - управление событиями Zabbix из мессенджера;
> - автоматическое реагирование.

Идея multi-source ingest (`docs/ideas/multi-source-ingest.md`, ревизия 3) требует:

- HTTP-ingress для входящих запросов от внешних источников;
- журнал доставки (delivery-log) через SQLite;
- connection-log и audit-trail в syslog;
- деprecation прямого пути `max-webhook.js → MAX Bot API`.

Это не SIEM, не очередь сообщений и не управление событиями — бот остаётся thin transport. Но расширяет границу проекта за пределы «Zabbix → МАХ доставка + identity bot».

## Решение

Расширить границу проекта на:

1. **Multi-source HTTP-ingress** — `POST /ingest` в bot-platform, принятие уведомлений от произвольных внешних источников (Zabbix, SIEM, корпоративные боты) с аутентификацией через Okta JWT.

2. **delivery-log** — неизменяемый журнал исходящих событий и результатов доставки в SQLite (`better-sqlite3`) за абстракцией `LogStore`. Схема и индексы — отдельный ADR.

3. **connection-log** — каждая попытка входящего запроса однострочным текстом в syslog (source, IP, timestamp, auth-result, kid/iss, JWT-claims-кратко).

4. **audit-trail** — неизменяемый журнал ключевых операций (загрузка JWKS / ротация ключей, startup/shutdown, отказы auth, изменения конфигурации source-mapping) однострочным текстом в syslog.

5. **Deprecation прямого пути** — текущий `max-webhook.js → MAX Bot API` помечается deprecated; физическое удаление — после live-evidence нового ingest-пути (по образцу ADR-0010).

### Что остаётся за границей проекта (без изменений)

- Очередь сообщений;
- автоматическая повторная отправка (retry beyond outbound-client);
- маршрутизация «на боте» (каналы и подписки) — контракт принимает `channel`, runtime отвечает `501 NOT_IMPLEMENTED`;
- дедупликация, агрегация, приоритизация уведомлений;
- управление событиями Zabbix / SIEM из мессенджера;
- автоматическое реагирование, AI-аналитика.

Эти пункты остаются табу без отдельного ADR (AGENTS.md:13).

### Связь с ADR-0010

Новый ingest-путь должен быть доказан на live-окружении **до** фактического удаления direct-пути из `max-webhook.js`. Между доказательством и удалением — controlled deprecation period. Порядок deprecation-окна определяется при декомпозиции в `tasks/sprints/`.

## Почему расширение границы, а не отдельный сервис

- ADR-0009 фиксирует: «один runtime, loop в существующем entrypoint».
- Multi-source ingress запускается как второй pipeline в одном процессе `app.js`.
- Отдельный сервис под alert-ingest = дублирование lifecycle management, лишняя операционная сущность.

## Почему не откатывать ADR-0015 (zero-dep)

ADR-0015 остаётся в силе для core bot-platform. Multi-source ingest добавляет **точечные** исключения (ADR-0023, ADR-0024, ADR-0025), каждое из которых:

- ограничено конкретным слоем (ingress, auth, storage);
- не распространяется на остальной код;
- требует явного ADR-обоснования.

Такой подход сохраняет benefits zero-dep (supply-chain, простота аудита) для 95% кодовой базы.

## Последствия

- `docs/project-context.md` обновляется: граница проекта расширяется на multi-source ingress + журналы;
- `docs/project-acceptance.md` не меняется — критерии завершения проекта остаются на текущем этапе; multi-source ingest — отдельный этап с отдельными критериями;
- ADR-0015:40-42 теряет актуальность посылки «bot-platform не принимает входящие HTTP» — зафиксировано в ADR-0023;
- Три исключения из ADR-0015: HTTP-ingress (ADR-0023), JWT-verifier (ADR-0024), SQLite (ADR-0025);
- delivery-log, connection-log и audit-trail добавлены в проект;
- прямой путь `max-webhook.js → MAX Bot API` уходит в deprecation.

## Рассмотренные альтернативы

### Не расширять границу — оставить multi-source за пределами проекта

Минус: idea multi-source-ingest требует изменения в bot-platform (HTTP-ingress, auth, storage). Без расширения границы это невозможно легитимно реализовать.

### Расширить границу на всё сразу (SIEM, AI, retry)

Минус: нарушает табу AGENTS.md:13, скатывает проект в SIEM/очередь. Расширение точечное — только transport + journaling.

### Вынести multi-source ingest в отдельный репозиторий

Минус: дублирование runtime-модели, outbound-client, конфигурации. ADR-0009 фиксирует один runtime. Отдельный репозиторий = два сервиса для одного pipeline.
