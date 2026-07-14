# Project context

Этот документ фиксирует рабочий контекст проекта для инженеров и AI-агентов.

## Что делает проект

Проект добавляет доставку уведомлений из Zabbix в корпоративный мессенджер МАХ через отдельный Zabbix Media type с типом `Webhook`.

Существующий Telegram-канал не заменяется. МАХ добавляется как второй независимый канал доставки.

## Принятый scope

Zabbix -> МАХ доставка принята по `docs/project-acceptance.md`. Финальная фиксация доставки хранится в:

```text
docs/test-runs/final-acceptance-run.md
```

Подтверждено:

- Zabbix отправляет уведомления в МАХ через Zabbix Media type `Webhook`;
- существующий Telegram-канал продолжает работать;
- МАХ дублирует Telegram;
- GitHub Actions green;
- проект не выходит за согласованные границы.

По ADR-0010 live-сценарий MAX Identity Bot требует отдельного обезличенного live test-run: реальное входящее сообщение в МАХ и реальный ответ бота через MAX Bot API с `user_id` / `chat_id`. Реальное входящее сообщение, реальный ответ через MAX Bot API и личный ответ `RecipientType: user_id` подтверждены. Chat-сценарий с `RecipientType: chat_id` остается открытым. Dry-run, synthetic fixtures и safe test bot подтверждают только готовность кода и формата ответа.

## Post-acceptance follow-up

Открытые follow-up:

```text
Sprint 4: live MAX Identity Bot chat_id acceptance
```

Task 13 выполнена и подтверждена в `docs/test-runs/task-13-transport-mode-switch-run.md`.

Task 14 уже выполнен и относится к поддерживающим работам bot-platform.

Sprint 4 входит в актуальную live-приемку MAX Identity Bot по ADR-0010 и требует финального обезличенного live test-run.

## Bot-platform

По ADR-0005 выбран Hubot-based MVP MAX Identity Bot. Node-RED оставлен только как fallback-прототип.

Bot-platform отделена от Zabbix Webhook и используется для identity-сценария:

```text
synthetic update -> определение типа получателя -> dry-run response с параметрами для Zabbix
```

Live-сценарий с реальным входящим сообщением МАХ и реальным ответом через MAX Bot API ведется в Sprint 4.

Ключевые границы:

- основной путь реализации — Hubot-based MVP;
- Node-RED используется только как fallback-прототип;
- транспорт МАХ отделяется от identity plugin;
- WSL используется как developer sandbox;
- LXC на Proxmox используется как preferred integration stand;
- текущий Zabbix Webhook остается без изменений.

## Граница текущей принятой интеграции

Входит:

- Media type `MAX` в Zabbix;
- webhook-скрипт;
- параметры Zabbix Media type;
- проверка тестовой доставки;
- доставка Problem и Recovery;
- документация по настройке и сопровождению.

Не входит без отдельного ADR:

- промышленный bot-service;
- очередь сообщений;
- база данных;
- журнал доставки;
- автоматическая повторная отправка;
- маршрутизация уведомлений вне Zabbix;
- обработка инцидентов из МАХ;
- управление событиями Zabbix из мессенджера;
- автоматическое реагирование.

## Ключевые решения

История решений хранится в `docs/decisions/`.

На текущий момент приняты решения:

- использовать явный AI-assisted каркас разработки;
- использовать внешний `agent-skills` без git submodule;
- для документации и ADR применять подход `documentation-and-adrs`;
- хранить архитектурные решения в `docs/decisions/`;
- хранить project-level критерии в `docs/project-acceptance.md`;
- по ADR-0005 использовать Hubot как основной вариант MVP `MAX Identity Bot`, а Node-RED только как fallback-прототип;
- по ADR-0010 требовать live evidence для приемки MAX Identity Bot;
- не реализовывать очередь, базу данных, журнал доставки, автоматическую повторную отправку или маршрутизацию вне Zabbix без отдельного ADR.

## Основной артефакт первого этапа

```text
src/zabbix-media-type/max-webhook.js
```

Если меняется логика этого файла, нужно проверить и при необходимости обновить:

```text
docs/zabbix-media-type.md
CHANGELOG.md
docs/decisions/
```

## Правило для агентов

Не переизобретать принятые решения. Перед предложением нового подхода агент должен проверить:

```text
docs/decisions/README.md
docs/project-acceptance.md
AGENTS.md
docs/README.md
```
