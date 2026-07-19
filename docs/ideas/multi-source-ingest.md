# Multi-source ingest: приём уведомлений от нескольких источников

> Идея. Не ADR, не спецификация, не задача. Отправная точка для будущих ADR и
> декомпозиции в `tasks/sprints/`. Создана через навык `idea-refine`.
>
> **Ревизия 2** — auth-слой переработан: вместо статичного per-source токена
> принят JWT-verifier через корпоративный Okta IdP. См. раздел «Изменения
> ревизии 2» в конце.
>
> **Ревизия 3** — прямой путь `max-webhook.js → MAX` объявляется deprecated
> (не fallback), client_secret источника хранится в env Media type. См.
> раздел «Изменения ревизии 3» в конце.
>
> **Ревизия 4** — принято ADR-0028: очередь доставки сообщений (delivery queue)
> в SQLite для at-least-once guarantee. Очередь — transport-level guarantee
> для всех источников, входит в MVP.

## Problem Statement

Как нам позволить bot-platform принимать уведомления от нескольких внешних
источников (Zabbix, SIEM, другие корпоративные боты) и доставлять их
пользователям/группам в МАХ, не превратив проект в SIEM/очередь сообщений?

Сегодня `src/zabbix-media-type/max-webhook.js` жёстко привязан к одному
токену и одному получателю, шлёт напрямую в MAX Bot API. Добавление второго
источника означает копию скрипта. Нет multi-source, нет аудита доставки, нет
журнала подключений, нет аутентификации входящих запросов (их и принимать
некому — HTTP-сервера в bot-platform нет).

Аутентификация источников строится на **корпоративном Okta IdP (OIDC)** и
**JWT-verifier** как основном и единственном механизме проверки входящих
запросов в MVP. Это сознательный выбор в пользу централизованного
identity-management вместо per-source shared-secret.

## Recommended Direction

**Один runtime с двумя pipeline + thin multi-source HTTP-ingress с
контрактом canonical event, аутентификацией источников через Okta JWT.**

`src/bot-platform/app.js` запускает два независимых pipeline в одном
процессе:

1. **Существующий** — long-polling к MAX Bot API (identity/commands),
   наследует ADR-0009/0011 без изменений.
2. **Новый** — HTTP-сервер ingress (`POST /ingest`), который принимает
   запросы от внешних источников, верифицирует JWT от каждого источника
   через Okta JWKS, нормализует payload в canonical event и форвардит
   в существующий outbound-client (`POST /messages` к MAX).

Маршрутизация — **на стороне источника** (MVP). Источник сам определяет
получателя (`recipient: { kind, value }`) и кладёт его в payload. Бот —
thin transport, повторяет модель текущего Zabbix Media type, но для
произвольного числа источников.

Контракт inbound-API **сразу проектируется под оба режима маршрутизации**,
чтобы завтра добавить режим «на боте» без переделки API:
`POST /ingest` принимает тело, где `recipient` — обязательное поле (MVP),
а `channel` — optional. Если присутствует `channel` и нет `recipient` —
runtime отвечает `501 NOT_IMPLEMENTED`, без silent-fallback (по образцу
ADR-0011 webhook-stub). Это оставляет задел под будущий механизм
каналов/подписок без изменения контракта.

Первый подключённый источник — **Zabbix**. Для него корректируется
`src/zabbix-media-type/max-webhook.js`: меняется URL и body на endpoint
bot-platform, добавляется `Authorization: Bearer <jwt>` в заголовок.
Zabbix остаётся примером и образцом нормализатора для последующих
источников (SIEM, корпоративные боты).

**Почему это направление, а не альтернативы:**

- Не APISIX/Kong перед ботом — каннибализация: тяжёлый шлюз ради 2-3
  источников в доверенной корпоративной сети.
- Не polling от источников — Zabbix не имеет polling-API, значит для MVP
  ingress обязателен.
- Не отдельный сервис под alert-ingest — один runtime по ADR-0009
  («loop в существующем entrypoint»), меньше операционных сущностей.

**Почему JWT-verifier (Okta), а не статичный per-source токен:**

- Корпоративный Okta планируется как единый identity-management для всех
  интеграционных точек. Использовать его для auth источников —
  последовательное решение, не плодить второй trust-anchor.
