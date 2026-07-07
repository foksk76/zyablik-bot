# MAX Problem and Recovery run

Документ фиксирует обезличенный результат ручной проверки доставки Problem и Recovery уведомлений из Zabbix в МАХ.

## Назначение проверки

Проверить фактическую доставку уведомлений через реальный сценарий Zabbix Action:

```text
Problem -> MAX
Recovery -> MAX
```

Проверка не является автоматическим test harness и не эмулирует Zabbix runtime.

## Результат прогона 2026-07-07

```text
Дата прогона: 2026-07-07
Media type: MAX
Recipient type: не фиксируется в отчете
HTTPProxy used: no
Trigger: тестовый trigger
Host: test-max-alert
Severity: Information
Operational data: 1
Original problem ID: зафиксирован в тестовой среде, в отчете не используется как боевой идентификатор
```

### Problem

```text
Result: success
Message delivered: yes
Unresolved macros: no
Observed time: 15:12:11
Message summary: доставлено сообщение о начале проблемы по тестовому trigger на host test-max-alert. В сообщении указаны severity, operational data и original problem ID.
```

### Recovery

```text
Result: success
Message delivered: yes
Unresolved macros: no
Observed time: 15:13:11
Problem duration: 1m 0s
Message summary: доставлено сообщение о восстановлении по тому же тестовому trigger. В сообщении указаны problem duration, host, severity и original problem ID.
```

## Вывод

Проверка Problem и Recovery выполнена успешно.

```text
Problem delivered: yes
Recovery delivered: yes
Message format checked: yes
Status: done
```

## Security note

В отчет не внесены токен бота, реальные идентификаторы получателей, внутренние адреса и чувствительные значения.
