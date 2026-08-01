# Task Checklist — Sprint 33 + Sprint 34 (Zyablik Zabbix Monitoring Template)

## Sprint 33: Шаблон Zabbix — файл + статическая валидация

- [ ] **1. Discovery: смена `{#METRIC}`** — `queue.*` → `pending` (вариант X,
  2026-08-01), JSONPath `$.{#METRIC}`; поправочный ADR к ADR-0034
- [ ] **2. Скелет шаблона** — `docs/zabbix-template/zyablik-monitoring-template.yaml`:
  макросы (`{$ZYABLIK.URL}`, `{$ZYABLIK.PORT}`, `{$ZYABLIK.API_KEY}` Secret,
  `{$ZYABLIK.MAX_FAILED}`, `{$ZYABLIK.BACKLOG_SEC}`), master item `summary`,
  item `/readyz`
- [ ] **3. LLD rule + dependent items** — discovery rule на `/api/metrics/discovery`,
  dependent items по `{#METRIC}` с JSONPath-препроцессингом `$.{#METRIC}`
- [ ] **4. Триггеры** — недоступность API (HTTP error / `/readyz` != 200),
  застой очереди (pending не падает за `{$ZYABLIK.BACKLOG_SEC}`),
  failed rate > `{$ZYABLIK.MAX_FAILED}`, рост totalAttempts/failed;
  recovery-выражения; пороги через макросы
- [ ] **5. Графики** — статусы очереди по времени, backlog, failed/delivered
- [ ] **6. Статический валидатор** — `tests/monitoring/zabbix-template.test.js`
  (hand-rolled, без внешних зависимостей): наличие обязательных секций,
  ключей, макросов, триггеров; отсутствие секретов

### Checkpoint: Sprint 33

- [ ] `npm test` — все тесты passing (включая новый валидатор)
- [ ] YAML парсится без ошибок (валидация структуры)
- [ ] Все 6 метрик, readyz, триггеры и графики покрыты валидатором
- [ ] Ревью с человеком перед переходом к Sprint 34

---

## Sprint 34: Docker CI + документация

- [ ] **1. Docker-окружение тестового Zabbix** — `docs/zabbix-template/test/docker-compose.yml`
  с Zabbix server 7.2 (и при необходимости web); healthcheck готовности
- [ ] **2. Скрипт импорта** — `docs/zabbix-template/test/import-and-verify.js`
  (или node-скрипт): импорт шаблона через Zabbix API, проверка что
  items/triggers созданы
- [ ] **3. CI workflow** — `.github/workflows/zabbix-template.yml`:
  статическая валидация + Docker-импорт, кэш образа, отдельный job
  (не блокирует verify.yml)
- [ ] **4. Документация** — `docs/zabbix-monitoring-template.md`: импорт,
  настройка хоста, макросы, описание триггеров и порогов
- [ ] **5. ADR-0043 + обновление** — `docs/decisions/ADR-0043-*.md`,
  README.md (repo map + ADR list), INSTALL.md, docs/project-context.md,
  tasks/sprints/README.md

### Checkpoint: Sprint 34

- [ ] CI green: workflow импортирует шаблон, items/triggers созданы
- [ ] `npm test` — все тесты passing
- [ ] Документация не противоречит README/INSTALL/ADR
- [ ] ADR-0043 зафиксирован

---

## Final Verification

- [ ] `npm test` — все тесты passing
- [ ] CI: `zabbix-template.yml` green
- [ ] Шаблон импортируется в тестовый Zabbix, мониторит живой/стейбный бот
- [ ] Документация полная и непротиворечивая