- JWT даёт централизованное отзыв токенов (revocation / истечение TTL),
  аудит выдачи на стороне IdP, стандартизированные claims (`iss`, `aud`,
  `exp`, `kid`) — всё этого нет у shared-secret.
- Цена (приемлемая по решению проекта): IdP-зависимость в runtime и
  усложнение source-side интеграции (Zabbix требует OAuth client-credentials
  flow перед каждым alert). См. «Ключевые допущения» — это сознательный
  trade-off, не дефект.

## Ключевые допущения

**Must be true (убийцы направления):**

- [ ] **Ingress-среда будет предоставлена.** Текущий LXC — outbound-only
  (серый IP за NAT, без входящих, без DNS, без публичного порта; ADR-0007,
  ADR-0011). Для всего ingress-пути нужна новая среда: внутренний DNS,
  порт, TLS-терминирование. Зафиксировать как prerequisite в будущем ADR.
  Проверка: согласовать сетевой сегмент до начала реализации.
- [ ] **Okta IdP развёрнут и доступен из bot-platform runtime.** Без IdP
  JWT-verifier не работает — бот не сможет аутентифицировать источники и
  перестанет доставлять уведомления. Это **принятое** допущение: IdP
  считается высокодоступным корпоративным сервисом, его недоступность
  приравнивается к недоступности сети. Проверка: okta-tenancy развёрнута,
  JWKS-endpoint (`/.well-known/jwks.json`) достижим из runtime-сегмента.
- [ ] **Каждый источник способен получать JWT из Okta.** Это нетривиально
  для Zabbix Media type: требуется OAuth client-credentials flow
  (client_id + client_secret, исходящий вызов к Okta token-endpoint,
  обработка TTL/refresh) внутри `max-webhook.js` или перед ним. SIEM и
  корпоративные боты — валидировать по конкретному источнику. Проверка:
  для каждого нового источника — подтверждение OIDC-способности до
  написания нормализатора.
- [ ] **Узел ingress может исходяще обращаться и к MAX Bot API, и к Okta
  JWKS/token-endpoint.** Иначе бот не доставит и не аутентифицирует.
  Проверка: сетевая проверка обоих endpoint'ов из целевого сегмента.

**Should be true (важные, но не убийцы):**

- [ ] Okta-tenancy поддерживает client-credentials flow для M2M
  (machine-to-machine) интеграций — стандартно, но проверить на конкретной
  конфигурации тенанта.
- [ ] Окно TTL токенов источников согласовано с частотой alertов: слишком
  короткий TTL → частые запросы к Okta; слишком длинный → слабее security.
- [ ] Объём delivery-log потянет SQLite на одной ноде без деградации
  (тысячи записей/день — нормально; миллионы — нет, но это нецелевой кейс).

**Might be true (не валидировать до MVP):**

- [ ] Потребуется TTL/очистка старых delivery-записей — добавить позже.
- [ ] Источники захотят ack-семантику (подтверждение доставки) — сейчас
  явно Not Doing.
- [ ] Понадобится персистентный кэш JWKS на диск для смягчения длительной
  недоступности Okta — сейчас in-memory cache достаточно (см. MVP Scope).

## MVP Scope

**Входит:**

1. **HTTP-ingress-сервер** в `src/bot-platform/` — `http.createServer`
   (внешняя зависимость только на HTTP-server — встроен в Node stdlib),
   маршрут `POST /ingest`.
2. **`JwtSourceAuth` middleware** — едиственный механизм auth в MVP.
   Верифицирует `Authorization: Bearer <jwt>` от каждого источника через
   Okta JWKS, проверяет стандартные claims (`iss`, `aud`, `exp`, `kid`),
   fail-closed. Интерфейс `SourceAuth` спроектирован расширяемым
   (per-source mapping `kid → source` для определения нормализатора).
   Библиотека: `@okta/jwt-verifier` (см. раздел «Исключения из ADR-0015»).
3. **JWKS in-memory cache** — после первого fetch ключи кэшируются в памяти
   процесса, keyed by `kid`. При ротации ключей — lazy-refresh при
   неизвестном `kid`. Не персистится на диск (см. Not Doing).
