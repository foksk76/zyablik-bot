# Прогон: Nginx reverse proxy для bot-platform (Sprint 36, ADR-0044)

Ручная e2e-проверка HTTPS-входа на стенде через Nginx reverse proxy.
Запускается после Tasks 1-5 спринта 36 (`tasks/sprints/sprint-36.md`).

## Цель

Проверить, что HTTP-серверы bot-platform (`8443` ingress, `9000` dashboard)
доступны снаружи только через Nginx по `443`/HTTPS, внутренние порты закрыты
firewall'ом, а Zabbix Media type доставляет уведомления через HTTPS.

## Что проверяем

- Nginx: `listen 443 ssl`, path-based: `/ingest` → `127.0.0.1:8443`,
  `/` (dashboard) → `127.0.0.1:9000`.
- bot-platform: `IDP_REDIRECT_URI` на HTTPS, session cookie `Secure`.
- Клиенты: Zabbix Media type `IngestUrl=https://<stand-host>/ingest`,
  доверие к самоподписанному CA, test send доставлен в МАХ.
- Firewall: `8443`/`9000` недоступны снаружи (reject), loopback и docker-сети
  работают.

## Параметры прогона

```text
Стенд:            <stand-host> (LXC, Debian 13), IP <stand-ip>
Nginx:            1.26.3
bot-platform:     systemd zyablik-bot-live.service
IdP:              NanoIDP (docker), порт 8000
Zabbix:           docker test_zabbix, UI на 8080
Сертификат:       /etc/nginx/ssl/<stand-host>.{crt,key} (self-signed, SAN: IP+DNS)
Медиа тип:        MAX (bot-platform), id 101, webhook
Получатели:       тестовые user_id из live-приемки (ADR-0010)
```

## Порядок выполнения

1. `nginx -t` и `systemctl reload nginx`.
2. `curl -k https://<stand-host>/readyz` — ожидается `200 {"status":"ok"}`.
3. Получить JWT из IdP (`client_credentials`, Basic auth) и выполнить
   `POST /ingest` через nginx с Bearer-токеном — ожидается `200 {"status":"queued"}`.
4. Открыть dashboard `https://<stand-host>/` — UI и login-редирект на IdP.
5. Zabbix Media type: test send через `https://<stand-host>/ingest`.
6. Firewall: проверить, что `8443`/`9000` с внешнего источника дают
   `connection refused`, loopback и docker-сети доступны.
7. Проверить доставку в МАХ по журналу bot-platform и `delivery-queue.db`.

## Результат прогона 2026-08-03

```text
nginx -t:                            pass
systemctl status nginx:              active
curl -k https://<stand-ip>/readyz:
                                     200 {"status":"ok"}
POST /ingest (JWT из IdP, через nginx):
                                     200 {"status":"queued"} -> доставлено (id 5090)
Dashboard https://<stand-ip>/:
                                     HTTP 200 (UI открывается)
OAuth2 login:                        redirect на http://<stand-ip>:8080/authorize
                                     с redirect_uri=https://<stand-ip>/api/auth/callback
Session cookie Secure:               true (secure = idpRedirectUri.startsWith('https://'))
Zabbix Media type test send:         success ("Media type test successful", Response: OK),
                                     доставлено в МАХ (id 5089)
Firewall 8443/9000 снаружи:          connection refused (RST)
Firewall loopback 127.0.0.1:8443/9000:
                                     open (nginx-прокси работает)
Firewall docker-сеть (Zabbix -> 9000):
                                     401 (TCP доступен, авторизация как ожидается)
Zabbix Monitoring template HTTPS:    /api/metrics/* отвечает через nginx
npm test:                            688 pass / 0 fail
```

## Что подтверждено

- Внешний вход на оба сервера bot-platform — только через Nginx по `443`.
- Авторизация ingress по JWT (ADR-0038) работает сквозь nginx.
- Zabbix доверяет самоподписанному CA (trust store) — test send без ошибок TLS.
- Firewall изолирует внутренние порты, не разрывая docker-сети
  (NanoIDP, Zabbix container).
- Доставка Zabbix -> МАХ подтверждена реальными строками `delivered`
  в `delivery-queue.db`.

## Security note

В отчет не внесены: токены (в т.ч. JWT, client secret), реальные
авторизационные значения и идентификаторы получателей в открытом виде.
Данные получателей обезличены как «тестовые user_id».

## Статус

```text
Status: done
```
