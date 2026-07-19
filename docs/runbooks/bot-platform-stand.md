# Bot-platform stand runbook

Документ описывает подготовку взаимозаменяемых WSL и LXC стендов для запуска тестов и dry-run pipeline MVP `MAX Identity Bot` без подключения к реальному MAX API.

## Статус

```text
Draft / Task 12.7 runbook
```

## Назначение

Runbook нужен для воспроизводимой подготовки стенда после Task 12.6.

Оба варианта стенда считаются допустимыми для продолжения работ:

```text
WSL
LXC on Proxmox
```

Выбор конкретного стенда выполняется по доступности и удобству текущей проверки. Стенды должны быть взаимозаменяемы: один и тот же набор команд и проверок должен давать одинаковый результат на WSL и LXC.

## Общие правила

- Не подключать реальный MAX API.
- Не добавлять inbound webhook listener.
- Не добавлять outbound API client.
- Не добавлять Hubot adapter.
- Не публиковать реальный callback URL.
- Не добавлять реальные `chat_id` / `user_id`.
- Не добавлять внутренние IP-адреса или доменные имена.
- Не менять `src/zabbix-media-type/max-webhook.js`.
- Для safe test bot использовать `MAX_TRANSPORT_MODE=long_polling` и локальный `.env`.

## Общие требования

Минимально требуется:

```text
Linux-compatible shell
Git
Node.js >= 20
npm
```

Проверка версии Node.js и npm:

```bash
node --version
npm --version
```

Проект должен поддерживать проверку:

```bash
npm test
```

и эквивалентный alias:

```bash
npm run verify
```

## Вариант стенда WSL

### Назначение

WSL используется как взаимозаменяемый dev/test stand для локальной разработки, проверки документации, запуска `npm test` и dry-run pipeline.

WSL допускается использовать для продолжения работ, если обязательные проверки проходят успешно.

### Минимальные требования

```text
Windows host with WSL 2
Ubuntu/Debian-compatible WSL distribution
Git
Node.js >= 20
npm
```

### Подготовка рабочей директории

```bash
mkdir -p <project-path>
cd <project-path>
```

### Установка базовых пакетов

Для Ubuntu/Debian-compatible WSL:

```bash
sudo apt-get update
sudo apt-get install -y git ca-certificates curl
```

### Установка Node.js / npm

Использовать корпоративно согласованный способ установки Node.js.

Минимальная проверка после установки:

```bash
node --version
npm --version
```

Версия Node.js должна быть не ниже 20.

### Получение исходного кода

```bash
git clone <repository-url> zyablik-bot
cd zyablik-bot
```

Если репозиторий уже получен:

```bash
cd <project-path>/zyablik-bot
git status --short
git pull --ff-only
```

### Установка зависимостей

Если в репозитории есть lock-файл:

```bash
npm ci
```

Если lock-файла нет:

```bash
npm install
```

### Запуск тестов

```bash
npm test
```

Ожидаемый результат:

```text
fail 0
```

### Запуск dry-run pipeline

User fixture:

```bash
node <<'NODE'
const fs = require('node:fs');
const { runMaxIdentityDryRun } = require('./src/bot-platform/app');

const payload = JSON.parse(fs.readFileSync('./examples/bot-platform/max-inbound-user.fixture.json', 'utf8'));
const result = runMaxIdentityDryRun(payload);

console.log(JSON.stringify({
  mode: result.mode,
  networkEnabled: result.networkEnabled,
  kind: result.response.kind,
  recipientKind: result.response.recipient.kind,
  recipientType: result.response.zabbix.recipientType
}, null, 2));
NODE
```

Ожидаемый результат:

```json
{
  "mode": "dry-run",
  "networkEnabled": false,
  "kind": "identity",
  "recipientKind": "user",
  "recipientType": "user_id"
}
```

Chat fixture:

