# Live MAX Identity Bot runbook

Документ описывает запуск live MAX Identity Bot в операторской среде или LXC после Task 18.7.

## Назначение

```text
live MAX Identity Bot
MAX_TRANSPORT_MODE=long_polling
foreground command
systemd service
logs
rollback
```

## Граница

Этот runbook относится только к live identity bot:

```text
message in MAX -> RecipientType -> To -> visible response from bot
```

Он не заменяет Zabbix Media type и не меняет `src/zabbix-media-type/max-webhook.js`.

## Перед запуском

Проверьте локальный `.env`:

- `MAX_TRANSPORT_MODE=long_polling`;
- `MAX_API_URL` заполнен для live API root; code derives `/updates` and `/messages`;
- `MAX_BOT_TOKEN` хранится только локально;
- `MAX_HTTP_PROXY` при необходимости задан локально;
- `MAX_HTTP_TIMEOUT_MS` (необязательный) — таймаут одного HTTP-вызова к MAX API в миллисекундах; по умолчанию `90000` (90s, с запасом сверх long-poll `timeout` 90s). При превышении runtime убивает child-процесс и пишет transport error с `causeCode=HTTP_TIMEOUT`;
- `MAX_LOG_LEVEL` не раскрывает секреты.

Если `MAX_TRANSPORT_MODE=webhook`, live service не стартует и вернет заглушку:

```text
Не реализовано: transport mode webhook
```

## Foreground запуск

Запуск live service из рабочей копии:

```bash
node src/bot-platform/app.js --live
```

Ожидаемый стартовый вывод:

```text
MAX bot-platform live service started in long_polling mode
```

Если нужен короткий smoke check без live network, используйте dry-run fixture:

```bash
node src/bot-platform/app.js examples/bot-platform/max-inbound-user.fixture.json
```

## systemd

Для live режима используется отдельный unit:

```text
systemd/max-identity-bot-live.service
```

Смысл разделения:

- `systemd/max-identity-bot.service` остается safe-test service;
- `systemd/max-identity-bot-live.service` запускает live entrypoint с `--live`;
- оба варианта используют локальный `.env`, но разные цели запуска;
- safe-test не должен быть неожиданно заменен live режимом.

### Установка live unit

```bash
sudo cp systemd/max-identity-bot-live.service /etc/systemd/system/max-identity-bot-live.service
sudo systemctl daemon-reload
sudo systemctl enable max-identity-bot-live
sudo systemctl start max-identity-bot-live
```

### Проверка статуса

```bash
sudo systemctl status max-identity-bot-live --no-pager
```

### Остановка

```bash
sudo systemctl stop max-identity-bot-live
```

### Логи

```bash
journalctl -u max-identity-bot-live -n 100 --no-pager
```

Для просмотра логов в реальном времени используйте `journalctl -f`:

```bash
sudo journalctl -u max-identity-bot-live -f
```

Если нужно сначала увидеть последние строки и дальше продолжить просмотр:

```bash
sudo journalctl -u max-identity-bot-live -n 100 -f
```

Остановить просмотр:

```text
Ctrl+C
```

Что смотреть во время live-проверки:

- после запуска должны появиться startup logs;
- при idle polling без входящих сообщений новых `info` строк может не быть;
- после сообщения пользователя должны появиться inbound/update logs;
- после ответа бота должен появиться outbound success log;
- при ошибке должен появиться `long polling cycle failed`, затем `long polling loop recovered from error`.

### Ожидаемые diagnostic logs

Runtime пишет в `journalctl` однострочные compact logs: одно событие — одна строка, контекст в формате `key=value`. Пустые polling-циклы не пишутся в `info`, чтобы журнал оставался пригодным для диагностики.

При нормальном live запуске в журнале должны появляться сообщения уровня `info`:

```text
live MAX Identity Bot service starting
live MAX Identity Bot service started mode=long_polling networkEnabled=true
long polling service started networkEnabled=false
received MAX inbound updates networkEnabled=true statusCode=200 updatesCount=1
prepared MAX outbound request
sent MAX outbound response networkEnabled=true statusCode=200 recipientType=user_id
long polling update processed mode=live networkEnabled=true updates=1
```

При ошибках polling или MAX API в журнале должны появляться сообщения уровня `error`:

```text
long polling cycle failed
long polling loop recovered from error
```

Error logs должны содержать безопасный технический контекст в той же строке:

```text
long polling cycle failed error="MAX API request failed" code=MAX_API_ERROR reason="transport failure" causeCode=UNABLE_TO_GET_ISSUER_CERT_LOCALLY causeMessage="unable to get local issuer certificate" causeHost=platform-api2.max.ru
```

Типовые причины:

- `details.causeCode=UNABLE_TO_GET_ISSUER_CERT_LOCALLY` или `details.causeMessage=unable to get local issuer certificate` означает проблему доверия TLS/CA: проверьте системный CA bundle, корпоративную TLS inspection proxy и переменные proxy.
- `details.causeCode=HTTP_TIMEOUT` означает, что HTTP-вызов к MAX API превысил `MAX_HTTP_TIMEOUT_MS` (по умолчанию 90s) и runtime убил child-процесс. При устойчивом повторении проверьте доступность MAX API и при необходимости увеличьте `MAX_HTTP_TIMEOUT_MS`.
- `details.causeCode=EAI_AGAIN` означает временную DNS-проблему: проверьте resolver, сеть контейнера/host и повторите запрос.
- `details.statusCode=401` или `403` означает проблему токена или доступа бота.
- `details.statusCode=429` означает rate limit.
- `details.statusCode=5xx` означает ошибку или недоступность MAX API.

Если runtime пропускает tick, потому что предыдущий cycle еще выполняется или сервис уже остановлен, появляется сообщение уровня `warn`:

```text
long polling tick skipped
```

Диагностические логи не должны содержать:

- `MAX_BOT_TOKEN`;
- `Authorization`;
- реальные `user_id` / `chat_id`;
- raw MAX payload.

## Rollback

Если live режим ведет себя не так, как ожидается:

1. Остановите live unit.
2. Проверьте логи.
3. Вернитесь к safe-test service.

Команды rollback:

```bash
sudo systemctl disable --now max-identity-bot-live
sudo systemctl enable --now max-identity-bot
```

Если нужен только локальный безопасный прогон без live API, используйте `npm test` или dry-run fixture.

## Проверка после изменения

После правок runbook или unit проверьте:

- нет реальных токенов;
- нет реальных `user_id` / `chat_id`;
- нет внутренних URL и доменных имен;
- `npm test` проходит;
- safe-test и live service не смешаны в одном unit.
