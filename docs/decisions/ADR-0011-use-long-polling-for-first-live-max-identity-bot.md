# ADR-0011: Use Long Polling for first live MAX Identity Bot implementation

## Статус

Принято.

## Дата

2026-07-09

## Контекст

Task 18 должен довести MAX Identity Bot до live-приемки:

```text
реальное сообщение в MAX -> ответ бота с RecipientType и To
```

Task 18.1 подтвердил официальный MAX Bot API source в `docs/identity-plugin/max-api-source.md`.

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

Task 18.2 фиксирует только transport spec и test plan. Live network code начинается не раньше Task 18.3-18.6.

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

- увеличивает scope Task 18;
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

- Task 18.3 должен валидировать `MAX_TRANSPORT_MODE=long_polling` как supported live mode.
- Task 18.3 должен принимать `MAX_TRANSPORT_MODE=webhook`, но возвращать `Не реализовано: transport mode webhook` без live network calls.
- Task 18.5 реализует inbound client через `GET /updates`.
- Task 18.6 подключает Long Polling updates к identity pipeline.
- Webhook реализация требует отдельной задачи или ADR после подтверждения ingress prerequisites.
- Zabbix alert delivery через `src/zabbix-media-type/max-webhook.js` не меняется.