4. **Расширение `SOURCE_*` (ADR-0017)** — новые константы (`zabbix`,
   `siem`, `bot-*`) + per-source normalizer → canonical event
   `{ source, recipient, message, raw }`. Source определяется по
   проверенному JWT-claim (например, `aud` или кастомный claim), не по
   сетевому признаку.
5. **Контракт inbound-API** — `POST /ingest`, тело:
   `recipient: { kind: 'user'|'chat', value }` (обязательно для MVP) +
   `channel?: string` (optional, при отсутствии `recipient` → `501`).
6. **Корректировка `src/zabbix-media-type/max-webhook.js`** — URL и body
   на endpoint bot-platform, `Authorization: Bearer <jwt>` в заголовке.
   **Дополнительно:** получение JWT через Okta client-credentials flow
   (`client_id` и `client_secret` хранятся в env Media type Zabbix —
   по модели нынешнего параметра `Token`; вызов token-endpoint, кэш
   токена до истечения). Первый подключённый источник, образец
   нормализатора. Изменение поведения `max-webhook.js` должно быть
   отражено в `docs/zabbix-media-type.md` (правило AGENTS.md).
7. **Один runtime** (`app.js`) — два pipeline (long-polling MAX +
   HTTP-ingress) в одном процессе, без новых systemd-unit'ов.
8. **delivery-log** через `better-sqlite3` за абстракцией `LogStore`.
   Запись: исходящее событие + результат `POST /messages` (HTTP-код,
   latency, retries-count).
9. **connection-log** — каждая попытка входящего запроса (source,
   IP, timestamp, auth-result, `kid`/`iss`, JWT-claims-кратко)
   однострочным текстом в syslog для лёгкого автоматического разбора.
   Включая отказы верификации JWT (expired, wrong `iss`/`aud`,
   неизвестный `kid`, malformed).
10. **audit-trail** — неизменяемый журнал ключевых операций (загрузка
    JWKS / ротация ключей, startup/shutdown, отказы auth, изменения
    конфигурации source-mapping) однострочным текстом в syslog.
11. **Deprecation прямого пути** — текущий Zabbix-direct-путь
    (`max-webhook.js → MAX Bot API`, минуя bot-platform) объявляется
    **deprecated** с момента ввода нового ingest-пути. Прямой путь
    убирает security-асимметрию: не остаётся неаутентифицированного
    маршрута в MAX. По образцу ADR-0010 (live-evidence) новый путь
    должен быть доказан на live-окружении **до** фактического удаления
    direct-пути из `max-webhook.js`; между доказательством и удалением
    — controlled deprecation period. Прямой путь **не** сохраняется как
    fallback при недоступности IdP: если Okta/JWKS недоступен, бот не
    доставляет (см. must-be-true допущение 2), это сознательное решение.

**Не входит (см. Not Doing ниже).**

## Not Doing (and Why)

Явно исключено из MVP. Любое изменение этого списка = новый ADR.

- **Static shared-token auth для источников.** Убрано из MVP в ревизии 2.
  Все источники аутентифицируются только через Okta JWT. Любой не-JWT
  механизм auth (включая static-token как fallback при падении IdP)
  **не предусматривается** — это сознательное упрощение MVP,
  IdP-зависимость принята (см. допущение 2). Если в production выяснится,
  что IdP-недоступность блокирует критичные алерты — revisa через ADR.
- **Маршрутизация «на боте» (каналы и подписки).** Контракт API уже
  принимает `channel`, но runtime отвечает `501 NOT_IMPLEMENTED`.
  Причина: MVP фокусируется на работающем multi-source ingest с
  маршрутизацией на источнике; механизм каналов тянет хранилище подписок
  и UI управления — отдельный этап.
- **Дедупликация, агрегация, приоритизация уведомлений.** Жёсткая граница
  V3: бот = только транспорт `внешний источник → МАХ`. Любая
  интеллектуальная обработка — забота источника или человека. Причина:
  предохраняет проект от скатывания в SIEM/очередь (явное табу AGENTS.md
  и `docs/project-context.md:80-90`).
- **Управление событиями Zabbix / SIEM из мессенджера.** Табу без
  отдельного ADR (AGENTS.md:13).
