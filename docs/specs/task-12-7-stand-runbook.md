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
- выбрать основной стенд для прогонов;
- зафиксировать ограничения каждого варианта.
```

## Expected output

Основной результат Task 12.7:

```text
docs/runbooks/bot-platform-stand.md
```

Документ должен быть эксплуатационным runbook, а не архитектурным ADR и не инструкцией по разработке новой логики.

## Scope

Входит:

- описать вариант стенда WSL;
- описать вариант стенда LXC;
- описать проверки для обоих вариантов;
- описать ограничения WSL и LXC;
- выбрать рекомендуемую роль стендов;
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
Runbook описывает подготовку WSL и LXC стендов для запуска тестов и dry-run pipeline без подключения к реальному MAX API.
```

### 2. Вариант стенда WSL

Описать WSL как быстрый локальный dev/test stand.

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
WSL — primary dev/test stand для быстрых локальных проверок.
```

### 3. Вариант стенда LXC

Описать LXC на Proxmox как более стабильный integration stand.

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
LXC on Proxmox — preferred integration stand для следующих проверок MVP.
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

- удобен для разработки и тестов;
- не является стабильным серверным стендом;
- inbound webhook может потребовать отдельной настройки проброса endpoint;
- не использовать для хранения секретов в репозитории.

LXC limitations:

- требует доступа к Proxmox/серверному контуру;
- требует отдельного решения по сетевой публикации endpoint на будущих задачах;
- не включает автоматическую настройку reverse proxy или TLS;
- не включает systemd unit на Task 12.7, если это не будет отдельно согласовано.

### 6. Рекомендуемый выбор стенда

Зафиксировать ожидаемый выбор:

```text
Primary dev/test stand: WSL
Preferred integration stand: LXC on Proxmox
```

Если по результатам проверки выбор изменится, runbook должен явно описать причину.

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
```

## Acceptance criteria

- [ ] Создан `docs/runbooks/bot-platform-stand.md`.
- [ ] Runbook содержит раздел WSL.
- [ ] Runbook содержит раздел LXC.
- [ ] Runbook содержит verification checklist.
- [ ] Runbook содержит ограничения WSL и LXC.
- [ ] Runbook фиксирует рекомендуемый выбор стендов.
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
```

Только если Task 12.7 будет закрываться по факту проверки.

## Next step

```text
Подготовить docs/runbooks/bot-platform-stand.md по структуре этого spec.
```
