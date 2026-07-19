# ADR-0031: Пре-продакшн: лицензия Apache-2.0, бренд «Зяблик», полный ренейминг в zyablik-bot

## Статус

Принято.

## Дата

2026-07-19

## Контекст

Проект не имеет лицензии. Техническое имя `zabbix-max-alert-bot` описывает
только Zabbix-кейс, хотя проект расширяется до multi-source платформы
(ADR-0022). Нет визуальной идентичности для получателей уведомлений.
Логотип готов, но не загружен в репо.

Проект планируется как публичный open source. Репо сейчас приватный на
GitHub. Правообладатель — физическое лицо (Kirill Fomichev).

Пре-продакшн эксплуатация бота в корпоративной сети запускается на весь
отдел. Первый источник уведомлений — Zabbix как дубликат Telegram.
Перед запуском нужен бренд (имя «Зяблик/Zyablik» для получателей),
лицензия и техническое имя, соответствующее multi-source платформе.

### Юридический контекст

| Юрисдикция | Релевантные нормы |
|---|---|
| **РФ** | ГК РФ ч.4 (ст.1225-1272): авторское право на ПО. Ст.1271: указание имени автора в экземпляре. 44-ФЗ/223-ФЗ: закупки ПО. Приказ Минцифры 28.12.2023: реестр российского ПО |
| **EU** | EU Cyber Resilience Act (CRA): Art.12(1) освобождает open source от требований безопасности. DSGVO/GDPR: обработка ПДн (user_id, chat_id) |
| **US** | Copyright Act: защита ПО. Jacobsen v. Katzer (2008): enforceability open source лицензий. EAR: экспортный контроль (не применяется к базовым инструментам) |

## Решение

Три компонента — один ADR, один PR, один этап.

### 1. Лицензия Apache-2.0

Два файла: `LICENSE` (английский) и `LICENSE.ru` (официальный перевод
Apache-2.0 Foundation). Русская версия необходима для юридической
определённости в РФ.

**Почему Apache-2.0:**

| Альтернатива | Почему отклонена |
|---|---|
| MIT | Нет патентной защиты (Art.3 Apache-2.0). Для публичного open source от физического лица — insurance от patent trolls |
| GPL-3.0 | Copyleft отпугивает корпоративных пользователей, которые хотят форкнуть и адаптировать под себя |
| Без лицензии (текущее) | All rights reserved. Никто не имеет права использовать код даже внутри организации |
| Лицензия МТ3 | Российская версия MIT, но менее известна за пределами РФ. Apache-2.0 — международный стандарт |

**Совместимость с зависимостями:** jose (MIT), @okta/jwt-verifier (ISC),
better-sqlite3 (MIT) — все совместимы с Apache-2.0.

**Оформление:**
- `LICENSE`: `Copyright 2026 Kirill Fomichev` + текст Apache-2.0
- `LICENSE.ru`: официальный перевод Apache-2.0 Foundation
- `package.json`: `"license": "Apache-2.0"`
- SPDX-header `// SPDX-License-Identifier: Apache-2.0` во всех `.js` файлах
- `CONTRIBUTING.md`: grant-строка для контрибьюторов

### 2. Полный ренейминг в `zyablik-bot`

Техническое имя `zabbix-max-alert-bot` описывает только Zabbix-кейс.
Название `zyablik-bot` — нейтральное, подходит для multi-source платформы
(ADR-0022). Ренейминг до публикации проще, чем после — нет внешних
ссылок, которые нужно перенаправлять.

**Что переименовывается:**

| Контекст | Было | Стало |
|---|---|---|
| Репозиторий | `zabbix-max-alert-bot` | `zyablik-bot` |
| package.json `name` | `zabbix-max-alert-bot` | `zyablik-bot` |
| README heading | `Zabbix MAX Alert Bot` | `Зяблик / Zyablik` |
| docs/project-context.md | `Zabbix MAX Alert Bot` | `Zyablik Bot` |
| .agents/ project-context | `Zabbix MAX Alert Bot` | `Zyablik Bot` |
| systemd сервисы | `max-identity-bot.service` | `zyablik-bot.service` |
| systemd live-сервис | `max-identity-bot-live.service` | `zyablik-bot-live.service` |
| INSTALL.md | `git clone zabbix-max-alert-bot` | `git clone zyablik-bot` |
| CONTRIBUTING.md | ссылки | обновить |
| AGENTS.md | структура репо | обновить |
| docs/runbooks/ | `max-identity-bot` | `zyablik-bot` |
| CI workflows | если ссылаются на имя | обновить |