- **Автоматическое реагирование, AI-аналитика.** Табу (AGENTS.md:13).
- **ack-семантику для источников** (подтверждение доставки обратно
  источнику). Причина: усложняет контракт, не нужно MVP.
- **External API-шлюзы перед ботом** (APISIX, Kong, Tyk, KrakenD).
  Причина: каннибализация, тяжёлый рантайм ради 2-3 источников. В отличие
  от JWT-verifier (который — библиотека, не sidecar-шлюз).
- **Generic JWT/JWKS без Okta.** Рассмотрено и отклонено: каждый источник
  управлял бы собственной парой ключей и JWKS, что размывает
  trust-anchor и усложняет source-side (управление ключами, ротация).
  Okta как единый issuer — стратегически чище при наличии IdP.
- **Polling-адаптеры к источникам.** Причина: Zabbix не имеет
  polling-API, значит для MVP они бесполезны.
- **UI управления токенами/источниками/каналами.** Причина: MVP —
  источники регистрируются в Okta, source-mapping в конфиге bot-platform,
  управление = Okta-admin + редактирование конфига + restart.
- **Персистентный кэш JWKS на диск.** Причина: на MVP in-memory cache
  достаточен; недоступность Okta приравнена к недоступности сети (см.
  допущение 2). Персистентный кэш — будущий hardening, если практика
  покажет частые длительные сбои IdP.
- **TTL/ротация delivery-log.** Причина: на тысячах записей в день
  SQLite не деградирует; добавить позже при реальной необходимости.

## Исключения из ADR-0015 (zero-dep)

Введение multi-source ingest + JWT-auth — **тройное нарушение** ADR-0015,
каждая точка требует явного ADR-исключения. Само ADR-0015:40-42 содержит
обоснование, которое стало неактуальным: «Bot-platform не принимает
входящие HTTP» — теперь принимает. Это нужно зафиксировать.

1. **HTTP-ingress-сервер.** Раньше в проекте не было входящих HTTP. Сам
   `http.createServer` — встроен в Node stdlib, зависимости не добавляет,
   но **меняет архитектурную посылку ADR-0015** (входящие HTTP появляются).
   Требует ADR, расширяющего границу и фиксирующего, что ingress-сервер
   использует только stdlib.

2. **`@okta/jwt-verifier` (или `jose`) для JWT-проверки.** Внешняя
   библиотека. Альтернатива — рукописная реализация поверх `crypto` +
   `fetch` JWKS + in-memory cache, но JWT/JWKS-логика нетривиальна
   (алгоритмы, claim-валидация, key-rotation) и чревата security-ошибками;
   стандартная рекомендация — использовать поддерживаемую библиотеку.
   Требует отдельного ADR (формулировка-шаблон ниже).

3. **`better-sqlite3` для delivery-log.** Внешняя native-библиотека.
   Альтернатива — JSONL, но ты выбрал SQLite для delivery-log. Требует
   отдельного ADR.

**Шаблон ADR для JWT-verifier (будущий ADR-0023 или по нумерации):**

> ADR-0015 устанавливает нулевые внешние зависимости. Multi-source ingest
> требует проверки входящих JWT от источников через корпоративный Okta IdP.
> Выбираем `@okta/jwt-verifier` v4.x (активно поддерживается, latest
> 2025-08-28): стандартная claims-валидация, JWKS-fetch, key-rotation —
> слишком рискованно реализовывать вручную. Альтернатива `jose`
> (generic, тот же класс) — отклонена: меньше готовой Okta-специфичной
> логики, чуть больше клея. Исключение ограничено auth-слоем; остальная
> кодовая база остаётся zero-dep. Принятое следствие: runtime-зависимость
> от доступности Okta (см. допущение 2 идеи multi-source-ingest).

**Шаблон ADR для SQLite:** (как в ревизии 1, без изменений) —
`better-sqlite3` как native-биндинг, исключение ограничено слоем `LogStore`,
абстракция `LogStore` обязательна для будущего выбора БД при настройке.

`connection-log` и `audit-trail` остаются на syslog (однострочный текст,
лёгкий автоматический разбор) и под `LogStore` не подводятся.

## Open Questions

- **Сетевой сегмент для ingress.** Какой именно? Кто терминирует TLS —
  reverse-proxy перед bot-platform, или сам bot-platform? Это влияет на
  форму `JwtSourceAuth` (если TLS терминируется upstream, бот видит
  `X-Forwarded-*` и должен доверять прокси).
