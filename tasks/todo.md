# Task Checklist — Sprint 33 + 34 + 35 (Zyablik Zabbix Monitoring Template) + Sprint 36 (Nginx reverse proxy)

## Sprint 33: Шаблон Zabbix — файл + статическая валидация

- [x] **1. Discovery: смена `{#METRIC}`** — `queue.*` → `pending` (вариант X,
  2026-08-01), JSONPath `$.{#METRIC}`; поправочный ADR к ADR-0034
- [x] **2. Скелет шаблона** — `docs/zabbix-template/zyablik-monitoring-template.yaml`:
  макросы (`{$ZYABLIK.URL}`, `{$ZYABLIK.PORT}`, `{$ZYABLIK.API_KEY}` Secret,
  `{$ZYABLIK.MAX_FAILED}`, `{$ZYABLIK.BACKLOG_SEC}`), master item `summary`,
  item `/readyz`
- [x] **3. LLD rule + dependent items** — discovery rule на `/api/metrics/discovery`,
  dependent items по `{#METRIC}` с JSONPath-препроцессингом `$.{#METRIC}`
- [x] **4. Триггеры** — недоступность API (HTTP error / `/readyz` != 200),
  застой очереди (pending не падает за `{$ZYABLIK.BACKLOG_SEC}`),
  failed rate > `{$ZYABLIK.MAX_FAILED}`, рост totalAttempts/failed;
  recovery-выражения; пороги через макросы
- [x] **5. Графики** — статусы очереди по времени, backlog, failed/delivered
- [x] **6. Статический валидатор** — `tests/monitoring/zabbix-template.test.js`
  (hand-rolled, без внешних зависимостей): наличие обязательных секций,
  ключей, макросов, триггеров; отсутствие секретов

### Checkpoint: Sprint 33

- [x] `npm test` — все тесты passing (включая новый валидатор)
- [x] YAML парсится без ошибок (валидация структуры)
- [x] Все 6 метрик, readyz, триггеры и графики покрыты валидатором
- [x] Ревью с человеком перед переходом к Sprint 34

---

## Sprint 34: Docker CI + документация

- [x] **1. Docker-окружение тестового Zabbix** — `docs/zabbix-template/scripts/docker-compose.yml`
  с Zabbix server 7.2 (и при необходимости web); healthcheck готовности
- [x] **2. Скрипт импорта** — `docs/zabbix-template/scripts/import-and-verify.js`
  (или node-скрипт): импорт шаблона через Zabbix API, проверка что
  items/triggers созданы
- [x] **3. CI workflow** — `.github/workflows/zabbix-template.yml`:
  статическая валидация + Docker-импорт, кэш образа, отдельный job
  (не блокирует verify.yml)
- [x] **4. Документация** — `docs/zabbix-monitoring-template.md`: импорт,
  настройка хоста, макросы, описание триггеров и порогов
- [x] **5. ADR-0043 + обновление** — `docs/decisions/ADR-0043-*.md`,
  README.md (repo map + ADR list), INSTALL.md, docs/project-context.md,
  tasks/sprints/README.md

### Checkpoint: Sprint 34

- [x] CI green: workflow импортирует шаблон, items/triggers созданы
- [x] `npm test` — все тесты passing
- [x] Документация не противоречит README/INSTALL/ADR
- [x] ADR-0043 зафиксирован

---

## Sprint 35: Связка шаблона с живым стендом

Детали и результаты: [sprint-35.md](sprints/sprint-35.md).

- [x] **1. Живой бот на стенде** — bot-platform с `QUEUE_ENABLED`,
  `MONITOR_ENABLED`, `MONITOR_PORT=9000` (systemd `zyablik-bot-live.service`);
  `/readyz`, `/api/metrics/summary`, `/api/metrics/discovery` отвечают
- [x] **2. Хост в Zabbix с шаблоном** — `docs/zabbix-template/scripts/stand-host.js`
  (идемпотентен): «Zyablik bot stand», шаблон, host-level макросы,
  `{$ZYABLIK.API_KEY}` Secret
- [x] **3. Проверка сбора метрик** — все items supported, значения совпадают
  с `/summary`, LLD создал `zyablik.queue[...]`, триггеры OK
- [x] **4. Симуляция отказа** — stop бота → «бот недоступен» PROBLEM через
  NODATA_SEC=30s; start → RECOVERY (~51s)
- [x] **5. Документация** — раздел «Живой стенд» в
  `docs/zabbix-monitoring-template.md`, quirka закрыты регресс-тестами
  (nodata-арифметика, calculated `//key`, history для nodata)

### Checkpoint: Sprint 35

- [x] Стенд: бот жив, хост в Zabbix, items supported, триггеры OK
- [x] Отказоустойчивость: PROBLEM -> RECOVERY на живом стенде
- [x] `npm test` — все тесты passing
- [x] Ревью с человеком

---

## Final Verification

- [x] `npm test` — все тесты passing
- [x] CI: `zabbix-template.yml` green
- [x] Шаблон импортируется в тестовый Zabbix, мониторит живой/стейбный бот
- [x] Документация полная и непротиворечивая

---

## Sprint 36: Nginx reverse proxy — HTTPS для HTTP-серверов bot-platform

Детали: [sprint-36.md](sprints/sprint-36.md), ADR-0044, runbook
`docs/runbooks/nginx-reverse-proxy.md`.

- [x] **1. Установка Nginx + self-signed сертификат** — `nginx` активен,
      сертификат с SAN (DNS+IP) в `/etc/nginx/ssl/`, ключ 600
- [x] **2. Конфигурация Nginx (443, path-based)** — `conf.d/zyablik-bot.conf`:
      `listen 443 ssl http2`, `/ingest` → 8443, `/` → 9000; `nginx -t` pass;
      `curl -k https://<stand-host>/readyz` и `POST /ingest` → 200
- [x] **3. bot-platform под HTTPS** — `IDP_REDIRECT_URI=https://<stand-host>/api/auth/callback`
      (Secure cookie), dashboard по https, OAuth2 login работает
- [x] **4. Клиенты** — Zabbix Media type `IngestUrl=https://<stand-host>/ingest`,
      доверие сертификату, test send доставлен в МАХ
- [x] **5. Firewall** — снаружи только `22`/`443`, `8443`/`9000` закрыты
- [x] **6. Проверка e2e + результаты** — checklist runbook (раздел 7) пройден,
      результаты в `docs/test-runs/`

### Checkpoint: Sprint 36

- [x] `nginx -t`, readyz/ingest по HTTPS — 200
- [x] Zabbix test send по HTTPS — доставлено в МАХ
- [x] Dashboard по HTTPS: UI + OAuth2 login
- [x] Firewall: `8443`/`9000` закрыты снаружи
- [x] `npm test` — все тесты passing
- [ ] Ревью с человеком
