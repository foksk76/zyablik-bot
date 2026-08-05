# Nginx reverse proxy runbook

Документ описывает установку и настройку Nginx reverse proxy для HTTP-серверов
bot-platform на локальном стенде: ingress (`POST /ingest`) и Queue Monitor
dashboard (`/api/*`, `/readyz`, UI).

## Статус

```text
Runbook / Draft
```

## Назначение

HTTP-серверы bot-platform слушают на plain HTTP (ADR-0023, ADR-0034).
TLS-терминирование выполняется внешним reverse proxy — это зафиксированное
решение проекта (ADR-0026): `http.createServer` из stdlib не терминирует TLS,
reverse proxy — стандартный pattern для корпоративной среды.

Локальный стенд использует самоподписанный сертификат или внутренний CA
(ADR-0026:112 — «TLS-сертификат: внутренний CA или self-signed для
reverse-proxy»).

Этот runbook реализует решение ADR-0044: Nginx reverse proxy с
TLS-терминированием для HTTP-серверов бота — пререквизит «Reverse-proxy
настроен» из ADR-0026:114.

## Архитектура

```text
┌──────────────────────────────────────────────────────────────┐
│  Стенд (LXC / локальная машина)                              │
│                                                              │
│  Zabbix / SIEM / curl                                        │
│    │  HTTPS POST /ingest                                     │
│    ▼                                                         │
│  Nginx (reverse proxy)  ─── TLS-терминирование ───┐          │
│    listen 443 ssl / 8444 ssl                       │          │
│    ┌────────────────────────────┬─────────────────▼────────┐ │
│    │ location /ingest          │ location / (всё остальное) │
│    │ → http://127.0.0.1:8443   │ → http://127.0.0.1:9000    │
│    └────────────────────────────┴───────────────────────────┘ │
│    server :8444 (IdP) → http://127.0.0.1:8000                │
│                                                              │
│  bot-platform (app.js)                                       │
│    ingress        http://127.0.0.1:8443   POST /ingest       │
│    queue-monitor  http://127.0.0.1:9000   UI + /api/* + /readyz
│                                                              │
│  NanoIDP (IdP)     http://127.0.0.1:8000   (через nginx :8444)
│                                                              │
│  Оператор (браузер) → https://<stand-host>/ (dashboard UI)   │
│    вход: https://<stand-host> → https://<stand-host>:8444    │
└──────────────────────────────────────────────────────────────┘
```

### Маршрутизация

Один TLS-порт `443`, path-based маршрутизация:

| Путь | Backend | Описание |
|---|---|---|
| `POST /ingest` | `http://127.0.0.1:8443` | HTTP-ingress (ADR-0023), JWT-auth (ADR-0038) |
| `/api/metrics/*`, `/api/archive/*`, `/api/auth/*`, `/readyz`, `/` | `http://127.0.0.1:9000` | Queue Monitor dashboard (ADR-0034, ADR-0042) |
| `:8444` (весь путь) | `http://127.0.0.1:8000` | NanoIDP на том же origin (same-site вход, раздел 4.1) |

Dashboard отдаёт SPA fallback для `/` (ADR-0042), поэтому `location /`
проксируется целиком на queue-monitor — никакой логики на стороне Nginx не нужно.

### Альтернатива: раздельные TLS-порты

Если требуется разнести ingress и dashboard на разные внешние endpoint'ы —
два `server` блока на разных портах (см. Приложение A). Для локального стенда
рекомендуется path-based вариант выше.

## Требования

```text
Debian/Ubuntu-compatible OS
root или sudo
Nginx
openssl
bot-platform запущен с INGRESS_ENABLED=true и MONITOR_ENABLED=true
```

Переменные окружения bot-platform (без изменений для обратной связи с Nginx):

```text
INGRESS_ENABLED=true
INGRESS_PORT=8443            # внутренний порт ingress
MONITOR_ENABLED=true
MONITOR_PORT=9000            # внутренний порт dashboard
```

