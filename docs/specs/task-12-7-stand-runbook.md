# Task 12.7 spec: WSL/LXC stand runbook

Документ подготовлен по skills `spec-driven-development` и `planning-and-task-breakdown`.

## Status

```text
Planned / pre-implementation spec
```

## Goal

Зафиксировать ожидаемый результат Task 12.7 до внесения изменений в runbook.

Task 12.7 должна подготовить воспроизводимое описание стенда для локальной и интеграционной проверки MVP `MAX Identity Bot`.

## Source of truth

Текущий план третьего этапа:

```text
Task 12.7: Проверить WSL/LXC stand и подготовить runbook.
```

Implementation plan задает ожидаемый состав runbook:

```text
- описать запуск в WSL;
- описать запуск в LXC;
- выбрать рабочую роль стендов без жесткой привязки к одному варианту;
- зафиксировать ограничения каждого варианта.
```

## Expected output

Основной результат Task 12.7:

```text
docs/runbooks/bot-platform-stand.md
```

Документ должен быть эксплуатационным runbook, а не архитектурным ADR и не инструкцией по разработке новой логики.

## Stand interchangeability rule

WSL и LXC должны описываться как взаимозаменяемые варианты стенда для продолжения работ.

Допускается использовать любой из стендов, если на нем выполняются одинаковые обязательные проверки:

```text
node --version
npm --version
npm test
dry-run pipeline на synthetic user fixture
dry-run pipeline на synthetic chat fixture
```

Разница между WSL и LXC должна быть описана как эксплуатационные особенности, а не как жесткое разделение полномочий.

## Scope

Входит:

- описать вариант стенда WSL;
- описать вариант стенда LXC;
- описать проверки для обоих вариантов;
- описать ограничения WSL и LXC;
- зафиксировать взаимозаменяемость стендов;
- зафиксировать, что любой из стендов может использоваться для продолжения работ;
- зафиксировать, что текущий Zabbix Webhook не меняется;
- зафиксировать, что реальные секреты, токены, callback URL и внутренние адреса не добавляются.

Не входит:

- реализация inbound webhook listener;
- реализация outbound MAX API client;
- Hubot adapter;
- persistent storage;
- systemd unit;
- reverse proxy;
- публикация реального webhook endpoint;
- изменение `src/zabbix-media-type/max-webhook.js`.

## Runbook structure

### 1. Назначение runbook

Кратко описать, что документ нужен для воспроизводимого запуска и проверки MVP bot-platform после Task 12.6.

Минимальная формулировка:

```text
Runbook описывает подготовку взаимозаменяемых WSL и LXC стендов для запуска тестов и dry-run pipeline без подключения к реальному MAX API.
```

### 2. Вариант стенда WSL

Описать WSL как один из допустимых взаимозаменяемых dev/test/integration stand вариантов.

Раздел должен содержать:

- назначение WSL;
- минимальные требования;
- подготовку рабочей директории;
- установку Node.js / npm;
- получение исходного кода;
- установку зависимостей;
- запуск `npm test`;
- запуск dry-run pipeline на synthetic fixtures;
- ограничения WSL.

Ожидаемая роль:

```text
WSL — допустимый взаимозаменяемый stand для продолжения работ, локальных проверок и dry-run pipeline.
```

### 3. Вариант стенда LXC

Описать LXC на Proxmox как один из допустимых взаимозаменяемых dev/test/integration stand вариантов.

Раздел должен содержать:

- назначение LXC;
- минимальные требования к контейнеру;
- подготовку ОС;
- установку Node.js / npm;
- получение исходного кода;
- установку зависимостей;
- запуск `npm test`;
- запуск dry-run pipeline на synthetic fixtures;
- ограничения LXC.

Ожидаемая роль:

```text
LXC on Proxmox — допустимый взаимозаменяемый stand для продолжения работ, локальных проверок и dry-run pipeline.
```

### 4. Проверки

Runbook должен содержать единый verification checklist.

Обязательные проверки:

- `node --version`;
- `npm --version`;
- `npm test`;
- dry-run pipeline на `max-inbound-user.fixture.json`;
- dry-run pipeline на `max-inbound-chat.fixture.json`;
- подтверждение `networkEnabled: false` для dry-run;
- проверка, что response не содержит raw payload reference;
- проверка, что реальные токены, callback URL и внутренние адреса не добавлены;
- проверка, что `src/zabbix-media-type/max-webhook.js` не изменялся.

### 5. Ограничения

Runbook должен явно разделять ограничения WSL и LXC.

WSL limitations:

- удобен для локальной разработки и тестов;
- зависит от настроек Windows/WSL конкретного рабочего места;
- inbound webhook может потребовать отдельной настройки проброса endpoint на будущих задачах;
- не использовать для хранения секретов в репозитории.

LXC limitations:

- требует доступа к Proxmox/серверному контуру;
- требует отдельного решения по сетевой публикации endpoint на будущих задачах;
- не включает автоматическую настройку reverse proxy или TLS;
- не включает systemd unit на Task 12.7, если это не будет отдельно согласовано.

### 6. Рекомендуемый выбор стенда

Зафиксировать ожидаемый подход:

```text
WSL и LXC взаимозаменяемы.
Для продолжения работ допускается использовать любой стенд, на котором проходят обязательные проверки.
```

При наличии обоих вариантов выбор выполняется по доступности и удобству текущей проверки.

### 7. Security rules

Runbook не должен содержать:

- реальные MAX bot tokens;
- реальные callback URL;
- реальные `chat_id` / `user_id`;
- внутренние IP-адреса;
- доменные имена внутреннего контура;
- команды, которые публикуют секреты в shell history;
- инструкции по изменению текущего Zabbix Webhook.

Все примеры должны использовать synthetic placeholders:

```text
<synthetic-user-id>
<synthetic-chat-id>
<synthetic-callback-url>
<project-path>
<repository-url>
```

## Acceptance criteria

- [ ] Создан `docs/runbooks/bot-platform-stand.md`.
- [ ] Runbook содержит раздел WSL.
- [ ] Runbook содержит раздел LXC.
- [ ] Runbook содержит verification checklist.
- [ ] Runbook содержит ограничения WSL и LXC.
- [ ] Runbook фиксирует взаимозаменяемость WSL и LXC.
- [ ] Runbook фиксирует, что для продолжения работ допускается любой стенд, прошедший проверки.
- [ ] Runbook не содержит реальных секретов, callback URL, recipient identifiers или внутренних адресов.
- [ ] Runbook явно подтверждает, что текущий Zabbix Webhook не меняется.

## Verification

- [ ] Проверить содержание runbook по этому spec.
- [ ] Проверить отсутствие реальных секретов и URL.
- [ ] Проверить, что `src/zabbix-media-type/max-webhook.js` не менялся.
- [ ] Запустить или зафиксировать необходимость запуска `npm test` после изменений документации.

## Files likely touched

```text
docs/specs/task-12-7-stand-runbook.md
docs/runbooks/bot-platform-stand.md
```

Дополнительно, после подготовки runbook, могут быть обновлены:

```text
tasks/plan.md
docs/test-runs/README.md
docs/third-stage-implementation-plan.md
```

Только если Task 12.7 будет закрываться по факту проверки или требуется синхронизация формулировок.

## Next step

```text
Подготовить docs/runbooks/bot-platform-stand.md по структуре этого spec.
```
