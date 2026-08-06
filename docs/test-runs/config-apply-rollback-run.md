# Прогон: e2e apply/restart и авто-откат конфигурации (Sprint 41, ADR-0045)

Ручной e2e-прогон на живом стенде для подтверждающего режима конфигурации:
Apply → restart → confirmed (штатный цикл), авто-откат к `lkg` при
неподтверждённом Apply (краш до ready), ручной rollback, export/import и
UI-флоу через Dashboard (ADR-0046).

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
Dashboard:        https://<stand-host>/#/settings (OAuth2, IdP — NanoIDP, user admin)
Тестовое поле:    queue.intervalMs (5000 -> 6000 -> 5000 -> 8000 -> 5000)
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

### Сценарий 3: ручной rollback (POST /api/config/rollback)

1. `PUT /api/config/stage` + `POST /api/config/apply` + рестарт + confirmed
   (`intervalMs: 6000`, активный = 6000, lkg = 5000).
2. `POST /api/config/rollback` — ожидается `202 { restoredFrom: 'lkg' }`,
   `state=rolled_back` (без рестарта процесса — файл возвращается из lkg).
3. Проверить: активный `intervalMs: 5000`, в журнале аудит `config.rollback`
   (`reason: 'manual rollback'`).

### Сценарий 4: export/import (POST /api/config/import, GET /api/config/export)

1. `GET /api/config/export` — активный конфиг, секреты остаются `$VAR`-ссылками
   (не резолвленными значениями).
2. `POST /api/config/import` с литеральным секретом → `400` (режект).
3. `POST /api/config/import` с валидным конфигом (`intervalMs: 7000`) → `200`,
   конфиг становится staged + diff.

### Сценарий 5: UI-флоу (Dashboard, #/settings)

1. Вход через IdP (NanoIDP): `admin/admin` → редирект на `#/dashboard`.
2. Переход на `#/settings`: форма со schema-driven полями, секреты показаны
   маской (статус `задан`/`не задан`), кнопки «Сохранить (staged)»,
   «Применить (рестарт)», «Откатить».
3. Изменить `queue.intervalMs: 5000 -> 8000` → «Сохранить (staged)» → дифф
   показан (queue.intervalMs 5000 -> 8000).
4. «Применить (рестарт)» → 202 «Применение запущено — ожидается перезапуск»;
   `systemctl restart` оператором → `state=confirmed`, `intervalMs: 8000`,
   секреты активного файла сохранены.
5. «Откатить» → подтверждение → `state=rolled_back`, `intervalMs: 5000`,
   секреты сохранены.

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

Сценарий 3 (ручной rollback):
  PUT stage + POST apply (6000):       202, active=6000, lkg=5000
  systemctl restart:                   confirmed
  POST /api/config/rollback:           202 { restoredFrom: 'lkg' }
  GET /api/config/status:              state=rolled_back, reason='manual rollback'
  config/zyablik.config.json:          intervalMs 5000 (без рестарта)
  audit:                               config.rollback, reason='manual rollback'

Сценарий 4 (export/import):
  GET /api/config/export:              секреты — $VAR-ссылки (не резолвлены)
  import с литеральным секретом:       400 CONFIG_VALIDATION_ERROR (maxBotToken)
  import валидный (7000):              200, staged + diff queue.intervalMs 5000->7000

Сценарий 5 (UI-флоу Dashboard):
  Вход admin/admin:                    редирект на #/dashboard (сессия)
  #/settings:                          форма, секреты маской, intervalMs=5000
  stage 5000->8000:                    «Изменения сохранены (staged)», дифф показан
  apply:                               «Применение запущено — ожидается перезапуск»
  systemctl restart:                   active, readyz 200, state=confirmed
  активный после Apply:                intervalMs 8000, секреты $VAR сохранены
  rollback из UI:                      state=rolled_back, intervalMs 5000,
                                       секреты $VAR сохранены

Полный возврат в исходное состояние:  active = lkg = 5000, state=idle.
```

## Что подтверждено

- Свежий pending-маркер (в окне `StartupWait`) НЕ откатывает конфиг —
  штатный Apply → restart → confirmed работает (фикс детектора).
- Просроченный pending-маркер (краш до ready) → авто-откат активного
  конфига из `lkg`; маркер и staged снимаются.
- Ручной rollback (`POST /api/config/rollback`) восстанавливает `lkg`
  без рестарта процесса; `state=rolled_back`.
- Export не раскрывает значения секретов (остаются `$VAR`-ссылками);
  import режектит литеральные секреты и создаёт staged + diff.
- UI-флоу Dashboard (#/settings): stage → apply → restart → confirmed →
  rollback; секреты активного файла сохраняются при частичном обновлении.
- Аудит (`config.stage`, `config.pending`, `config.applied`, `config.confirmed`,
  `config.rollback`, `config.import`) пишется в журнал сервиса (ADR-0029).
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
4. **Apply через UI/import затирал секретные `$VAR`-поля**: UI-модель
   принципиально не отправляет секреты (`buildStagedConfig` пропускает
   `field.secret`), а `applyConfig` писал staged поверх активного файла —
   секреты терялись, сервис не стартовал (для `METRICS_API_KEY`).
   Исправлено: `mergePreservedSecrets` в `config-store.js` переносит
   `$VAR`-ссылки секретов из активного конфига при stage/import/apply
   (применяется до pre-validate, литералы по-прежнему режектятся).
   Добавлены тесты в config-store.test.js и queue-monitor/api/config.test.js.

## Security note

В отчет не внесены: Bearer-токен (`METRICS_API_KEY`), реальные секреты
(`$MAX_BOT_TOKEN` и пр. — в файле остаются `$VAR`-ссылками), внутренние
адреса. Хеш конфига в отчёте обезличен как `<sha256>`. Учётные данные
тестового IdP (NanoIDP, user `admin`) — стендовые, не боевые.

## Статус

```text
Status: done
```
