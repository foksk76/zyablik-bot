# ADR-0011: Use Long Polling for first live MAX Identity Bot implementation

## Статус

Принято.

Примечание: на момент принятия ADR работы велись в рамках «Task 18». После
реорганизации нумерации задач (спринты) live-приёмка MAX Identity Bot
выполнена в `tasks/sprints/sprint-02.md`, `sprint-04.md`, `sprint-07.md`.

## Дата

2026-07-09

## Контекст

Задача live-приёмки (на тот момент — Task 18, после реорганизации — спринты 02–07) должна довести MAX Identity Bot до live-приемки:

```text
реальное сообщение в MAX -> ответ бота с RecipientType и To
```

Официальный MAX Bot API source подтверждён в `docs/identity-plugin/max-api-source.md` (спринт 02).

Официальная документация MAX API поддерживает два способа получения событий:

- `GET /updates` через Long Polling;
- `POST /subscriptions` для Webhook.

Документация MAX указывает, что production-интеграциям рекомендуется Webhook, а Long Polling подходит для разработки и тестирования. Текущая рабочая среда проекта остается outbound-only LXC: она подходит для исходящих запросов, но не гарантирует публичный HTTPS endpoint на порту `443`, DNS и валидный TLS certificate chain.

Для live-приемки identity-сценария нужен минимальный надежный путь, который можно проверить в текущей среде без расширения проекта до ingress-инфраструктуры.

## Решение

Использовать `long_polling` как первый live transport mode для реализации MAX Identity Bot.

Для `webhook` оставить явную runtime-заглушку:

```text
Не реализовано: transport mode webhook
```

`webhook` нельзя silently fallback-ить на `long_polling`. Если оператор выбрал `webhook`, runtime должен завершиться понятной ошибкой без сетевых вызовов и без раскрытия секретов.

Данное решение фиксирует только transport spec и test plan. Live network code реализуется в спринтах (sprint-02: inbound client + подключение к identity pipeline).

## Рассмотренные альтернативы

### Webhook как первый live mode

Плюсы:

- соответствует production-рекомендации MAX API;
- ack событий выражается через HTTP `200 OK`.

Минусы:

- требует публичный HTTPS endpoint на порту `443`;
- требует DNS и доверенный TLS certificate chain;
- текущая LXC-среда не подтверждена как ingress-capable;
- добавляет инфраструктурный риск до проверки базового identity-сценария.

Решение: отклонено для первой live-реализации.

### Реализовать оба режима сразу

Плюсы:

- закрывает dev/test и production варианты одновременно.

Минусы:

- увеличивает scope задачи live-приёмки;
- требует разные failure modes, security checks и test plan;
- повышает риск ошибок в webhook path без подтвержденной ingress-среды.

Решение: отклонено. Webhook остается явной заглушкой до отдельной задачи или ADR.

### Long Polling как единственный режим навсегда

Плюсы:

- проще в эксплуатации в outbound-only среде.

Минусы:

- противоречит production-рекомендации официальной документации;
- может не подходить для будущей production-интеграции.

Решение: отклонено. Long Polling выбран только как первый live mode для приемки identity-сценария.

## Последствия

- Реализация (sprint-02) должна валидировать `MAX_TRANSPORT_MODE=long_polling` как supported live mode.
- Реализация должна принимать `MAX_TRANSPORT_MODE=webhook`, но возвращать `Не реализовано: transport mode webhook` без live network calls.
- Inbound client через `GET /updates` реализован в sprint-02 (Task 2.1).
- Подключение Long Polling updates к identity pipeline — в sprint-02 (Task 2.2).
- Webhook реализация требует отдельной задачи или ADR после подтверждения ingress prerequisites.
- Zabbix alert delivery через `src/zabbix-media-type/max-webhook.js` не меняется.
