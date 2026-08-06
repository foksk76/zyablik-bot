# ADR-0044: Nginx reverse proxy для HTTP-серверов bot-platform

## Статус

Принято.

## Дата

2026-08-03

## Контекст

HTTP-серверы bot-platform слушают на plain HTTP через `http.createServer`
(Node stdlib), без TLS:

- **Ingress** — `POST /ingest`, порт `8443` (ADR-0023), JWT-аутентификация
  (ADR-0038);
- **Queue Monitor dashboard** — `/api/metrics/*`, `/api/archive/*`,
  `/api/auth/*`, `/readyz`, UI, порт `9000` (ADR-0034, ADR-0042).

ADR-0026 фиксирует TLS-терминирование внешним reverse-proxy как
пререквизит inbound-capable стенда («Почему reverse-proxy, а не terminated
TLS в bot-platform»). Однако на момент ADR-0026 reverse-proxy развёрнут
не был: в `docs/runbooks/bot-platform-stand.md:388` зафиксировано
«Reverse proxy и TLS не входят в Task 12.7».

### Проблема

При отсутствии TLS:

- JWT в заголовке `Authorization` ingress-запросов и payload уведомлений
  передаются открытым текстом;
- session cookie и Bearer-токен dashboard (`/api/metrics/*`) передаются
  открытым текстом;
- стенд остаётся без механизма безопасной публикации ingress для внешних
  источников (Zabbix, SIEM) — пререквизит ADR-0026 не реализован.

### Требования

1. TLS-терминирование перед HTTP-серверами bot-platform (ADR-0026);
2. Оба сервера (ingress `8443` и dashboard `9000`) за единым reverse-proxy;
3. Самоподписанный сертификат или внутренний CA для локального стенда
   (ADR-0026:112);
4. Без изменений в коде bot-platform: `http.createServer` остаётся plain
   HTTP, порты `8443`/`9000` не меняются;
5. Внешние HTTP-порты бота недоступны снаружи — только через reverse-proxy.

## Решение

Развернуть **Nginx reverse proxy** на локальном стенде (Debian/Ubuntu,
пакет `nginx`) с TLS-терминированием.

### Маршрутизация

Один TLS-порт `443`, path-based маршрутизация:

| Путь | Backend | Сервис |
|---|---|---|
| `POST /ingest` | `http://127.0.0.1:8443` | HTTP-ingress (ADR-0023) |
| `/api/metrics/*`, `/api/archive/*`, `/api/auth/*`, `/readyz`, `/` | `http://127.0.0.1:9000` | Queue Monitor dashboard (ADR-0034, ADR-0042) |

- Dashboard отдаёт SPA fallback для `/` (ADR-0042), поэтому `location /`
  проксируется целиком на queue-monitor — никакой логики на стороне Nginx.
- `client_max_body_size 1m` на `location /ingest` соответствует
  `DEFAULT_MAX_BODY_BYTES` (1 MB) в `src/bot-platform/ingress/http-server.js`.
- Forward-ятся заголовки `X-Forwarded-*`, `X-Real-IP`, `Host` (ADR-0026:86).

### TLS

- Самоподписанный сертификат (или внутренний CA), SAN включает DNS-имя и IP
  стенда (ADR-0026:112).
- `listen 443 ssl http2` (синтаксис совместим с Nginx 1.18+; на Nginx >= 1.25
  директива `http2` помечена deprecated — совместимо, но шумит warning'ом,
  современная форма `listen 443 ssl;` + `http2 on;`).

### Настройка bot-platform

- Серверы бота остаются на внутренних портах `8443`/`9000` без изменений.
- `IDP_REDIRECT_URI=https://<stand-host>/api/auth/callback`: OAuth2 redirect
  идёт через публичный HTTPS-адрес, а Secure-флаг session cookie выставляется
  по признаку `idpRedirectUri.startsWith('https://')`
  (`src/queue-monitor/index.js:71`). `IDP_ISSUER` не меняется — бот ходит к
  IdP напрямую.

### Клиенты

- Zabbix Media type `bot-platform-ingest.js`: `IngestUrl=https://<stand-host>/ingest`;
  Zabbix server должен доверять сертификату/CA.
