# Project context

Этот документ фиксирует рабочий контекст проекта для инженеров и AI-агентов.

## Что делает проект

Проект добавляет доставку уведомлений из Zabbix в корпоративный мессенджер МАХ через отдельный Zabbix Media type с типом `Webhook`.

Существующий Telegram-канал не заменяется. МАХ добавляется как второй независимый канал доставки.

## Первый этап

Цель первого этапа — повысить надежность доставки оповещений системы мониторинга за счет дублирования уведомлений в двух каналах.

Первый этап принят по `docs/project-acceptance.md`. Финальная фиксация приемки хранится в:

```text
docs/test-runs/final-acceptance-run.md
```

Подтверждено:

- тестовое сообщение доставляется в МАХ;
- Problem доставляется в МАХ;
- Recovery доставляется в МАХ;
- существующий Telegram-канал продолжает работать;
- МАХ дублирует Telegram;
- GitHub Actions green;
- текущая архитектура не расширена за границы первого этапа.

## Второй этап

Второй этап принят по `docs/second-stage-acceptance.md`.

По итогам Task 11 и Task 11.1 выбран подход:

```text
Основной путь: Hubot-based MVP MAX Identity Bot
Fallback: Node-RED workflow-прототип
ADR: docs/decisions/ADR-0005-use-hubot-for-max-identity-bot-mvp.md
```

Второй этап не меняет текущий Zabbix Webhook и не начинает реализацию MVP без отдельной задачи.

## Третий этап

Третий этап начинается после принятого второго этапа.

Цель третьего этапа — реализовать MVP модульной bot-platform для МАХ на основе ADR-0005.

Основной сценарий:

```text
входящее сообщение боту МАХ -> определение типа получателя -> ответ с параметрами для Zabbix
```

Документы третьего этапа:

```text
docs/third-stage-acceptance.md
docs/third-stage-implementation-plan.md
docs/third-stage-stand-and-agent.md
```

Ключевые границы:

- основной путь реализации — Hubot-based MVP;
- Node-RED используется только как fallback-прототип;
- транспорт МАХ отделяется от identity plugin;
- WSL используется как developer sandbox;
- LXC на Proxmox используется как preferred integration stand;
- Codex agent или аналог работает только в рамках задач и обязательных проверок;
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
- хранить project-level критерии завершения первого этапа в `docs/project-acceptance.md`;
- хранить критерии завершения второго этапа в `docs/second-stage-acceptance.md`;
- хранить критерии завершения третьего этапа в `docs/third-stage-acceptance.md`;
- по ADR-0005 использовать Hubot как основной вариант MVP `MAX Identity Bot`, а Node-RED только как fallback-прототип;
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
docs/second-stage-acceptance.md
docs/third-stage-acceptance.md
AGENTS.md
docs/documentation-policy.md
```
