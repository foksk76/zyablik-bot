# Sprint 35: Zabbix Monitoring Template — связка с живым стендом

**Цель:** доказать, что шаблон `Zyablik monitoring` (ADR-0043) работает на
живом стенде: хост бота в Zabbix, привязка шаблона, сбор метрик через HTTP,
срабатывание и recovery триггера при отказе бота.

**Idea:** [docs/ideas/zyablik-monitoring-template-zabbix.md](../../docs/ideas/zyablik-monitoring-template-zabbix.md)
**ADR:** [ADR-0043](../../docs/decisions/ADR-0043-zabbix-monitoring-template.md)

**Контекст:** Sprint 33/34 доказали импорт шаблона в тестовый Zabbix 7.2
(Docker) и создание entities. Осталось: связать шаблон с реально работающим
ботом и убедиться, что items собираются, а триггеры реально срабатывают.

**Границы:** только локальный стенд (Docker-Zabbix + bot-platform).
Изменений в `src/` не требуется, кроме возможных мелких правок скриптов
проверки в `docs/zabbix-template/test/`.

## Architecture Decisions

- **Бот на хосте, Zabbix в Docker**: zabbix-server контейнер обращается к
  боту через IP docker bridge gateway (172.23.0.1) — `{$ZYABLIK.URL}` на
  уровне хоста, НЕ дефолт шаблона.
- **Host-level макросы**: `{$ZYABLIK.API_KEY}` задаётся только на хосте
  (Secret), в шаблоне и в репо секретов нет (AGENTS.md).
- **Проверка отказоустойчивости** — обязательна: «бот недоступен»
  (nodata) — самый наглядный e2e-сценарий PROBLEM -> RECOVERY.
- **Никаких изменений границ проекта** — стендовая связка, ADR-0043
  остаётся в силе.

## Tasks

### Task 1: Живой бот на стенде

**Status:** Done

**Description:** Запустить bot-platform в synthetic long_polling режиме с
`QUEUE_ENABLED=true` и `MONITOR_ENABLED=true`, `METRICS_API_KEY` (dev-token),
`MONITOR_PORT=9000`. Убедиться, что `GET /readyz`, `GET /api/metrics/summary`,
`GET /api/metrics/discovery` отвечают на host.

**Acceptance criteria:**
- [x] Процесс бота запущен (порт 9000), работает без падений
- [x] `/readyz` возвращает 200
- [x] `/api/metrics/summary` и `/api/metrics/discovery` возвращают 200
      с Bearer-токеном
- [x] В очереди есть данные (или очередь инициализирована)

**Фактически:** бот — systemd-юнит `zyablik-bot-live.service`
(WorkingDirectory=/root/zyablik-bot, EnvironmentFile=-/root/zyablik-bot/.env).
Перезапущен для поднятия нового кода (discovery `{#METRIC}` без префикса
`queue.*`). `METRICS_API_KEY` берётся из `.env`, не из аргументов.

**Files:** нет новых файлов в репо (dev-запуск вне репо)

**Estimated scope:** S

---

### Task 2: Хост в Zabbix с шаблоном

**Status:** Done

**Description:** Через Zabbix API создать host «Zyablik bot (stand)»,
привязать шаблон `Zyablik monitoring`, задать host-level макросы:
`{$ZYABLIK.URL}=http://172.23.0.1`, `{$ZYABLIK.PORT}=9000`,
`{$ZYABLIK.API_KEY}` (Secret, dev-token). Скрипт —
`docs/zabbix-template/test/stand-host.js` (повторный запуск идемпотентен).

**Acceptance criteria:**
- [x] Скрипт создаёт хост и привязывает шаблон (идемпотентно)
- [x] Host-level макросы созданы; `{$ZYABLIK.API_KEY}` — Secret
- [x] Нет реальных секретов в репо (dev-token из env/аргумента)
- [x] Exit code 0

**Фактически:** имя хоста без скобок — «Zyablik bot stand» (Zabbix
отвергает `()` в имени: «Incorrect characters»). Secret-макрос задаётся
через API-поле `type: 1` (параметр `secret` в Zabbix 7.2 не принимается).

**Files:** `docs/zabbix-template/test/stand-host.js` (новый)

**Estimated scope:** M

---

### Task 3: Проверка сбора метрик

**Status:** Done

**Description:** Дождаться 2-3 интервалов опроса
(`{$ZYABLIK.POLL_INTERVAL}=30` по умолчанию) и проверить через Zabbix API:
все items хост-шаблона `state=0` (supported), последние значения
заполнены, триггеры — OK. Внимание: для быстрой проверки интервал опроса
на хосте можно уменьшить (например, `{$ZYABLIK.POLL_INTERVAL}=10`).