```bash
node <<'NODE'
const fs = require('node:fs');
const { runMaxIdentityDryRun } = require('./src/bot-platform/app');

const payload = JSON.parse(fs.readFileSync('./examples/bot-platform/max-inbound-chat.fixture.json', 'utf8'));
const result = runMaxIdentityDryRun(payload);

console.log(JSON.stringify({
  mode: result.mode,
  networkEnabled: result.networkEnabled,
  kind: result.response.kind,
  recipientKind: result.response.recipient.kind,
  recipientType: result.response.zabbix.recipientType
}, null, 2));
NODE
```

Ожидаемый результат:

```json
{
  "mode": "dry-run",
  "networkEnabled": false,
  "kind": "identity",
  "recipientKind": "chat",
  "recipientType": "chat_id"
}
```

### Ограничения WSL

- WSL зависит от настроек конкретного рабочего места.
- WSL удобен для локальной разработки и быстрых проверок.
- Для будущего inbound webhook может потребоваться отдельная настройка проброса endpoint.
- WSL не должен использоваться для хранения секретов в репозитории.
- Наличие успешного WSL-прогона достаточно для продолжения работ, если LXC временно недоступен.

## Вариант стенда LXC

### Назначение

LXC на Proxmox используется как взаимозаменяемый dev/test/integration stand для проверки MVP в более стабильной серверной среде.

LXC допускается использовать для продолжения работ, если обязательные проверки проходят успешно.

### Минимальные требования

```text
LXC container on Proxmox
Debian/Ubuntu-compatible OS
Git
Node.js >= 20
npm
Outbound access to repository source, если код забирается с Git
```

Для Task 12.7 не требуется публиковать входящий endpoint наружу.

### Подготовка ОС

```bash
sudo apt-get update
sudo apt-get install -y git ca-certificates curl
```

### Подготовка рабочей директории

```bash
mkdir -p <project-path>
cd <project-path>
```

### Установка Node.js / npm

Использовать корпоративно согласованный способ установки Node.js.

Минимальная проверка после установки:

```bash
node --version
npm --version
```

Версия Node.js должна быть не ниже 20.

### Получение исходного кода

```bash
git clone <repository-url> zyablik-bot
cd zyablik-bot
```

Если репозиторий уже получен:

```bash
cd <project-path>/zyablik-bot
git status --short
git pull --ff-only
```

### Установка зависимостей

Если в репозитории есть lock-файл:

```bash
npm ci
```

Если lock-файла нет:

```bash
npm install
```

### Запуск тестов

```bash
npm test
```

Ожидаемый результат:

```text
fail 0
```

### Запуск dry-run pipeline

User fixture:

```bash
node <<'NODE'
const fs = require('node:fs');
const { runMaxIdentityDryRun } = require('./src/bot-platform/app');

const payload = JSON.parse(fs.readFileSync('./examples/bot-platform/max-inbound-user.fixture.json', 'utf8'));
const result = runMaxIdentityDryRun(payload);

console.log(JSON.stringify({
  mode: result.mode,
  networkEnabled: result.networkEnabled,
  kind: result.response.kind,
  recipientKind: result.response.recipient.kind,
  recipientType: result.response.zabbix.recipientType
}, null, 2));
NODE
```

Ожидаемый результат:

```json
{
  "mode": "dry-run",
  "networkEnabled": false,
  "kind": "identity",
  "recipientKind": "user",
  "recipientType": "user_id"
}
```

Chat fixture:

```bash
node <<'NODE'
const fs = require('node:fs');
const { runMaxIdentityDryRun } = require('./src/bot-platform/app');

const payload = JSON.parse(fs.readFileSync('./examples/bot-platform/max-inbound-chat.fixture.json', 'utf8'));
const result = runMaxIdentityDryRun(payload);

console.log(JSON.stringify({
  mode: result.mode,
  networkEnabled: result.networkEnabled,
  kind: result.response.kind,
  recipientKind: result.response.recipient.kind,
  recipientType: result.response.zabbix.recipientType
}, null, 2));
NODE
```

