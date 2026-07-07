# Task 11.1: Поиск и сравнение open source кандидатов для модульной bot-platform

Документ фиксирует рабочую задачу второго этапа: найти и сравнить open source проекты, которые потенциально можно использовать как основу модульной bot-platform для МАХ.

Task 11.1 является частью исследования Task 11 и не означает начало реализации.

## Статус

```text
Research complete / CI pending
```

Поиск и сравнение кандидатов выполнены. Перед реализацией выбранного подхода требуется ADR.

## Цель

Найти и сравнить open source кандидатов, которые могут подойти для одного из вариантов:

```text
1. адаптация готового bot framework;
2. адаптация workflow-platform;
3. подтверждение, что готовые варианты не подходят и нужен собственный минимальный сервис.
```

Основной проверяемый сценарий:

```text
входящее сообщение боту МАХ -> получение chat_id / user_id -> безопасная подсказка для настройки получателя в Zabbix
```

## Граница Task 11.1

Входит:

- поиск open source проектов в открытых источниках;
- первичная оценка лицензии, активности и архитектуры;
- проверка применимости к МАХ как transport;
- проверка применимости к Zabbix как источнику уведомлений;
- сравнение кандидатов по единым критериям;
- формирование предварительной рекомендации для MVP.

Не входит:

- написание кода;
- создание нового сервиса;
- запуск нового runtime;
- подключение к реальному МАХ API;
- подключение к реальному Zabbix;
- хранение реальных `chat_id` / `user_id`;
- изменение текущего Zabbix Webhook;
- создание промышленной архитектуры без ADR.

## Источники проверки

Проверка выполнена по открытым источникам и официальным репозиториям / документации.

| Candidate | Sources |
|---|---|
| Errbot | `https://errbot.readthedocs.io/en/latest/`, `https://github.com/errbotio/errbot`, `https://github.com/errbotio/errbot/releases`, `https://github.com/errbotio/errbot/blob/master/COPYING` |
| Hubot | `https://hubot.github.com/docs/`, `https://github.com/hubotio/hubot`, `https://github.com/hubotio/hubot/blob/main/LICENSE.md` |
| Node-RED | `https://nodered.org/docs/getting-started/local`, `https://nodered.org/docs/creating-nodes/`, `https://nodered.org/docs/user-guide/nodes`, `https://github.com/node-red/node-red`, `https://github.com/node-red/node-red/blob/main/LICENSE` |
| n8n | `https://docs.n8n.io/hosting/installation/docker/`, `https://docs.n8n.io/integrations/creating-nodes/overview/`, `https://docs.n8n.io/sustainable-use-license/` |
| Botpress | `https://github.com/botpress/botpress`, `https://botpress.com/docs/`, `https://github.com/botpress/botpress/blob/master/LICENSE` |
| Mattermost | `https://developers.mattermost.com/integrate/`, `https://developers.mattermost.com/integrate/plugins/`, `https://developers.mattermost.com/integrate/webhooks/`, `https://github.com/mattermost/mattermost`, `https://github.com/mattermost/mattermost/blob/master/LICENSE.txt` |

## Метод оценки и принятия решения

Оценка выполняется в четыре шага:

```text
1. Предварительный фильтр.
2. Проверка обязательных критериев shortlist.
3. Присвоение verdict каждому кандидату.
4. Выбор подхода для MVP.
```

### 1. Предварительный фильтр

Кандидат отклоняется без дальнейшего сравнения, если подтвержден хотя бы один блокер:

- проект не является open source или лицензия не подтверждена;
- лицензия явно не подходит для корпоративного применения;
- нет self-hosted варианта;
- базовый сценарий требует публичного облака;
- нет webhook / HTTP / plugin / adapter / extension механизма;
- нельзя хранить токены и секреты вне репозитория;
- проект заброшен и нет признаков поддерживаемой версии;
- архитектура не позволяет изолировать identity-сценарий от лишних функций;
- для MVP требуется сразу добавлять базу данных, очередь, журнал доставки или сложный runtime.

Если блокер найден, в таблице указывается:

```text
Verdict: reject
Risk: краткая причина отклонения
```

### 2. Обязательные критерии shortlist

Кандидат попадает в shortlist, если выполняются условия:

| Критерий | Минимальное значение |
|---|---|
| License | `yes` |
| Self-hosted | `yes` |
| Webhook support | `yes` или `partial` |
| Plugin / adapter | `yes` или `partial` |
| MAX transport | `partial` или `yes` |
| Zabbix source | `partial` или `yes` |
| Identity scenario | `partial` или `yes` |
| Secret handling | `yes` |
| Main risks | без блокеров для MVP |

Если по ключевому критерию стоит `unknown`, кандидат не выбирается для MVP, пока значение не подтверждено источником.

### 3. Правила verdict

Использовать три значения:

```text
keep         подходит для дальнейшего сравнения и может быть основой MVP
investigate  потенциально подходит, но есть непроверенные условия
reject       не подходит для MVP или имеет блокер
```

Правила:

| Verdict | Когда ставить |
|---|---|
| `keep` | Все обязательные критерии shortlist выполнены, риски понятны, MVP можно реализовать без неоправданного усложнения |
| `investigate` | Нет блокеров, но не подтверждены 1-2 важных критерия или требуется короткая техническая проверка |
| `reject` | Есть блокер, неподходящая лицензия, нет self-hosted, нет расширяемости, проект не поддерживается или MVP становится слишком тяжелым |

### 4. Правило выбора подхода для MVP

После заполнения таблицы выбрать один подход:

| Условие | Вывод |
|---|---|
| Есть один или несколько кандидатов `keep` среди bot framework | Рассмотреть адаптацию open source bot framework |
| Нет подходящего bot framework, но workflow-platform получает `keep` или сильный `investigate` | Рассмотреть workflow-прототип для проверки identity-сценария |
| Все готовые варианты `reject` или требуют избыточной архитектуры | Рекомендовать собственный минимальный сервис |
| Значение identity-сценария не подтверждено или все варианты дают высокий риск | Отказаться от MVP до появления подтвержденной потребности |

При равенстве вариантов приоритет выбора:

```text
1. безопасность и хранение секретов;
2. self-hosted и независимость от публичного облака;
3. простота MVP;
4. расширяемость через plugins / adapters;
5. простота сопровождения;
6. активность проекта и понятная лицензия.
```

## Таблица сравнения

| Candidate | Type | License | Activity | Self-hosted | Plugin / adapter | Webhook | MAX transport | Zabbix source | Identity scenario | Risk | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Hubot | bot framework | yes: MIT | yes | yes | yes: scripts / adapters | partial | partial: нужен custom MAX adapter | partial: через webhook / custom script | yes | нужен новый runtime и adapter; нужна проверка MAX webhook semantics | keep |
| Errbot | bot framework | yes: GPL-3 | partial: релиз 6.2.0 в 2024 | yes | yes: plugins / backends | yes | partial: нужен custom MAX backend | yes: webhook/plugin route | yes | GPL-3 требует лицензионной проверки; Python backend development | investigate |
| Node-RED | workflow-platform | yes: Apache-2.0 | yes | yes | yes: custom nodes / flow library | yes | partial: HTTP/custom node | yes: HTTP webhook | yes | не bot framework; нужен контроль flow-конфигураций и доступа к редактору | keep as fallback prototype |
| n8n | workflow-platform | no для open source shortlist: source-available / Sustainable Use License | yes | yes | yes: custom/community nodes | yes | partial: HTTP/custom node | yes: webhook | yes | не OSI-open-source; лицензионные ограничения; тяжелее для простого MVP | reject for open source shortlist |
| Botpress | bot/agent platform | partial: MIT для текущего репозитория | yes | no для текущего cloud-oriented варианта | partial: integrations; plugins marked as coming soon | partial | partial: через integration, но deploy завязан на workspace/cloud | partial | yes | current repo ориентирован на Botpress Cloud; on-prem v12 вынесен отдельно и выглядит legacy | reject |
| Mattermost | collaboration / integration platform | partial: MIT compiled, AGPL source, Apache for parts | yes | yes | yes: plugins / webhooks | yes | no: это отдельная chat-platform, не transport для МАХ | yes | no для MAX identity bot | добавляет другую chat-platform и не решает задачу МАХ transport | reject |

## Краткая оценка кандидатов

### Hubot

Hubot лучше всего соответствует модели `transport / adapter + scripts` для MVP `MAX Identity Bot`.

Плюсы:

- MIT license;
- self-hosted Node.js runtime;
- adapter pattern для chat providers;
- scripts как простая модель расширения;
- подходит для identity-сценария без базы данных, очереди и журнала доставки.

Минусы:

- нужен custom adapter или gateway для входящих событий МАХ;
- потребуется отдельный runtime;
- потребуется ADR и отдельная задача реализации.

Решение: `keep`.

### Errbot

Errbot хорошо подходит концептуально: есть plugins, backends, webhook support и модель chatbot для ChatOps.

Плюсы:

- зрелая plugin/backend архитектура;
- есть webhook support;
- self-hosted;
- подходит для identity-сценария.

Минусы:

- GPL-3 license требует отдельной оценки применимости;
- релизная активность ниже, чем у Node-RED и n8n;
- нужен custom MAX backend.

Решение: `investigate`.

### Node-RED

Node-RED не является bot framework, но хорошо подходит как быстрый workflow-прототип.

Плюсы:

- Apache-2.0 license;
- self-hosted;
- есть HTTP/webhook-подход;
- легко собрать прототип `incoming HTTP -> extract id -> response`;
- можно быстро проверить ценность identity-сценария.