**Acceptance criteria:**
- [x] Все items: state=0 (supported), есть lastvalue
- [x] LLD discovery создал items `zyablik.queue[{#METRIC}]`
- [x] Все триггеры в состоянии OK (нет PROBLEM)
- [x] Значения метрик совпадают с `/summary` бота

**Фактически:** проверка на хосте `Zyablik bot stand` (hostid 10673):
все items supported, dependent/LLD совпадают с `/summary`
(total=4680, delivered=4638, failed=42, totalAttempts=210), 4 триггера OK.
Найдены два quirka Zabbix — см. «Результаты».

**Estimated scope:** M

---

### Task 4: Симуляция отказа бота

**Status:** Done

**Description:** Остановить бот-процесс, дождаться
`3*{$ZYABLIK.POLL_INTERVAL}` и проверить через Zabbix API, что триггер
«Zyablik: бот недоступен» перешёл в PROBLEM (severity High). Затем
запустить бот снова и дождаться RECOVERY.

**Acceptance criteria:**
- [x] После остановки бота триггер «бот недоступен» = PROBLEM
- [x] Recovery после запуска бота (триггер вернулся в OK)
- [x] Продолжительность проблемы задокументирована

**Фактически:** `systemctl stop zyablik-bot-live.service` → PROBLEM
(High, value=1) через `{$ZYABLIK.NODATA_SEC}`=30s
(13:59:34 UTC → 14:00:03). `systemctl start` → RECOVERY (value=0) через
~4s после появления данных /readyz (14:00:54). Продолжительность ~51s.

**Estimated scope:** M

---

### Task 5: Документация и индексы

**Status:** In Progress

**Description:** Дополнить `docs/zabbix-monitoring-template.md` разделом
«Живой стенд» (как поднять бота, как завести хост, что проверено),
обновить `tasks/todo.md` и отметки спринтов.

**Acceptance criteria:**
- [x] `docs/zabbix-monitoring-template.md` — раздел про живой стенд
- [ ] `tasks/todo.md` — Sprint 35 задачи
- [ ] `npm test` — все тесты passing
- [ ] Нет секретов в репо

**Estimated scope:** S

---

## Результаты (живой стенд, 2026-08-01)

Хост: `Zyablik bot stand` (hostid 10673), шаблон `Zyablik monitoring`
(templateid 10670), группа `Zyablik` (23). Макросы хоста: URL=172.23.0.1,
PORT=9000, API_KEY=Secret, POLL_INTERVAL=10, NODATA_SEC=30.

1. **Сбор метрик:** все items state=0, значения совпадают с `/summary`
   бота; LLD создал 6 items `zyablik.queue[...]`; 4 триггера OK.
2. **Отказоустойчивость:** остановка бота → «бот недоступен» PROBLEM
   (High) через NODATA_SEC=30s; старт → RECOVERY за ~4s. Остальные
   триггеры при отказе остаются OK (зависимые items unsupported, события
   не генерируются — ожидаемо).
3. **Quirka Zabbix, найденные стендом и закрытые регресс-тестами:**
   - `nodata()` не принимает арифметику в периоде — окно вынесено в
     `{$ZYABLIK.NODATA_SEC}` (иначе импорт молча терял триггер);
   - calculated items не переписывают `/Шаблон/key` на хост при линковке
     — `zyablik.backlog` использует host-относительную форму `last(//key)`;
   - `nodata()` требует history у элемента — у `zyablik.readyz` включена
     `history: 1d` (иначе «item history is disabled», триггер не работает).

## Checkpoint: Sprint 35

- [x] Стенд: бот жив, хост в Zabbix, items supported, триггеры OK
- [x] Отказоустойчивость: PROBLEM -> RECOVERY на живом стенде
- [x] `npm test` — passing (663/663 юнит + 20/20 шаблонных)
- [ ] Ревью с человеком

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| URL из контейнера до хоста | High | Использовать gateway bridge (172.23.0.1), проверить curl из контейнера |
| Слишком долгий цикл проверки | Medium | Уменьшить `{$ZYABLIK.POLL_INTERVAL}` на хосте до 10с |
| Секреты в репо/логах | High | dev-token только в env/аргументах, Secret-макрос на хосте |

## Файлы для изменения (сводка)

```
docs/zabbix-template/test/stand-host.js      (новый)
docs/zabbix-monitoring-template.md           (модификация — живой стенд)
tasks/todo.md                                (модификация)
tasks/sprints/README.md                      (модификация — Sprint 35)
tasks/sprints/sprint-35.md                   (этот файл)
```