- **Client-credentials flow в Zabbix.** Какой TTL токена запрашивать у
  Okta token-endpoint? Это влияет на частоту перевыпуска и поведение при
  кратковременной недоступности Okta. Решение должно быть отражено в
  `docs/zabbix-media-type.md` при корректировке `max-webhook.js`.
  (Место хранения `client_id`/`client_secret` решено — env Media type.)
- **Deprecation-период прямого пути.** Какова продолжительность окна
  между доказательством нового пути на live-окружении и фактическим
  удалением direct-кода из `max-webhook.js`? Нужно ли на это окно
  сохранять старый код под feature-флагом, или сразу ограничиться
  документальным deprecation? Решается в ADR на расширение границы.
- **Source-mapping.** Как источник определяется по JWT? Через `aud`
  (отдельный audience на источник), через кастомный claim, через `sub`?
  Это влияет на Okta-конфигурацию тенанта и на интерфейс `SourceAuth`.
- **Формат delivery-log в SQLite.** Схема таблицы, индексы, политика
  retain. Вынести в будущий ADR по persistence или в отдельный документ
  `docs/` о журналах.
- **Версия Node.** CI сейчас на Node 22. `better-sqlite3` и
  `@okta/jwt-verifier` требуют сборки/тестирования под целевую платформу —
  проверить в CI и в runtime-среде.
- **Формат syslog.** Ровно одна строка на событие, структура `key=value`?
  Или структурированный JSON в одну строку? Решение влияет на парсеры.
- **Ротация ключей Okta.** Какое поведение при неизвестном `kid`?
  Lazy-refresh JWKS (предпочтительно) или fail-closed до ручного
  обновления? Влияет на устойчивость к плановой ротации.
- **Нумерация и состав будущих ADR.** Ожидается минимум: (1) расширение
  границы проекта под multi-source ingress + журналы; (2) ADR по
  появлению входящих HTTP (изменение посылки ADR-0015); (3) ADR на
  `@okta/jwt-verifier` как исключение из ADR-0015; (4) ADR на
  `better-sqlite3` как исключение из ADR-0015. Определить на этапе
  декомпозиции в `tasks/sprints/`.

---

## Изменения ревизии 2

Относительно ревизии 1 (env-секреты + `crypto.timingSafeEqual`):

- **Auth-слой полностью заменён.** Вместо per-source статичных токенов в
  env принят единый механизм: верификация JWT от источников через
  корпоративный Okta IdP (`@okta/jwt-verifier`). Это убирает пункт
  «StaticTokenAuth» из MVP Scope и Not Doing.
- **Появилось новое must-be-true допущение:** Okta IdP развёрнут и
  доступен из runtime. IdP-зависимость в runtime принята сознательно —
  недоступность IdP приравнена к недоступности сети.
- **Zabbix-интеграция усложнилась:** `max-webhook.js` теперь должен
  выполнять OAuth client-credentials flow перед отправкой, а не просто
  подставлять статичный токен. Это отражено в MVP Scope пункт 6.
- **ADR-0015 — теперь тройное нарушение** (было двойное): добавился
  HTTP-ingress-сервер как изменение архитектурной посылки ADR-0015:40-42
  («не принимает входящие HTTP»). В Open Questions появился отдельный
  ADR для этого.
- **`SourceAuth` интерфейс остаётся расширяемым**, но единственная
  реализация в MVP — `JwtSourceAuth`. Будущее добавление
  HMAC/mTLS/StaticToken как альтернативных провайдеров — через ADR.
- **Not Doing обновлён:** убран пункт про external auth-шлюзы в части,
  касающейся JWT-verifier (библиотека, не шлюз — не каннибализация);
  добавлен пункт про generic JWT/JWKS без Okta как явно отклонённая
  альтернатива; добавлен пункт про персистентный кэш JWKS на диск.
- **Характер системы изменился.** Из «thin transport в доверенной сети с
  per-source shared-secret» система стала «OIDC-защищённым сервисом с
  внешним trust-anchor (Okta)». Это сознательный стратегический сдвиг
  под плановое развёртывание корпоративного IdP, зафиксированный здесь
  явно для будущих читателей документа.