## 1. Установка Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx openssl
sudo systemctl enable --now nginx
```

Проверка:

```bash
sudo systemctl status nginx
```

## 2. Генерация самоподписанного сертификата

```bash
sudo mkdir -p /etc/nginx/ssl

sudo openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout /etc/nginx/ssl/<stand-host>.key \
  -out /etc/nginx/ssl/<stand-host>.crt \
  -subj "/CN=<stand-host>" \
  -addext "subjectAltName=DNS:<stand-host>,IP:<stand-ip>"
```

- `<stand-host>` — DNS-имя или IP, по которому стенд доступен (например,
  `bot.example.internal` или IP LXC).
- `<stand-ip>` — внутренний IP стенда (добавляется в SAN, если обращение идёт
  по IP, а не по имени).
- При использовании внутреннего CA вместо self-signed: подписать CSR CA-ом и
  положить цепочку в `/etc/nginx/ssl/`.

Права на закрытый ключ:

```bash
sudo chown root:root /etc/nginx/ssl/<stand-host>.key
sudo chmod 600 /etc/nginx/ssl/<stand-host>.key
```

## 3. Конфигурация Nginx

Файл `/etc/nginx/conf.d/zyablik-bot.conf` (Debian/Ubuntu подключает
`/etc/nginx/conf.d/*.conf` автоматически):

```nginx
# zyablik-bot reverse proxy
# TLS-терминирование для HTTP-серверов bot-platform (ADR-0026)

server {
    # Примечание: на Nginx >= 1.25 директива http2 deprecated и пишет
    # warning "the 'http2' directive is deprecated". Совместимо и работает;
    # чтобы убрать warning, используйте современную форму:
    #   listen 443 ssl;
    #   http2 on;
    listen 443 ssl http2;
    server_name <stand-host>;

    ssl_certificate     /etc/nginx/ssl/<stand-host>.crt;
    ssl_certificate_key /etc/nginx/ssl/<stand-host>.key;

    # Передача реального клиента и схемы на бэкенд (ADR-0026:86)
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Ingress: POST /ingest → bot-platform ingress (8443)
    # Тело не превышает 1 MB (DEFAULT_MAX_BODY_BYTES в http-server.js)
    location /ingest {
        proxy_pass         http://127.0.0.1:8443;
        client_max_body_size 1m;
        proxy_read_timeout 30s;
    }

    # Dashboard: UI + /api/* + /readyz → queue-monitor (9000)
    location / {
        proxy_pass         http://127.0.0.1:9000;
        client_max_body_size 1m;
        proxy_read_timeout 65s;
    }
}

# IdP (NanoIDP) на том же origin — https://<stand-host>:8444 → контейнер :8000.
# Нужен для same-site входа в дашборд: переход https-дашборд → http://<stand>:8000
# кросс-сайтовый (смена схемы), в реальном Chrome сессионная cookie IdP (Strict)
# не сохранялась → POST /authorize отвечал 400 unsupported_response_type.
server {
    listen 8444 ssl http2;
    server_name <stand-host>;

    ssl_certificate     /etc/nginx/ssl/<stand-host>.crt;
    ssl_certificate_key /etc/nginx/ssl/<stand-host>.key;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        client_max_body_size 1m;
        proxy_read_timeout 65s;
    }
}
```

Применить конфигурацию:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Настройка bot-platform

Серверы бота остаются на внутренних портах `8443` и `9000` (без изменений).
Nginx ходит на них через loopback.

### 4.1 Dashboard OAuth2 (обязательно при включённом UI login)

`IDP_REDIRECT_URI` должен указывать на публичный HTTPS-адрес:

```bash
IDP_REDIRECT_URI=https://<stand-host>/api/auth/callback
```

Это важно по двум причинам:

- ОAuth2 redirect происходит через Nginx, поэтому callback должен проходить
  через публичный URL;
- Secure-флаг session cookie выставляется по признаку
  `idpRedirectUri.startsWith('https://')` (`src/queue-monitor/index.js:71`).
  Пока `IDP_REDIRECT_URI` на `http://`, cookie не будет помечен `Secure`.

Если IdP (NanoIDP/Keycloak) валидирует redirect URI по списку, добавить
`https://<stand-host>/api/auth/callback` в зарегистрированные URI клиента
dashboard.

IdP должен отдаваться на HTTPS **того же origin**, что и дашборд. Для этого
NanoIDP проксируется через Nginx на `https://<stand-host>:8444` (server block
выше), а не живёт на `http://<stand-host>:8000` напрямую:

```bash
# .env (источник правды, ADR-0045)
IDP_ISSUER=https://<stand-host>:8444
IDP_RELAX_SSRF=true          # <stand-host> — приватный IP, SSRF-проверка (ADR-0037) блокирует его
NODE_EXTRA_CA_CERTS=/etc/nginx/ssl/zyablik-ca-bundle.crt  # русский корень + self-signed стенда
```

Почему:

- `IDP_ISSUER` обязан совпадать с `oauth.issuer` в `settings.yaml` NanoIDP
  (`https://<stand-host>:8444`) — discovery отдаёт authorize/token/jwks на этом
  же origin.
- Причина для HTTPS на том же origin: если вход уходит на
  `http://<stand-host>:8000`, браузер считает переход
  `https://<stand-host>` → `http://<stand-host>:8000` кросс-сайтовым (смена
  схемы) и в реальном Chrome сессионная cookie IdP (Strict, SameSite=Lax на
  `:8000`) не сохраняется → POST `/authorize` отвечает
  `400 unsupported_response_type`. Через `:8444` переход same-site, cookie
  работает (проверено end-to-end).
- `NODE_EXTRA_CA_CERTS` — бандл из русского корневого CA (MAX API) и
  self-signed сертификата стенда: бот ходит и к MAX API, и к IdP по HTTPS
  (token exchange, userinfo, JWKS для ingress-верификации ADR-0038).
  Собрать: `cat russian_trusted_root_ca_pem.crt <stand-host>.crt >
  zyablik-ca-bundle.crt` (файлы должны быть в LF, не CRLF — иначе PEM
  «bad end line»).
- `IDP_RELAX_SSRF=true`: discovery/token/jwks на приватном IP, а
  `assertSafeUrl` (ADR-0037) блокирует приватные адреса для https-issuer.

M2M-флоу (Zabbix → ingress, `client_credentials`) тоже ходит на
`https://<stand-host>:8444/token` и `.../jwks.json` — сервер бота валидирует
`iss`/`aud` по `IDP_ISSUER`/`IDP_AUDIENCE` (ADR-0038).

### 4.2 Привязка серверов

`http.createServer` слушает на всех интерфейсах (`server.listen(port)` без
host). Ограничение внешнего доступа к `8443`/`9000` выполняется firewall'ом
(раздел 6), а не привязкой в коде.

## 5. Настройка клиентов

### 5.1 Zabbix Media type `bot-platform-ingest.js`

Изменить параметр `IngestUrl` Media type на HTTPS-адрес через Nginx:

```text
IngestUrl: https://<stand-host>/ingest
```

Zabbix server должен доверять самоподписанному сертификату (или внутреннему
CA): добавить сертификат/CA в trust store Zabbix. Без этого `HttpRequest`
в `bot-platform-ingest.js` завершится ошибкой TLS.

Остальные параметры (`APIUrl`, `Token`, `ClientId`, `Audience`) не меняются:
JWT бот получает у IdP напрямую.

### 5.2 curl

```bash
# Readiness (без auth)
curl -k https://<stand-host>/readyz

# Ingress (Bearer-токен от IdP)
# client_id:client_secret — клиент IdP (значения задаются в .env / NanoIDP, не в репо)
TOKEN=$(curl -sk -X POST https://<stand-host>:8444/token \
  -u '<client_id>:<client_secret>' \
  -d 'grant_type=client_credentials' | jq -r '.access_token')

curl -k -X POST https://<stand-host>/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipient":{"kind":"chat","value":"<synthetic-chat-id>"},"message":"Test via nginx"}'
```

> Примечание: ingress принимает любой `recipient.kind` из `user`/`chat` и вернёт
> `200 {"status":"queued"}`, но **доставка** в МАХ произойдёт только для
> реального получателя. `<synthetic-chat-id>` не является валидным `chat_id` —
> запись уйдёт в очередь и упадёт в доставке (400 MAX API). Пример проверяет
> только транспорт ingress → очередь. Для сквозной проверки доставки
> используйте `kind:"user"` с реальным `user_id` из live-приемки (ADR-0010)
> или Zabbix Media type test send (раздел 5.1).

`-k` используется только для самоподписанного сертификата. При доверии
внутреннему CA вместо `-k` использовать `--cacert /etc/nginx/ssl/<stand-host>.crt`.

### 5.3 Dashboard (браузер)

Открыть `https://<stand-host>/` и принять самоподписанный сертификат (или
установить внутренний CA в браузер). UI работает через session cookie
(ADR-0035) — cookie будет помечен `Secure`, т.к. redirect URI на `https://`.

### 5.4 Zabbix Monitoring template (ADR-0043)

Шаблон опрашивает dashboard через HTTP Agent на
`{$ZYABLIK.URL}:{$ZYABLIK.PORT}` → `/api/metrics/*`. Если по разделу 6 порт
`9000` закрыт снаружи, шаблон переводится на HTTPS через Nginx:

```text
{$ZYABLIK.URL}:  https://<stand-host>
{$ZYABLIK.PORT}: 443
```

Доверие к сертификату — тот же trust store, что и для Media type (раздел 5.1);
без этого HTTP Agent в шаблоне завершится ошибкой TLS. Если же `9000`
остаётся доступен Zabbix-серверу (например, мониторинг с того же хоста),
шаблон можно оставить на plain HTTP.

## 6. Firewall

Внешние HTTP-порты бота `8443` и `9000` не должны быть доступны из сети — только
loopback для Nginx (и docker-сети для контейнерных клиентов — Zabbix/NanoIDP).
Снаружи открыты `443` (dashboard/ingress) и `8444` (IdP на том же origin,
раздел 4.1 — браузер ходит на него при входе).

Вариант **ufw** (если установлен):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8444/tcp
sudo ufw deny 8443/tcp
sudo ufw deny 9000/tcp
sudo ufw enable
```

> ВАЖНО: при использовании ufw вместе с Docker у подключённых контейнеров
> (published ports) нужно разрешить docker-сети во FORWARD, иначе сломаются
> NanoIDP (`8000`) и Zabbix UI (`8080`). На MVP-стенде этот хост работает на
> **nftables** без ufw, поэтому применялся вариант ниже.

Вариант **nftables** (использован на MVP-стенде; на хосте уже есть
`/etc/nftables.conf` с пустым `chain input` + Docker-цепи в отдельной
`table ip`, поэтому готовое правило не трогает Docker):

```bash
# применить вручную (без перезапуска nftables-server)
sudo nft add rule inet filter input \
    tcp dport { 8443, 9000 } ip saddr != { 127.0.0.0/8, 172.17.0.0/16, 172.20.0.0/16, 172.21.0.0/16, 172.23.0.0/16 } \
    reject with tcp reset
```

Для персистентности то же правило добавляется в `chain input` таблицы
`table inet filter` файла `/etc/nftables.conf` перед запуском Docker (Docker
цепь `ip filter` создаёт заново при старте). Проверка синтаксиса без применения
(не флашит Docker):

```bash
sudo nft -c -f /etc/nftables.conf
```

В allowed-список включаются ТОЛЬКО фактические docker-мосты стенда, а не весь
диапазон `172.16.0.0/12` (там может сидеть корпоративная сеть): контейнеры
(Zabbix server → порт `9000`, бот → NanoIDP на `8000`) продолжают ходить, но
ничего извне на `8443`/`9000` не попадает. Подсети мостов узнать так:

```bash
docker network inspect $(docker network ls -q) \
  --format '{{.Name}}: {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

При появлении нового docker-сети правило нужно дополнить её подсетью.

Проверка после применения: Nginx отвечает на `443` и `8444`, а `8443`/`9000`
недоступны с других хостов.

## 7. Проверка

Checklist:

```text
nginx -t:                            pass | fail
systemctl status nginx:              active
curl -k https://<stand-host>/readyz: 200 {"status":"ok"...}
curl -k https://<stand-host>:8444/.well-known/openid-configuration: issuer = https://<stand-host>:8444
curl -k POST https://<stand-host>/ingest (с Bearer): 200 {"status":"queued"}
Zabbix Media type test send:         доставлено в MAX
Dashboard https://<stand-host>/:     UI открывается, login через IdP работает
Zabbix Monitoring template:          /api/metrics/* отвечает через nginx (https://<stand-host>:443)
8443/9000 недоступны снаружи:        connection refused
```

Пример ожидаемого ответа `/readyz`:

```json
{"status":"ok"}
```

Пример ожидаемого ответа `/ingest`:

```json
{"status":"queued"}
```

## Известные ограничения

- **IP клиента в логах ingress.** `http-server.js:58` логирует
  `req.socket.remoteAddress` — за reverse proxy это будет `127.0.0.1`.
  `X-Forwarded-For` в текущей реализации не парсится. ADR-0026:86
  предусматривает forwarding заголовков, но парсинг на стороне бота —
  future work.
- **Самоподписанный сертификат.** Клиенты (Zabbix, curl, браузер) должны
  доверять сертификату/CA или отключать проверку. Для Zabbix самоподписанный
  сертификат требует настройки trust store — иначе доставка через `/ingest`
  падает.
- **Secure-флаг cookie** зависит от `IDP_REDIRECT_URI` (должен быть `https://`),
  а не от заголовка `X-Forwarded-Proto`.

## Security checklist

Перед commit проверить, что документ и конфигурация не содержат:

```text
реальные токены;
реальные user_id / chat_id;
внутренние IP-адреса (использовать <stand-ip>);
внутренние доменные имена (использовать <stand-host>);
значения Authorization header;
секреты в аргументах команд.
```

## Ссылки

```text
docs/decisions/ADR-0023-incoming-http-bot-platform.md
docs/decisions/ADR-0026-extend-stand-boundary-multi-source-ingress.md
docs/decisions/ADR-0034-queue-monitor-dashboard.md
docs/decisions/ADR-0042-web-interface-archive.md
docs/decisions/ADR-0044-nginx-reverse-proxy.md
docs/runbooks/bot-platform-stand.md
INSTALL.md
```

## Приложение A: раздельные TLS-порты

Если ingress и dashboard должны быть на разных внешних endpoint'ах, вместо
одного `server` блока использовать два:

```nginx
# Ingress: https://<stand-host>:443/ingest → 127.0.0.1:8443
server {
    listen 443 ssl http2;
    server_name <stand-host>;

    ssl_certificate     /etc/nginx/ssl/<stand-host>.crt;
    ssl_certificate_key /etc/nginx/ssl/<stand-host>.key;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location /ingest {
        proxy_pass           http://127.0.0.1:8443;
        client_max_body_size 1m;
    }
}

# Dashboard: https://<stand-host>:9443/ → 127.0.0.1:9000
server {
    listen 9443 ssl http2;
    server_name <stand-host>;

    ssl_certificate     /etc/nginx/ssl/<stand-host>.crt;
    ssl_certificate_key /etc/nginx/ssl/<stand-host>.key;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        proxy_pass           http://127.0.0.1:9000;
        client_max_body_size 1m;
    }
}
```

В этом варианте:
- dashboard UI и OAuth2 callback доступны по `https://<stand-host>:9443/`;
- `IDP_REDIRECT_URI=https://<stand-host>:9443/api/auth/callback`;
- для ingress остаётся `https://<stand-host>:443/ingest`;
- в firewall открываются порты `443` и `9443`.
