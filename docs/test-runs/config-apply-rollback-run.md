# Прогон: e2e apply/restart и авто-откат конфигурации (Sprint 41, ADR-0045)

Ручной e2e-прогон на живом стенде для подтверждающего режима конфигурации:
Apply → restart → confirmed (штатный цикл) и авто-откат к `lkg` при
неподтверждённом Apply (краш до ready).

Проверяет фикс детектора в `src/bot-platform/core/config-store.js`: свежий
pending-маркер (в окне `StartupWait`) не откатывает конфиг, старый — откатывает.

## Цель

- Apply через `POST /api/config/apply` пишет `.pending` (хеш + `appliedAt`),
  копирует активный конфиг в `.lkg`, рестарт процесса стартует с нового
  конфига, по `ready` `confirm()` снимает маркер → state=confirmed.
- Если процесс не вышел на ready в окне `StartupWait` (по умолчанию 30с),
  детектор на следующем старте откатывает активный конфиг из `lkg`.

## Параметры прогона

```text
Стенд:            <stand-host> (LXC, Debian 13)
bot-platform:     systemd zyablik-bot-live.service
Конфиг:           /root/zyablik-bot/config/zyablik.config.json (секреты — $VAR)
API:              https://<stand-host>/api/config/* (Bearer, METRICS_API_KEY)
Тестовое поле:    queue.intervalMs (5000 -> 6000 -> 5000)
```

## Порядок выполнения

### Сценарий 1: штатный Apply -> restart -> confirmed

1. `PUT /api/config/stage` — сохранить staged-конфиг с изменением
   `queue.intervalMs: 5000 -> 6000`.
2. `POST /api/config/apply` — ожидается `202`, `state=pending`,
   `pendingRemainingMs` ≈ 30000, созданы `zyablik.config.json.lkg`
   (копия старого) и `zyablik.config.json.pending` (хеш + `appliedAt`).
3. `systemctl restart zyablik-bot-live.service` — рестарт оператором
   (ADR-0045: `configRestart` не делегирован в live-режиме).
4. Проверить: сервис `active`, `GET /readyz` → 200, `GET /api/config/status`
   → `state=confirmed`, pending-маркер удалён, активный конфиг = новый
   (`intervalMs: 6000`).

### Сценарий 2: неподтверждённый Apply -> авто-откат из lkg

1. `PUT /api/config/stage` + `POST /api/config/apply` с `intervalMs: 6000`
   (активный = 6000, lkg = 5000).
2. Подменить `.pending` на «просроченный» (`appliedAt` на 10 минут в прошлом)
   — имитация процесса, не вышедшего на ready в окне StartupWait.
3. `systemctl restart zyablik-bot-live.service`.
4. Проверить: активный конфиг восстановлен из `lkg` (`intervalMs: 5000`),
   pending-маркер удалён, в журнале есть аудит `config.rollback`
   (`reason: 'предыдущий Apply не подтверждён (краш до ready)'`).

## Результат прогона 2026-08-03

```text
Сценарий 1 (Apply -> restart -> confirmed):
  PUT /api/config/stage:               200, diff: queue.intervalMs 5000 -> 6000
  POST /api/config/apply:              202 { hash: <sha256>, lkgWritten: true }
  config/zyablik.config.json:          intervalMs 6000 (новый конфиг)
  config/zyablik.config.json.lkg:      intervalMs 5000 (копия до Apply)
  config/zyablik.config.json.pending:  { hash, appliedAt } — создан
  systemctl restart:                   active, readyz 200
  GET /api/config/status:              state=confirmed, reason='apply confirmed on ready'
  pending-маркер:                      удалён
  audit:                               config.pending -> config.applied -> config.confirmed

Сценарий 2 (неподтверждённый Apply -> авто-откат):
  POST /api/config/apply:              202, active=6000, lkg=5000
  .pending подменён на просроченный:   appliedAt = -10 min
  systemctl restart:                   active, readyz 200
  config/zyablik.config.json:          intervalMs 5000 (восстановлен из lkg)
  pending-маркер:                      удалён
  audit:                               config.rollback, reason='предыдущий Apply
                                       не подтверждён (краш до ready)', auto=true

Полный возврат в исходное состояние:  active = lkg = 5000, state=idle.
```

## Что подтверждено

- Свежий pending-маркер (в окне `StartupWait`) НЕ откатывает конфиг —
  штатный Apply → restart → confirmed работает (фикс детектора).
- Просроченный pending-маркер (краш до ready) → авто-откат активного
  конфига из `lkg`; маркер и staged снимаются.
- Аудит (`config.pending`, `config.applied`, `config.confirmed`,
  `config.rollback`) пишется в журнал сервиса (ADR-0029).
- Для аудита авто-отката в `createBotPlatformApp` прокинут логгер в
  `createCore` (раньше детектор работал без логгера на стенде).

## Найденные и исправленные дефекты

1. Детектор при любом pending откатывал на `lkg` — ломал штатный
   Apply → restart. Исправлено: различие по `appliedAt` и окну
   `StartupWait` (`DEFAULT_STARTUP_WAIT_MS = 30_000`).
2. Аудит авто-отката не писался на стенде: `createBotPlatformApp` не
   передавал логгер в `createCore`. Исправлено.
3. Тесты подхватывали `config/zyablik.config.json` стенда из CWD
   (CONFIG_SECRET_VAR_UNRESOLVED). Изолировано: `tests/setup.js`
   (`node --require`) + `tests/helpers/env-no-config.js`.

## Security note

В отчет не внесены: Bearer-токен (`METRICS_API_KEY`), реальные секреты
(`$MAX_BOT_TOKEN` и пр. — в файле остаются `$VAR`-ссылками), внутренние
адреса. Хеш конфига в отчёте обезличен как `<sha256>`.

## Статус

```text
Status: done
```
