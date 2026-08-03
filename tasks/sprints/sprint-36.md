# Sprint 36: Nginx reverse proxy — HTTPS для HTTP-серверов bot-platform

**Цель:** развернуть на локальном стенде Nginx reverse proxy с
TLS-терминированием (ADR-0044): ingress `POST /ingest` и Queue Monitor
dashboard доступны по HTTPS (порт 443), внутренние порты `8443`/`9000`
закрыты firewall'ом, клиенты (Zabbix Media type, curl, браузер) работают
через HTTPS.

**ADR:** [ADR-0044](../../docs/decisions/ADR-0044-nginx-reverse-proxy.md)
(создан 2026-08-03; в этом спринте — развёртывание на стенде)
**Runbook:** [docs/runbooks/nginx-reverse-proxy.md](../../docs/runbooks/nginx-reverse-proxy.md)
**Idea:** [docs/ideas/multi-source-ingest.md](../../docs/ideas/multi-source-ingest.md)
(открытые вопросы по TLS-терминированию — закрыты ADR-0026/ADR-0044)

**Контекст:** ADR-0026 зафиксировал TLS-терминирование внешним reverse-proxy
как пререквизит inbound-capable стенда. Документация готова: runbook,
ADR-0044, обновлены INSTALL.md, docs/zabbix-media-type.md, CHANGELOG.md.
Осталось фактически развернуть Nginx на стенде и проверить e2e-путь по
HTTPS.

**Границы:** только локальный стенд (LXC). Код в `src/` не меняется
(`http.createServer`, порты `8443`/`9000`). Изменения — инфраструктура
стенда (вне репо), при необходимости мелкие правки документации,
результаты в `docs/test-runs/`.

## Architecture Decisions

- **Единый TLS-порт `443`, path-based маршрутизация** — `POST /ingest` →
  `http://127.0.0.1:8443`, всё остальное (`/api/*`, `/readyz`, `/`) →
  `http://127.0.0.1:9000` (ADR-0044).
- **Самоподписанный сертификат** (или внутренний CA) для локального стенда —
  ADR-0044, ADR-0026:112. SAN включает DNS-имя и IP.
- **Серверы бота без изменений**: plain HTTP на `8443`/`9000`, снаружи
  закрыты firewall'ом (внешние порты не экспонируются — ADR-0026:81).
- **`IDP_REDIRECT_URI=https://<stand-host>/api/auth/callback`** — влияет на
  Secure-флаг session cookie (`src/queue-monitor/index.js:71`).
- **Клиенты**: Zabbix Media type `IngestUrl=https://<stand-host>/ingest` +
  trust store; curl `-k`/`--cacert`.

## Tasks

### Task 1: Установка Nginx и self-signed сертификат

**Status:** Done

**Description:** Установить `nginx` на стенд, сгенерировать самоподписанный
сертификат с SAN (DNS-имя + IP стенда), положить в `/etc/nginx/ssl/`, права
на закрытый ключ `600`.

**Acceptance criteria:**
- [x] `nginx` установлен и активен (`systemctl status nginx` = active)
- [x] Сертификат в `/etc/nginx/ssl/<stand-host>.{crt,key}`, SAN: `DNS:<stand-host>`, `IP:<stand-ip>`
- [x] Ключ: владелец root, режим 600

**Files:** инфраструктура стенда (вне репо); шаги зафиксированы в runbook
(разделы 1-2)

**Estimated scope:** S

---

### Task 2: Конфигурация Nginx (443, path-based)

**Status:** Done

**Description:** Создать `/etc/nginx/conf.d/zyablik-bot.conf`: `listen 443 ssl
http2`, `location /ingest` → `http://127.0.0.1:8443`, `location /` →
`http://127.0.0.1:9000`, `client_max_body_size 1m`, forward `X-Forwarded-*`
заголовков. Прогнать `nginx -t` и reload.

**Acceptance criteria:**
- [x] `nginx -t` — без ошибок, `systemctl reload nginx` выполнен
- [x] `curl -k https://<stand-host>/readyz` → `200` (`{"status":"ok"}`)
- [x] `curl -k -X POST https://<stand-host>/ingest` с Bearer-токеном → `200` (`{"status":"queued"}`)

**Files:** `/etc/nginx/conf.d/zyablik-bot.conf` (стенд); конфиг из runbook
(раздел 3)

**Dependencies:** Task 1

**Estimated scope:** M

---

### Task 3: bot-platform под HTTPS (IDP_REDIRECT_URI)

**Status:** Done

**Description:** В `.env` bot-platform перевести `IDP_REDIRECT_URI` на
`https://<stand-host>/api/auth/callback`, перезапустить бота, проверить
dashboard по HTTPS и login через IdP.

**Acceptance criteria:**
- [x] `.env`: `IDP_REDIRECT_URI=https://<stand-host>/api/auth/callback`
- [x] Бот перезапущен, `/readyz` через nginx отвечает 200
- [x] Dashboard UI открывается по `https://<stand-host>/`, OAuth2 login
      работает, session cookie помечен `Secure`

