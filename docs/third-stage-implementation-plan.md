# Third stage implementation plan: MAX Identity Bot

Документ описывает план реализации третьего этапа: модульной bot-platform для МАХ на основе решений второго этапа.

Статус после ADR-0010: третий этап довел bot-platform до dry-run/safe-test состояния. Реальный inbound/outbound MAX Bot API для live-приемки вынесен в Task 18.

## Базовое решение

```text
ADR-0005: Hubot-based MVP MAX Identity Bot
Fallback: Node-RED workflow-прототип
```

Третий этап является этапом реализации MVP, а не промышленного bot-service.

## Целевой сценарий

```text
1. Пользователь или групповой чат отправляет сообщение боту МАХ.
2. MAX transport принимает входящее событие или synthetic fixture.
3. Event normalizer приводит событие к внутреннему формату.
4. Identity plugin определяет тип получателя.
5. Outbound transport отправляет безопасную подсказку для настройки Zabbix.
```

## Принцип модульности

Транспорт и бизнес-логика разделяются:

| Блок | Ответственность |
|---|---|
| `core/config` | чтение конфигурации и переменных окружения |
| `core/logger` | обезличенное логирование |
| `core/event-router` | маршрутизация нормализованных событий к плагинам |
| `transports/max/inbound-webhook` | contract для приема входящих событий МАХ без публикации live endpoint |
| `transports/max/outbound-client` | contract для отправки ответа без live сетевого вызова |
| `transports/max/event-normalizer` | преобразование события МАХ во внутренний формат |
| `plugins/identity` | определение типа получателя и формирование ответа |

## Локальный dry-run

Для проверки MVP без реального MAX API используйте synthetic fixtures и CLI entrypoint:

```bash
node src/bot-platform/app.js examples/bot-platform/max-inbound-user.fixture.json
node src/bot-platform/app.js examples/bot-platform/max-inbound-chat.fixture.json
```

Ожидаемое поведение:

- результат печатает обезличенный dry-run response;
- `networkEnabled` остается `false`;
- `raw` payload не попадает в вывод;
- реальные токены, callback URL, chat_id/user_id и внутренние адреса не используются.

## Предлагаемая структура репозитория

```text
src/bot-platform/
  core/
    config.js
    logger.js
    event-router.js
    plugin-loader.js
  transports/
    max/
      inbound-webhook.js
      outbound-client.js
      event-normalizer.js
  plugins/
    identity/
      handler.js
      formatter.js
  app.js

tests/bot-platform/
  identity.test.js
  max-event-normalizer.test.js
  max-outbound-client.test.js

examples/bot-platform/
  env.example
  max-inbound-user.fixture.json
  max-inbound-chat.fixture.json
```

## Задачи третьего этапа

### Task 12: Подготовить каркас bot-platform

Scope:

- создать структуру `src/bot-platform`;
- добавить `core/config`, `core/logger`, `core/event-router`;
- добавить базовую загрузку identity plugin;
- не подключать внешний МАХ API.

Verification:

- `npm test` проходит;
- нет изменений в текущем Zabbix Webhook;
- нет реальных идентификаторов и чувствительных значений.

### Task 12.1: Реализовать MAX event normalizer

Scope:

- описать внутренний формат события;
- добавить fixtures для личного сообщения и группового чата;
- реализовать нормализацию входящих событий.

Verification:

- unit-тесты на user fixture;
- unit-тесты на chat fixture;
- неизвестный формат события обрабатывается безопасно.

### Task 12.2: Реализовать identity plugin

Scope:

- определить тип получателя;
- сформировать текст ответа для настройки Zabbix;
- не сохранять полученные значения в репозиторий или persistent storage.

Verification:

- тест личного сообщения;
- тест группового чата;
- тест пустого или неполного события.

### Task 12.3: Реализовать MAX outbound transport contract

Scope:

- подготовка outbound request для будущего API МАХ;
- учетные данные только из внешней конфигурации;
- обезличенное логирование;
- обработка ошибок отправки.

Verification:

- unit-тест без реального API;
- проверка, что учетные данные не логируются;
- dry-run показывает `networkEnabled: false`;
- live-интеграционный прогон с тестовым ботом фиксируется отдельно в Task 18.

### Task 12.7: Подготовить stand runbook

Scope:

- описать запуск в WSL;
- описать запуск в LXC;
- зафиксировать взаимозаменяемость стендов;
- зафиксировать, что для продолжения работ допускается любой стенд, прошедший обязательные проверки;
- зафиксировать ограничения каждого варианта.

Verification:

- runbook содержит команды установки зависимостей;
- описан способ запуска проверок;
- описан способ запуска dry-run pipeline;
- описана взаимозаменяемость WSL и LXC;
- указано, что публикация внешнего endpoint на этом шаге не выполняется.

### Task 12.8: Подготовить Codex agent workflow

Scope:

- описать, как агент получает задачу;
- описать разрешенные команды;
- описать запреты;
- описать обязательные проверки перед commit.

Verification:

- агент не работает с чувствительными значениями;
- агент не меняет текущий Zabbix Webhook;
- агент запускает тесты;
- результат фиксируется в документации.

## Выбор стенда

Актуальный подход:

```text
WSL и LXC на Proxmox являются взаимозаменяемыми вариантами стенда.
Для продолжения работ допускается использовать любой стенд, на котором проходят обязательные проверки.
```

Различия WSL и LXC фиксируются как эксплуатационные ограничения, а не как жесткое разделение ролей.

## Роль Codex agent или аналога

Codex agent или аналог может использоваться для:

- генерации каркаса кода;
- написания unit-тестов;
- выполнения локальных прогонов;
- подготовки документации;
- анализа ошибок тестов.
