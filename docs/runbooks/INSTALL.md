# INSTALL: current operator host and outbound-only LXC

Этот документ описывает пошаговую установку safe test bot для текущего оператора без inbound traffic и отдельно отмечает шаги для LXC со `systemd`.

## Назначение

```text
current operator host
no inbound traffic
MAX_TRANSPORT_MODE=long_polling
safe test bot smoke check
```

## Часть A. Текущий операторский хост

### Шаг 1. Проверить среду

```bash
node --version
npm --version
```

Если версия Node.js ниже 20, установите Node.js LTS согласованным для среды способом.

### Шаг 2. Подготовить рабочую копию

Если вы уже находитесь в рабочем checkout репозитория, используйте текущую директорию.

Если checkout отсутствует:

```bash
git clone <repository-url> zabbix-max-alert-bot
cd zabbix-max-alert-bot
```

### Шаг 3. Создать локальный `.env`

```bash
cp examples/bot-platform/env.example .env
```

Проверьте, что в `.env`:

- `MAX_TRANSPORT_MODE=long_polling`;
- `MAX_BOT_TOKEN` заполнен только локально;
- `MAX_API_URL`, `MAX_HTTP_PROXY`, `MAX_LOG_LEVEL` соответствуют хосту.

### Шаг 4. Установить зависимости

Если в репозитории есть lock-файл:

```bash
npm ci
```

Если lock-файла нет:

```bash
npm install --package-lock=false
```

### Шаг 5. Проверить safe test bot в foreground

```bash
timeout 1s node src/bot-platform/app.js
```

Ожидаемый вывод:

```text
MAX bot-platform safe test service started in long_polling mode with synthetic updates
```

### Шаг 6. Проверить тесты

```bash
npm test
```

На текущем операторском хосте на этом шаге установка завершена.

## Часть B. Outbound-only LXC со `systemd`

Эти шаги применяются только на target LXC, где `systemd` доступен.

### Шаг 7. Установить systemd unit

```bash
sudo cp systemd/max-identity-bot.service /etc/systemd/system/max-identity-bot.service
sudo systemctl daemon-reload
sudo systemctl enable max-identity-bot
```

### Шаг 8. Запустить сервис

```bash
sudo systemctl start max-identity-bot
sudo systemctl status max-identity-bot --no-pager
```

### Шаг 9. Проверить журнал

```bash
journalctl -u max-identity-bot -n 50 --no-pager
```

## Примечание

На текущем operator host unit привязан к checkout в `/root/zabbix-max-alert-bot` и к локальному `node` из `nvm`.

Если вы переносите этот unit в target LXC, замените `ExecStart` на путь к `node`, который реально установлен в том контейнере.

Webhook ingress на этом этапе не поднимается.
