# Integration status

Документ фиксирует отложенный статус интеграционного прогона MVP.

## Статус

```text
Deferred
```

## Дата

```text
2026-07-08
```

## Причина

```text
Для реального MAX callback path в режиме `webhook` сейчас нет безопасного ingress-контура.
```

`long_polling` для разработки и тестирования допускается в текущем LXC по ADR-0007 и не является блокером. Deferred относится только к real callback path в режиме `webhook`.

## Блокеры и условия старта

- нет безопасного ingress-контурa для webhook callback flow;
- не определены network, DNS и port exposure для webhook endpoint;
- не создана или не подтверждена локальная конфигурация `.env` на стенде для webhook path;
- не задействован `systemd` unit для длительного запуска webhook-сервиса;
- нет подтвержденного real MAX callback path.

## Следующий шаг

```text
docs/decisions/ADR-0006-use-lxc-integration-stand-for-mvp-callback-path.md
docs/decisions/ADR-0007-use-long-polling-by-default-for-bot-platform-development.md
```

## Проверки

```text
npm test: pass
src/zabbix-media-type/max-webhook.js: unchanged
real secrets: none
real callback URL: none
real chat_id/user_id: none
internal IPs/domains: none
```

## Вывод

```text
Integration: deferred
```