Минусы:

- не является целевой bot-platform;
- сложнее обеспечить архитектурную чистоту при росте логики;
- нужен контроль доступа к редактору и flow-конфигурациям.

Решение: `keep as fallback prototype`.

### n8n

n8n функционально подходит как workflow-platform, но не проходит open source фильтр.

Плюсы:

- self-hosted;
- есть webhook, HTTP Request, custom/community nodes;
- удобно для быстрых интеграций.

Минусы:

- сам проект указывает, что не называет себя open source из-за ограничений Sustainable Use License;
- для корпоративного применения требуется отдельная лицензионная оценка;
- для простого identity-MVP runtime выглядит избыточным.

Решение: `reject for open source shortlist`.

### Botpress

Botpress интересен как bot/agent ecosystem, но текущий публичный репозиторий ориентирован на Botpress Cloud и интеграции.

Плюсы:

- MIT license для текущего репозитория;
- есть SDK/CLI и integration development;
- подходит для bot/agent экспериментов.

Минусы:

- текущая модель deploy завязана на workspace / Botpress Hub;
- plugins в README отмечены как coming soon;
- on-prem v12 вынесен отдельно и не выглядит целевым современным путем;
- для локального простого identity-MVP это лишняя зависимость.

Решение: `reject`.

### Mattermost

Mattermost полезен как self-hosted collaboration platform с webhooks/plugins, но не решает задачу МАХ transport.

Плюсы:

- self-hosted;
- есть webhooks, slash commands, plugins;
- активная интеграционная модель.

Минусы:

- это отдельная chat-platform, а не transport для МАХ;
- добавляет лишний коммуникационный контур;
- identity-сценарий для МАХ не закрывает напрямую.

Решение: `reject`.

## Рекомендация по итогам сравнения

Рекомендуемый путь для MVP:

```text
Основной вариант: Hubot-based MVP MAX Identity Bot.
Fallback-вариант: Node-RED workflow-прототип, если custom Hubot adapter для МАХ окажется дольше или рискованнее ожидаемого.
```

Причины выбора Hubot как основного варианта:

- это именно bot framework, а не общая workflow-platform;
- есть adapter/scripts модель, близкая к целевой plugin-архитектуре;
- MIT license проще для внутреннего корпоративного применения, чем GPL-3 или source-available лицензии;
- MVP можно ограничить identity-сценарием без базы данных, очереди, журнала доставки и Zabbix API;
- текущий Zabbix Webhook остается неизменным.

Причины оставить Node-RED fallback-вариантом:

- быстро проверяет identity-сценарий через HTTP/webhook flow;
- Apache-2.0 license;
- self-hosted;
- подходит для короткого прототипа, но не как целевая bot-platform.

## Нужен ли ADR

Да.

Выбранный путь добавляет новый runtime и обработку входящих событий МАХ. Поэтому до реализации нужен ADR.

ADR должен зафиксировать:

- Hubot как основной путь для MVP `MAX Identity Bot`;
- Node-RED как fallback для workflow-прототипа;
- запрет менять текущий Zabbix Webhook в рамках MVP;
- отсутствие Zabbix API integration на MVP;
- отсутствие базы данных, очереди, журнала доставки и retry на MVP.

## Acceptance criteria

- [x] Найдено не менее 4 open source кандидатов или зафиксировано, почему меньше.
- [x] По каждому кандидату заполнены обязательные поля оценки.
- [x] Подготовлена сравнительная таблица.
- [x] Указаны кандидаты, отклоненные на раннем этапе, и причины отклонения.
- [x] Сделан предварительный вывод по подходу для MVP.
- [x] Отдельно отмечено, нужен ли ADR перед реализацией выбранного подхода.
- [x] Подтверждено, что текущий Zabbix Webhook не меняется.

## Verification

- [x] Для каждого кандидата есть ссылки на открытые источники.
- [x] Лицензия не указана по памяти: она подтверждена источником.
- [x] Активность проекта проверена по репозиторию, релизам или официальной документации.
- [x] Не добавлены реальные токены, `chat_id`, `user_id`, внутренние адреса или организационные данные.
- [x] Не добавлены новые runtime-компоненты.
- [x] Не изменен `src/zabbix-media-type/max-webhook.js`.
- [ ] Выполнен `npm test`, если менялись файлы, покрываемые policy tests.

## Ожидаемый результат

```text
Подготовлено сравнение open source кандидатов для модульной bot-platform. Выявлены подходящие и неподходящие варианты. Сформирована предварительная рекомендация для MVP MAX Identity Bot: основной путь — Hubot-based MVP, fallback — Node-RED workflow-прототип. Перед реализацией нового сервиса, runtime или входящих webhooks требуется ADR. Текущий Zabbix Webhook не меняется.
```
