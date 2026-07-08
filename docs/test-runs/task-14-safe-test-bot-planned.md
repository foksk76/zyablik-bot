# Task 14 safe test bot planned run

Документ резервирует место для будущего прогона safe test bot в outbound-only LXC.

## Статус

```text
Planned
```

## Назначение

```text
Отметить, что safe test bot в current LXC будет проверяться в long_polling режиме, а webhook ingress останется отдельным production-путем.
```

## Условия будущего прогона

- `MAX_TRANSPORT_MODE=long_polling`;
- локальный `.env` вне commit;
- `systemd` service;
- current LXC as outbound-only stand;
- no inbound webhook endpoint.

## Следующий шаг

```text
Task 14.1 in docs/task-14-breakdown.md
```