- Zabbix Monitoring template (ADR-0043): HTTP Agent ходит на
  `{$ZYABLIK.URL}:{$ZYABLIK.PORT}` → `/api/metrics/*` (по умолчанию
  `http://...:9000`). Если firewall закрывает `9000` снаружи, шаблон переводится
  на `{$ZYABLIK.URL}=https://<stand-host>`, `{$ZYABLIK.PORT}=443` — запросы идут
  через nginx; доверие сертификату — тот же trust store, что для Media type.
- curl: `-k` (self-signed) или `--cacert`.
- Ограничение доступа: firewall открывает только `443`, порты `8443`/`9000`
  снаружи закрыты.

## Почему Nginx

- Reverse-proxy — зафиксированный подход ADR-0026; вариант TLS в bot-platform
  (native `tls.createServer`) уже отклонён (добавляет TLS-логику в application
  code, stdlib `http.createServer` не терминирует TLS без доработки);
- Nginx — стандарт де-факто в корпоративной среде, доступен в штатных
  репозиториях Debian/Ubuntu, конфигурация reverse-proxy минимальна;
- Один `server` блок с path-based маршрутизацией проще для локального стенда,
  чем два отдельных публичных endpoint'а.

## Рассмотренные альтернативы

### Раздельные TLS-порты (443 → ingress, 9443 → dashboard)

Два `server` блока, два публичных endpoint'а.

Минус: два внешних адреса, два firewall-правила, `IDP_REDIRECT_URI` с портом.
Оставлено как допустимый вариант конфигурации (Приложение A в runbook), но по
умолчанию принят единый `443` — для локального стенда проще. Не отклонено, а
задокументировано.

### TLS в bot-platform (`tls.createServer`)

Терминирование TLS внутри bot-platform.

Минус: уже отклонено ADR-0026 (TLS-логика в application code, обратная связь
с `X-Forwarded-*`). Не пересматривается.

### Caddy

Проще автоматический ACME-TLS.

Минус: для локального стенда с самоподписанным сертификатом преимуществ нет;
вне штатных репозиториев Debian; в корпоративной среде реже Nginx. Отклонено.

### Apache (`mod_proxy`)

Умеет reverse proxy.

Минус: конфигурация громоздче для задачи «один порт, два backend».
Отклонено.

### Без TLS (оставить plain HTTP)

Минус: JWT, session cookie и Bearer-токен открытым текстом; пререквизит
ADR-0026 не реализуется. Отклонено.

## Последствия

- Стенд становится inbound-capable по HTTPS — реализован пререквизит
  «Reverse-proxy настроен» из ADR-0026:114;
- Новый документ: `docs/runbooks/nginx-reverse-proxy.md` (установка, сертификат,
  конфигурация, проверка);
- Обновлены: `INSTALL.md` (раздел 11), `docs/zabbix-media-type.md`,
  `docs/zabbix-monitoring-template.md`, `docs/runbooks/bot-platform-stand.md`,
  `README.md`, `CHANGELOG.md`;
- При закрытии порта `9000` firewall'ом Zabbix Monitoring template (ADR-0043)
  переводится на HTTPS через nginx: `{$ZYABLIK.URL}=https://<stand-host>`,
  `{$ZYABLIK.PORT}=443` (иначе шаблон теряет метрики);
- Код bot-platform не изменяется (`http.createServer`, порты `8443`/`9000`);
- Известное ограничение: в логах ingress IP клиента будет `127.0.0.1` —
  `http-server.js:58` читает `req.socket.remoteAddress`, `X-Forwarded-For`
  пока не парсится (future work; forwarding заголовков зафиксирован ADR-0026:86);
- `IDP_REDIRECT_URI` переводится на `https://` (влияет на Secure-флаг cookie).

## Тесты

- Проверка из runbook (`docs/runbooks/nginx-reverse-proxy.md`, раздел 7):
  `nginx -t`, `curl -k https://<stand-host>/readyz`, ingest-запрос с Bearer,
  Zabbix Media type test send, недоступность `8443`/`9000` снаружи;
- `npm test` — без изменений (код не меняется);
- Изменений в CI не требуется.