## Изменения ревизии 3

Относительно ревизии 2 (JWT-verifier без решений по fallback и storage):

- **Прямой путь объявляется deprecated** (ранее рассматривался как
  fallback). `max-webhook.js → MAX Bot API` минуя bot-platform помечается
  deprecated с момента ввода нового ingest-пути; физическое удаление
  direct-кода — после live-evidence (по образцу ADR-0010). Это убирает
  security-асимметрию: не остаётся неаутентифицированного маршрута в MAX.
  Open question про продолжительность deprecation-окна и feature-флаг
  перенесён в раздел Open Questions.
- **`client_secret` источника хранится в env Media type Zabbix** — по
  модели нынешнего параметра `Token`. Это решает open question ревизии 2
  о месте хранения. Альтернативы (отдельный bridge-сервис, меняющий
  статичный секрет на JWT перед Zabbix) отклонены — лишняя
  операционная сущность, противоречит ADR-0009 «один runtime, меньше
  сущностей» в общей логике проекта.
- **Уточнён Not Doing.** Пункт про static-token переформулирован: теперь
  явно запрещён **любой** не-JWT auth (включая hypothetical static-token
  fallback), а не только как per-source baseline. Решение по direct-пути
  делает эту формулировку более строгой и однозначной.
- **Скорректирована история решений.** ADR-0010 в таблице теперь говорит
  «live-evidence до deprecation», а не «direct остаётся fallback» —
  согласовано с новым решением.

## История решений (что привело к этому направлению)

| Источник | Что дало |
|---|---|
| ADR-0007/0008/0011 | Зафиксировано outbound-only LXC → ingress требует новой среды (prerequisite) |
| ADR-0009 | Long-polling loop в существующем entrypoint → один runtime, не отдельный процесс |
| ADR-0010 | Live-evidence для приёмки → новый Zabbix-путь должен быть доказан на live-окружении до deprecation прямого пути |
| ADR-0012 | Convention-based plugin loader → каркас для подключения новых нормализаторов источников |
| ADR-0015 | Zero-dep политика → теперь **тройное** нарушение (HTTP-ingress, JWT-lib, SQLite), каждое требует ADR |
| ADR-0016 | Инъекция зависимостей через options → `SourceAuth`, `LogStore`, HTTP-server инжектируемы, тестируемы без сети и без Okta (mock-JWT в тестах) |
| ADR-0017 | Canonical event contract → `SOURCE_*` расширяем, per-source normalizer — задокументированная точка расширения |
| ADR-0019 | Outbound response shape → `text`-kind переиспользуется для multi-source outbound |
| ADR-0021 | `REPLY_UPDATE_TYPES` для MAX-направления; для нового ingest-направления типы событий другие, не пересекаются |
| Okta-jwt-verifier-js v4.x | Активно поддерживается (latest 2025-08-28), 2.x retired 2025-01-31 — жизнеспособная библиотека для MVP |

## Источники (для обоснования выбора JWT-verifier)

- [okta/okta-jwt-verifier-js](https://github.com/okta/jwt-verifier-js) — официальный репозиторий, статус поддержки
- [UPGRADING.md guide](https://github.com/okta-jwt-verifier-js/blob/master/UPGRADING.md) — breaking changes между мажорами
- [Validating OAuth Access Tokens: Introspection vs. JWKS](https://medium.com/@vgzxkgmrpn/validating-oauth-access-tokens-in-go-introspection-vs-jwks-77ba072e702a) — обоснование cache-модели JWKS (zero per-request latency после начального fetch)
- [JWKS and Zero-Downtime Key Rotation](https://www.davidsulc.com/blog/jws-apis-jwks-basics) — поток верификации и ротация ключей
- [JWKS and JWT verification: what identity teams need to know](https://nhimg.org/articles/jwks-and-jwt-verification-what-identity-teams-need-to-know/) — lifecycle-проблемы JWKS
- [Navigating RS256 and JWKS — Auth0](https://auth0.com/blog/navigating-rs256-and-jwks/) — фундамент asymmetric signing
- [panva/jose](https://github.com/panva/jose) — generic-альтернатива, рассмотрена и отклонена в пользу Okta-специфичной библиотеки
