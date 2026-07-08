# Task 12.6 router and dry-run CI run

Документ фиксирует проверку Task 12.6 после реализации event router и dry-run pipeline.

## Статус

```text
Done
```

## Commit

```text
61c3ba6220e7cd6dd3877590756c418728b06ab2
```

## Что проверено

- Добавлен минимальный event router.
- Router направляет user event в identity plugin.
- Router направляет chat event в identity plugin.
- Router использует `identity` route по умолчанию.
- Unknown route обрабатывается контролируемой ошибкой.
- Добавлен dry-run pipeline.
- Dry-run pipeline выполняет локальную цепочку `synthetic MAX fixture -> normalizer -> router -> identity response`.
- Dry-run pipeline не включает сетевые вызовы.
- Raw event payload не добавляется в response.
- Реальный inbound listener не добавлялся.
- Реальный outbound API client не добавлялся.
- Hubot adapter не добавлялся.
- Текущий Zabbix Webhook не изменялся.

## GitHub Actions

```text
Node.js: 22.23.1
npm: 10.9.8
Tests: 47
Pass: 47
Fail: 0
Duration: 777.008436 ms
```

## Результат

```text
Task 12.6 закрыта. Следующий шаг: Task 12.7 — проверить WSL/LXC stand и подготовить runbook.
```
