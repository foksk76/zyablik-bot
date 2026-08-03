# Task Checklist — Sprint 33 + 34 + 35 (Zyablik Zabbix Monitoring Template) + Sprint 36 (Nginx reverse proxy) + Sprint 37-41 (Конфигурация ADR-0045/0046)

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

---

## Sprint 37: Конфигурация (ADR-0045) — file-first ядро

Детали: [sprint-37.md](sprints/sprint-37.md), ADR-0045/0046.

- [ ] **1. Схема секций + валидатор** — `config-schema.js`: формат поля
      (type/default/required/secret/enum/min/max/nullable/description/section),
      системная схема bot/queue/ingress/monitor, hand-rolled валидатор
- [ ] **2. `loadConfig(options)`** — трёхслойный мерж defaults→файл→.env,
      секции + `plugins.<name>.*`, путь из `ZYABLIK_CONFIG`; файл главный,
      управляемые env игнорируются; без файла — дефолты+.env
- [ ] **3. `$VAR`-резолвинг** — fail-fast для секретов, warn+default
      остальных, reject литеральных значений в secret-полях
- [ ] **4. `version` + миграции** — отказ при version > current, миграции
      вверх (write-back на apply), неизвестные ключи warn+ignore
- [ ] **5. `--generate-config`** — CLI-флаг app.js, отказ при существующем
      файле, `--dry-run`; миграция .env-стенда воспроизводит поведение

### Checkpoint: Sprint 37

- [ ] `npm test` — все тесты passing (новые unit-тесты ядра)
- [ ] Миграция .env-стенда через `--generate-config` воспроизводит поведение
- [ ] Без файла процесс стартует (дефолты + .env)
- [ ] Нет литеральных секретов в сгенерированном файле

---

## Sprint 38: Конфигурация (ADR-0045) — применение и авто-откат

Детали: [sprint-38.md](sprints/sprint-38.md), ADR-0045.

- [ ] **1. Staged storage** — `zyablik.config.staged.json` (полный снапшот,
      атомарная запись, очистка после apply/rollback)
- [ ] **2. Apply** — pre-validate → lkg → атомарный write → рестарт
      (SIGTERM graceful), write-back миграции
- [ ] **3. Стартовый детектор + авто-откат** — валидационный отказ →
      карантин bad.json + lkg; pending-маркер → confirmed (StartupWait 30с);
      краш до ready → откат; краш без маркера — без отката
- [ ] **4. Ручной rollback** — восстановление lkg + рестарт + CLI-флаг
      `--rollback-config`; снятие pending-маркера
- [ ] **5. Аудит-события** — config.applied/validate_failed/pending/confirmed/
      rollback/quarantine/import (ADR-0029, без секретов)
- [ ] **6. systemd-семантика** — Restart=always + StartLimitBurst, права на
      запись `./config`

### Checkpoint: Sprint 38

- [ ] e2e на стенде: Apply → рестарт → confirmed; сломанный конфиг →
      авто-откат; ручной rollback
- [ ] Аудит без секретов; `npm test` зелёный

---

## Sprint 39: Schema-driven backend (ADR-0046) — /api/config/*

Детали: [sprint-39.md](sprints/sprint-39.md), ADR-0046.

- [ ] **1. `configSchema` плагина** — валидация в plugin-loader; identity —
      первый пример (`plugins.identity.*`), IDP-блок остаётся в env
- [ ] **2. Merged-схема** — системная + плагины, единый источник для
      валидации и форм
- [ ] **3. API: GET /api/config + /api/config/schema** — секреты только
      статус/маска; auth Bearer+session
- [ ] **4. API: stage/apply/rollback/status** — 202 + status polling,
      single-flight 409, rate limit 429
- [ ] **5. API: export/import** — export без литералов; import reject со
      списком полей

### Checkpoint: Sprint 39

- [ ] e2e: schema → stage → apply → status → rollback; import/export
- [ ] Секреты не появляются в ответах API; 409/429 работают; `npm test` зелёный

---

## Sprint 40: SettingsPage UI (ADR-0046) — динамические формы

Детали: [sprint-40.md](sprints/sprint-40.md), ADR-0046.

- [ ] **1. Просмотр effective-конфига** — секции, секреты = маска/статус
- [ ] **2. Динамический рендер форм** — из merged-схемы, tri-state для nullable
- [ ] **3. Staged-редактирование + diff перед Apply** — 202, status-опрос
- [ ] **4. Banner авто-отката** — rolled_back/pending с причиной, кнопка Rollback
- [ ] **5. Export/Import в UI** — скачивание/загрузка JSON, error path
- [ ] **6. Storybook** — обложки новых компонентов

### Checkpoint: Sprint 40

- [ ] Полный UX-флоу: просмотр → правка → diff → Apply → confirmed/rolled_back
- [ ] Секреты не видны в UI; Storybook покрыт; `npm test` зелёный

---

## Sprint 41: Интеграция, стенд и документация

Детали: [sprint-41.md](sprints/sprint-41.md), ADR-0045/0046.

- [ ] **1. docker compose** — writable volume `./config`, секреты через
      env/docker secrets, `ZYABLIK_CONFIG`
- [ ] **2. INSTALL/README/CHANGELOG/project-context** — конфиг-файл как
      основной способ, маппинг env→файл
- [ ] **3. Runbook конфигурации** — `docs/runbooks/config-file.md`; миграция
      живого стенда, результаты в `docs/test-runs/`
- [ ] **4. Policy-тесты** — секреты не в API/export/UI; `$VAR`-формат в
      конфиг-файлах
- [ ] **5. Финальный e2e** — все сценарии на стенде, чек-лист acceptance

### Checkpoint: Sprint 41

- [ ] Стенд работает из файла (без управляемых env)
- [ ] Документация непротиворечива ADR-0045/0046
- [ ] `npm test` + policy-тесты зелёные; этап закрыт
