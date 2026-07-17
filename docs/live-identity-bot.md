# Live MAX Identity Bot

Документ фиксирует текущий статус live-сценария бота МАХ для получения `user_id` / `chat_id`.

## Текущий статус

Live-сценарий принят и подтвержден.

Принято и проверено:

- Zabbix отправляет уведомления в МАХ через Media type `Webhook`;
- bot-platform умеет обрабатывать synthetic fixtures;
- identity plugin формирует текст ответа с `RecipientType` и `To`;
- safe test bot запускается в `long_polling` режиме с synthetic updates;
- секреты и реальные идентификаторы не хранятся в репозитории.

Live-приемка подтверждена (2026-07-15):

- получение реального входящего сообщения от МАХ — подтверждено;
- отправка реального ответа через MAX Bot API — подтверждено;
- видимый ответ пользователю с `RecipientType: user_id` — подтверждено;
- видимый ответ в chat-сценарии с `RecipientType: chat_id` — подтверждено.

Документ приемки: `docs/test-runs/task-18-live-acceptance-run.md`

## Критерий приемки

Актуальное правило зафиксировано в:

```text
docs/decisions/ADR-0010-require-live-evidence-for-max-identity-bot-acceptance.md
docs/project-acceptance.md
```

Dry-run, synthetic fixtures и safe test bot не считаются достаточным доказательством live-приемки.

## Граница live identity bot

Live MAX Identity Bot делает только identity-сценарий:

```text
сообщение пользователя или чата в МАХ -> ответ с RecipientType и To
```

Доставка Zabbix alert-сообщений остается в существующем канале:

```text
Zabbix Media type Webhook -> src/zabbix-media-type/max-webhook.js -> MAX Bot API
```

Live identity bot не принимает события Zabbix, не маршрутизирует уведомления, не ведет журнал доставки и не заменяет `src/zabbix-media-type/max-webhook.js`. Если нужен отдельный сервис, который получает события Zabbix и сам отправляет alert-сообщения в МАХ, это новая архитектурная граница и отдельный ADR.

## На какие события бот отвечает

Identity-бот отвечает на update типа `message_created`, `bot_added` и `bot_started`. Другие типы update игнорируются без отправки ответа:

```text
message_created -> бот обрабатывает команды (/help, /id, /status) или отвечает "Unknown command"
bot_started     -> бот отправляет приветствие
bot_added       -> бот отправляет приветствие
любой другой    -> игнорируется
```

Правило живет в `src/bot-platform/core/live-pipeline.js` и `src/bot-platform/core/dry-run-pipeline.js` (`REPLY_UPDATE_TYPES`).

## Доставка updates в групповых чатах MAX

Поведение платформы MAX: в групповом чате бот, добавленный как участник, по умолчанию не получает `message_created` для обычных сообщений участников чата. Это поведение платформы MAX для групповых чатов, а не дефект кода identity-бота.

Наблюдение из live-диагностики (обезличено): прямой запрос `GET /updates` с реальным токеном бота в групповом чате возвращает `HTTP 200` с пустым списком updates:

```text
HTTP 200
{"updates": [], "marker": <marker>}
```

Это подтверждает, что transport, токен и сеть работают (200, а не 401 и не ошибка TLS), но MAX Bot API не доставляет боту `message_created` для сообщений в этом чате. В личном диалоге (dialog) `message_created` доходит и обрабатывается.

Поэтому для получения `chat_id` через identity-бота в групповом чате нужен способ заставить MAX прислать update боту. Возможные пути (требуют подтверждения в открытых источниках MAX Bot API): упоминание бота, ответ (reply) на сообщение бота, особые настройки приватности бота, отдельный метод API. Поиск доказательств ведется отдельной задачей (см. `tasks/sprints/sprint-05.md`).

Эта ограниченность не влияет на доставку Zabbix alert-сообщений: `src/zabbix-media-type/max-webhook.js` отправляет исходящие сообщения через `POST /messages?chat_id=...` и этот путь работает (MAX возвращает `200 OK`, сообщение появляется в чате).

## Рабочая задача

Live-реализация ведется отдельной задачей:

```text
tasks/sprints/ -> Task 18.9-18.10
docs/runbooks/live-identity-bot.md -> operational runbook
```

Перед кодом нужно подтвердить официальный способ MAX Bot API для:

- получения входящих событий;
- отправки ответа;
- read/ack, если этот признак должен поддерживаться.

Pre-code source gate закрыт в Task 18.1:

```text
docs/identity-plugin/max-api-source.md
```

Документ подтверждает официальный источник MAX Bot API. Task 18.2 выбрал первый live transport mode:

```text
MAX_TRANSPORT_MODE=long_polling
```

`webhook` остается явной заглушкой до отдельной реализации:

```text
Не реализовано: transport mode webhook
```

Если read/ack не подтвержден официальной документацией, отсутствие отметки "прочитано" не блокирует приемку. Блокирует отсутствие видимого ответа бота.

## Что проверять при отладке

Если пользователь отправил сообщение боту, но ответа нет:

1. Проверить, запущен ли runtime в режиме, который реально получает события от MAX.
2. Проверить, что источник входящих событий не synthetic fixtures.
3. Проверить тип update: бот отвечает на `message_created` (команды и текст), `bot_added` (приветствие при добавлении в чат) и `bot_started` (приветствие при начале диалога). В групповом чате MAX по умолчанию не доставляет боту `message_created` для обычных сообщений участников — прямой запрос `GET /updates` вернёт пустой список `updates`. Это поведение платформы MAX, а не ошибка сети, токена или кода. Личный диалог (dialog) обновления доставляет.
4. Проверить, что outbound client делает сетевой вызов MAX Bot API.
5. Проверить, что `MAX_BOT_TOKEN` и другие секреты заданы только локально.
6. Проверить логи без раскрытия токенов, `user_id`, `chat_id`, внутренних URL и организационных названий.

Для диагностики live runtime пишет `info` события о старте сервиса, polling cycle, полученных updates и отправленном outbound response. Ошибки polling и MAX API пишутся как `error` и должны сопровождаться последующим `long polling loop recovered from error`.

Error logs выводятся одной строкой в формате `key=value` и содержат безопасные поля `code`, `reason`, `causeCode`, `causeMessage`, `causeHost`. Для сетевых сбоев ожидаются технические причины вроде `causeCode=UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `causeMessage=unable to get local issuer certificate` или `causeCode=EAI_AGAIN`. Эти поля нужны для диагностики TLS/CA, DNS и доступности MAX API без вывода токена, `Authorization`, URL запроса и реальных `user_id` / `chat_id`.

Полный список ожидаемых log markers описан в:

```text
docs/runbooks/live-identity-bot.md
```

## Документы по теме

- [`runbooks/live-identity-bot.md`](runbooks/live-identity-bot.md) — запуск live MAX Identity Bot.
- [`test-runs/task-18-live-acceptance-run.md`](test-runs/task-18-live-acceptance-run.md) — live-приемка MAX Identity Bot.
- [`test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) — историческая приемка доставки Zabbix -> МАХ, не live-приемка identity bot.