Ожидаемый результат:

```json
{
  "mode": "dry-run",
  "networkEnabled": false,
  "kind": "identity",
  "recipientKind": "chat",
  "recipientType": "chat_id"
}
```

### Ограничения LXC

- Требуется доступ к Proxmox/серверному контуру.
- Для будущего inbound webhook потребуется отдельное решение по сетевой публикации endpoint.
- Для real webhook callback path должны быть определены network, DNS и ports; без этого outbound-only LXC остаётся только для `long_polling`.
- Reverse proxy и TLS не входят в Task 12.7.
- LXC не должен использоваться для хранения секретов в репозитории.
- Наличие успешного LXC-прогона достаточно для продолжения работ, если WSL временно недоступен.

### Safe test bot service

Для outbound-only LXC safe test bot запускается как `systemd` service:

```text
systemd/zyablik-bot.service
```

Сервис использует:

- локальный `.env`;
- `MAX_TRANSPORT_MODE=long_polling`;
- `src/bot-platform/app.js` как runtime entrypoint;
- synthetic MAX updates без inbound endpoint.
- Краткая установка описана в корневом `INSTALL.md`.

Ожидаемый результат запуска:

```text
MAX bot-platform safe test service started in long_polling mode
```

## Взаимозаменяемость стендов

WSL и LXC считаются взаимозаменяемыми для продолжения работ, если выполняются условия:

- используется один и тот же commit репозитория;
- Node.js версии 20 или выше;
- `npm test` завершается без ошибок;
- dry-run pipeline успешно отрабатывает на user fixture;
- dry-run pipeline успешно отрабатывает на chat fixture;
- safe test bot service starts in long_polling mode;
- dry-run result содержит `networkEnabled: false`;
- response не содержит raw event payload;
- `src/zabbix-media-type/max-webhook.js` не изменялся.

Рекомендуемый подход:

```text
Использовать любой доступный стенд, на котором проходят обязательные проверки.
```

## Verification checklist

Заполнить после фактического прогона на выбранном стенде.

```text
Stand type: WSL | LXC
Commit: <commit-sha>
Node.js: <node-version>
npm: <npm-version>
npm test: pass | fail
User fixture dry-run: pass | fail
Chat fixture dry-run: pass | fail
networkEnabled=false: pass | fail
Raw payload not exposed: pass | fail
Zabbix Webhook unchanged: pass | fail
```

## Проверка отсутствия изменений текущего Zabbix Webhook

Перед закрытием Task 12.7 проверить:

```bash
git status --short src/zabbix-media-type/max-webhook.js
```

Ожидаемый результат:

```text
<empty output>
```

Если используется сравнение с известным base commit:

```bash
git diff -- src/zabbix-media-type/max-webhook.js
```

Ожидаемый результат:

```text
<empty output>
```

## Security checklist

Перед commit проверить, что runbook и результаты проверки не содержат:

- реальные MAX bot tokens;
- реальные callback URL;
- реальные `chat_id` / `user_id`;
- внутренние IP-адреса;
- внутренние доменные имена;
- значения Authorization header;
- команды с секретами в аргументах.

Допустимые placeholders:

```text
<synthetic-user-id>
<synthetic-chat-id>
<synthetic-callback-url>
<project-path>
<repository-url>
<commit-sha>
```

## Что фиксировать после выполнения команд

После выполнения команд на WSL или LXC создать или обновить документ с результатом проверки в `docs/test-runs/`.

Минимально зафиксировать:

- тип стенда;
- commit;
- версии Node.js и npm;
- результат `npm test`;
- результат dry-run user fixture;
- результат dry-run chat fixture;
- подтверждение, что текущий Zabbix Webhook не менялся.

## Статус Task 12.7

Task 12.7 можно закрывать только после фактического выполнения verification checklist на одном из взаимозаменяемых стендов и фиксации результата.