**Files:** `.env` bot-platform (стенд, вне репо)

**Dependencies:** Task 2

**Estimated scope:** S

---

### Task 4: Клиенты (Zabbix Media type + trust)

**Status:** Done

**Description:** В Zabbix Media type `bot-platform-ingest.js` перевести
`IngestUrl` на `https://<stand-host>/ingest`, настроить доверие к
самоподписанному сертификату (trust store Zabbix), выполнить test send.

**Acceptance criteria:**
- [x] `IngestUrl: https://<stand-host>/ingest` в Media type
- [x] Zabbix доверяет сертификату/CA — нет ошибок TLS в логах
- [x] Test send → `200`, сообщение доставлено в МАХ

**Files:** конфигурация Media type на Zabbix (вне репо); при необходимости
правка `docs/zabbix-media-type.md`

**Dependencies:** Task 2

**Estimated scope:** M

---

### Task 5: Firewall и изоляция внутренних портов

**Status:** Done

**Description:** Настроить firewall стенда: снаружи открыты только `22`/`443`,
внутренние порты `8443`/`9000` закрыты. Проверить, что бот по-прежнему
работает через nginx.

**Acceptance criteria:**
- [x] Снаружи доступен только `443` (и `22`) — применительно к HTTP-портам
      bot-platform; отдельно опубликованные сервисы NanoIDP (`8000`) и Zabbix UI
      (`8080`) не входят в scope ADR-0044 и остаются доступными
- [x] `8443`/`9000` с других хостов: connection refused
- [x] `curl https://<stand-host>/readyz` с доверяющего хоста работает

**Notes:** firewall на стенде — nftables (без ufw). Правило
`tcp dport { 8443, 9000 } ip saddr != { 127.0.0.0/8, 172.16.0.0/12 } reject
with tcp reset` добавлено в `chain input` таблицы `inet filter`
(`/etc/nftables.conf`). Loopback и docker-сети (Zabbix server → 9000) не
разрываются.

**Files:** firewall стенда (вне репо); правила из runbook (раздел 6)

**Dependencies:** Task 2 (можно параллельно с Task 3-4)

**Estimated scope:** S

---

### Task 6: Проверка e2e и фиксация результатов

**Status:** Done

**Description:** Пройти checklist из runbook (раздел 7), зафиксировать
результаты в `docs/test-runs/`, обновить `tasks/todo.md` и отметки спринтов.

**Acceptance criteria:**
- [x] Checklist runbook (раздел 7) пройден полностью
- [x] Результаты в `docs/test-runs/` (стенд, версии, ответы, даты)
- [x] `npm test` — все тесты passing
- [x] Нет секретов в репо

**Files:** `docs/test-runs/<файл-результатов>`, `tasks/todo.md`,
`tasks/sprints/README.md`, `tasks/sprints/sprint-36.md`

**Dependencies:** Tasks 3-5

**Estimated scope:** S

---

## Checkpoint: Sprint 36

- [x] `nginx -t`, `curl -k https://<stand-host>/readyz` и `/ingest` — 200
- [x] Zabbix Media type test send по HTTPS — доставлено в МАХ
- [x] Dashboard по HTTPS: UI открывается, OAuth2 login работает
- [x] Firewall: `8443`/`9000` закрыты снаружи
- [x] `npm test` — passing
- [ ] Ревью с человеком

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Self-signed сертификат: доверие клиентов | High | trust store Zabbix, curl `-k`/`--cacert`, внутренний CA (ADR-0026:112) |
| Порт `443` занят / нет прав | Medium | альтернативные порты — Приложение A runbook |
| Забыт `IDP_REDIRECT_URI` → cookie без `Secure` | Medium | чек-лист runbook (раздел 4.1), ADR-0044 |
| IP клиента в логах ingress = 127.0.0.1 | Low | ограничение задокументировано; парсинг `X-Forwarded-For` — future work |

## Файлы для изменения (сводка)

```
docs/runbooks/nginx-reverse-proxy.md          (создан — ADR-0044)
docs/decisions/ADR-0044-nginx-reverse-proxy.md  (создан)
docs/zabbix-media-type.md                     (обновлён — IngestUrl HTTPS)
docs/zabbix-monitoring-template.md            (обновлён — HTTPS-вариант {$ZYABLIK.URL}/{$ZYABLIK.PORT})
INSTALL.md                                    (обновлён — раздел 10)
README.md                                     (обновлён — ADR-0044, runbook)
docs/runbooks/bot-platform-stand.md           (обновлён — ссылка на runbook)
CHANGELOG.md                                  (обновлён — Changed: HTTPS через nginx)
docs/test-runs/task-36-nginx-reverse-proxy-run.md  (новый — результаты прогона)
tasks/todo.md                                 (модификация — Sprint 36)
tasks/sprints/README.md                       (модификация — Sprint 36)
tasks/sprints/sprint-36.md                    (этот файл)
```