### 3. Бренд «Зяблик/Zyablik»

Пользовательская идентичность для получателей уведомлений. Имя «Зяблик» —
нейтральное, запоминающееся, не привязано к конкретному источнику
уведомлений.

**Что добавляется:**
- PNG логотип в `docs/assets/zyablik-logo.png`
- README.md: логотип в шапке, описание «Зяблик — бот-получатель уведомлений в MAX»
- bot display name в MAX: «Зяблик» (пометка в доках)

### 4. ADR-0031

Этот ADR.

## Альтернативы

### Частичный ренейминг (только репо + пакет)

Минус: доки и systemd-сервисы остаются со старыми именами. Получатели
видят «Зяблик», но INSTALL.md говорит `git clone zabbix-max-alert-bot`.
Непоследовательность. Отклонено.

### Пользовательский бренд без ренейминга

Минус: техническое имя `zabbix-max-alert-bot` привязано к Zabbix.
Проект расширяется до multi-source платформы (ADR-0022). Имя будет
вводить в заблуждение. Отклонено.

### Ренейминг после публикации

Минус: после публикации появятся внешние ссылки, fork'и, упоминания.
Ренейминг потребует редиректов, миграции, коммуникации. До публикации —
ноль внешних зависимостей. Отклонено.

### MIT вместо Apache-2.0

Минус: нет патентной защиты. Для публичного open source от физического
лица — риск patent trolls. Отклонено.

### GPL-3.0 вместо Apache-2.0

Минус: copyleft обязывает forks быть GPL. Корпоративные пользователи
не смогут адаптировать под себя без публикации своего кода. Для
инфраструктурного инструмента это барьер. Отклонено.

### Лицензия МТ3 вместо Apache-2.0

Минус: менее известна за пределами РФ. Apache-2.0 — международный
стандарт, SPDX-рекомендуемая для CRA. Отклонено.

## Последствия

### Новые файлы

| Файл | Описание |
|---|---|
| `LICENSE` | Текст Apache-2.0, `Copyright 2026 Kirill Fomichev` |
| `LICENSE.ru` | Официальный перевод Apache-2.0 на русский |
| `docs/assets/zyablik-logo.png` | Логотип проекта |
| `docs/decisions/ADR-0031-preprod-brand-license-rename.md` | Этот ADR |

### Изменённые файлы

| Файл | Изменение |
|---|---|
| `package.json` | `name` → `zyablik-bot`, добавлен `"license": "Apache-2.0"` |
| `README.md` | Заголовок, логотип, badge лицензии, секция License |
| `CONTRIBUTING.md` | Grant-строка Apache-2.0 |
| `AGENTS.md` | Структура репо, техническое имя |
| `docs/project-context.md` | Название проекта |
| `.agents/project-context.md` | Название проекта |
| `INSTALL.md` | `git clone` URL |
| `systemd/*.service` | Имена сервисов |
| `docs/runbooks/*.md` | Ссылки на сервисы |
| `.github/workflows/*.yml` | Если ссылаются на имя репо |
| Все `src/**/*.js` (~25 файлов) | SPDX-header |

### Не затронуто

- `src/` логика — без изменений
- `tests/` — без изменений (тесты не зависят от имени пакета)
- `package-lock.json` — перегенерируется автоматически
- `CHANGELOG.md` — обновится при следующем релизе

### Ожидаемый результат

- `npm test` проходит без ошибок
- Проект имеет лицензию Apache-2.0 во всех файлах
- Проект переименован в `zyablik-bot` на всех уровнях
- README.md — «посадочная страница» для получателей с логотипом

## Ссылки

- [docs/ideas/preprod-brand-and-license.md](../ideas/preprod-brand-and-license.md) — исходная idea document
- [ADR-0022](ADR-0022-expand-scope-multi-source-ingest.md) — расширение scope под multi-source
- [ADR-0015](ADR-0015-zero-external-dependencies.md) — нулевые внешние зависимости
