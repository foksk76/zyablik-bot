# Конфигурация бота — runbook (ADR-0045/0046)

Документ описывает работу с файлом конфигурации `zyablik.config.json` как
источником правды для управляемых настроек bot-platform: миграцию с `.env`,
ежедневную правку, apply/rollback, авто-откат и восстановление.

## Статус

```text
Runbook / Draft
```

## Назначение

С Sprint 37-38 файл `zyablik.config.json` — основной способ конфигурации
управляемых настроек (ADR-0045). В `.env` остаются:

```text
ZYABLIK_CONFIG            — путь к конфиг-файлу (bootstrap)
NODE_EXTRA_CA_CERTS       — сертификаты TLS для исходящих HTTPS
MAX_BOT_TOKEN             — секрет: $VAR-ссылка в файле
METRICS_API_KEY           — секрет: $VAR-ссылка в файле
SESSION_SECRET            — секрет: $VAR-ссылка в файле
IDP_CLIENT_SECRET         — секрет (IdP-регистрация, остаётся в env)
MAX_API_URL               — неизменяемая база
IDP_ISSUER / IDP_AUDIENCE / IDP_CLIENT_ID / IDP_REDIRECT_URI — неизменяемая база
```

Управляемые настройки (`bot.*`, `queue.*`, `ingress.*`, `monitor.*`,
`plugins.<name>.*`) читаются из файла. Секреты в файле — только `$VAR`-ссылки
(формат `^$[A-Z0-9_]+$`), значения подставляются из env при старте.

## 1. Миграция с .env: --generate-config

Первый запуск на новом стенде или перевод существующего `.env`-стенда:

```bash
# Просмотр, что будет записано (без записи):
node src/bot-platform/app.js --generate-config --dry-run

# Запись первого zyablik.config.json (не перезаписывает существующий):
node src/bot-platform/app.js --generate-config
```

Файл создаётся в `./config/zyablik.config.json` (если `ZYABLIK_CONFIG` не
задан) или по `ZYABLIK_CONFIG`. Секреты записываются как `$VAR`-ссылки.

Для docker-стенда:

```bash
docker compose run --rm zyablik node src/bot-platform/app.js --generate-config
```

## 2. Структура файла

```json
{
  "version": 1,
  "bot": {
    "logLevel": "info",
    "maxTransportMode": "long_polling",
    "httpProxy": "",
    "maxPollLimit": 100,
    "maxPollTimeoutSeconds": 30,
    "maxPollTypes": ["NEW_MESSAGE", "UPDATE_MESSAGE"],
    "rateLimitEnabled": true,
    "rateLimitGlobal": 25,
    "rateLimitRecipient": 5,
    "logAudit": false,
    "logTrace": true,
    "maxBotToken": "$MAX_BOT_TOKEN"
  },
  "queue": {
    "queueEnabled": false,
    "queueMaxAttempts": 5,
    "queueIntervalMs": 5000,
    "queueBatchSize": 10,
    "queueBackoffBase": 2,
    "queueBackoffMax": 300,
    "queueProcessingTtlSeconds": 300
  },
  "ingress": {
    "ingressEnabled": false,
    "ingressPort": 8443,
    "jwtClaimName": "entitlements",
    "jwtClaimValue": "zabbix"
  },
  "monitor": {
    "monitorEnabled": true,
    "monitorPort": 9000,
    "metricsApiKey": "$METRICS_API_KEY",
    "sessionSecret": "$SESSION_SECRET",
    "authRateLimit": true,
    "authRateLimitMax": 20,
    "authRateLimitWindowMs": 60000,
    "authRateConcurrency": 5,
    "idpRelaxSsrf": false,
    "idpRequireDiscovery": true
  },
  "plugins": {}
}
```

Схема и версия файла: `version: 1` (ADR-0045, `config-migrations.js`).
Поля `plugins.<name>.*` — по `configSchema` плагина (ADR-0046).

## 3. Ежедневная правка через web UI (рекомендуется)

1. Открыть dashboard: `https://<stand-host>/` (или `http://localhost:9000/`).
2. Перейти в раздел **Настройки**.
3. Изменить поля в форме (форма генерируется из merged-схемы, ADR-0046).
4. Нажать **Сохранить (staged)** — изменения записываются в
   `zyablik.config.staged.json`, показывается diff.
5. Нажать **Применить (рестарт)** — `POST /api/config/apply` (202); процесс
   рестартует. Статус опрашивается автоматически:
   `pending → confirmed` (успех) или `rolled_back` (авто-откат).

Секреты в форме не редактируются — показывается только статус
«задан / не задан».

## 4. Ручная правка файла (для продвинутых)

```bash
nano config/zyablik.config.json
# затем рестарт:
node src/bot-platform/app.js
```

Валидация при старте: JSON, `version`, схема, литеральные секреты (reject),
`$VAR`-резолв. Ошибки — в stdout/stderr; файл карантинится в
`zyablik.config.bad.json`, восстанавливается `.lkg`.

## 5. Apply / Rollback из API или UI

- **Apply** — записывает активный файл, копирует его в
  `zyablik.config.json.lkg`, ставит pending-маркер
  `zyablik.config.json.pending` (хеш), рестартует. По выходу на ready маркер
  снимается → конфиг закреплён (confirmed).
- **Rollback (ручной)** — восстанавливает `.lkg`, снимает pending-маркер,
  рестартует.

CLI:

```bash
node src/bot-platform/app.js --rollback-config
node src/bot-platform/app.js --rollback-config /path/to/zyablik.config.json
```

## 6. Авто-откат (crash recovery)

Стартовый детектор (ADR-0045) при старте проверяет два условия:

1. **Валидационный отказ** — файл не прошёл схему/version/$VAR: карантин в
   `.bad.json`, восстановление `.lkg`, старт с lkg.
2. **Pending-маркер без подтверждения** — Apply был, но процесс упал до
   ready: откат к `.lkg`, маркер снят.

Если и `.lkg` невалиден — процесс отказывается стартовать (fail loudly),
рестарт-политика (systemd `Restart=always`, docker `unless-stopped`)
ограничена, чтобы не было crash-loop.

## 7. Восстановление из резервной копии

```bash
# Свежий дамп (без литеральных секретов — $VAR-ссылки):
#  GET /api/config/export (UI: кнопка «Экспорт»)

# Восстановление на другом стенде:
cp backup.json config/zyablik.config.json
node src/bot-platform/app.js   # валидация + старт
```

При импорте файла с литеральным секретом API/UI вернёт 400 со списком полей —
заменить на `$VAR`-ссылку.

## 8. Права на ./config

Каталог `./config` — writable для процесса бота (Stage/Apply/Rollback пишут
файлы и маркеры рядом с активным конфигом). В docker volume
`./config` монтируется как host-каталог (docker-compose.yml); секреты в файл
не пишутся — только `$VAR`-ссылки. Резервное копирование каталога
(включая `.lkg`) достаточно для восстановления конфигурации.

## 9. Служебные файлы

```text
config/zyablik.config.json        — активный конфиг
config/zyablik.config.json.lkg    — last-known-good (перед apply)
config/zyablik.config.json.pending — pending-маркер (хеш применяемого)
config/zyablik.config.json.staged  — staged-снапшот (редактирование)
config/zyablik.config.json.bad.json — карантин невалидного файла
```
