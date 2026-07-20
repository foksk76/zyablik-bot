# Критерии завершения проекта

Документ является единственным источником project-level критериев завершения проекта.

Критерии конкретных задач остаются в `tasks/sprints/`. Здесь фиксируются только условия, при которых проект в целом считается завершенным.

## Граница приемки

Проект считается завершенным при выполнении двух пользовательских сценариев:

- Zabbix отправляет уведомления в МАХ через Zabbix Media type `Webhook`.
- бот МАХ возвращает `user_id` / `chat_id` для настройки получателя в Zabbix.

Критерии ниже не требуют очереди сообщений, автоматического реагирования или хранения чувствительных данных в репозитории.

По ADR-0022 граница проекта расширена на multi-source ingress + журналы (delivery-log, connection-log, audit-trail). Критерии multi-source ingest определяются отдельно при декомпозиции в `tasks/sprints/`.

Уточнение по ADR-0010:

- dry-run, synthetic fixtures и safe test bot подтверждают готовность кода и формата ответа, но не подтверждают live-сценарий;
- критерий `бот МАХ возвращает user_id / chat_id` считается выполненным только после проверки с реальным MAX Bot API;
- признак "сообщение помечено прочитанным" не является обязательным критерием, пока официальный MAX Bot API для read/ack не подтвержден отдельной задачей или ADR.

## Критерии завершения проекта (1.0.0)

- [x] В Zabbix создан и включен Media type `MAX` с типом `Webhook`.
- [x] В Media type используется скрипт из `src/zabbix-media-type/max-webhook.js`.
- [x] Параметры Media type заполнены по `docs/zabbix-media-type.md`.
- [x] Тестовое сообщение из Zabbix успешно доставляется в МАХ.
- [x] Problem-событие успешно доставляется в МАХ.
- [x] Recovery-событие успешно доставляется в МАХ.
- [x] Бот МАХ принимает реальное входящее сообщение через поддержанный MAX transport: `long_polling`.
- [x] Бот МАХ отправляет реальный ответ через MAX Bot API, а не только формирует dry-run payload.
- [x] В личном диалоге бот возвращает `RecipientType: user_id` и `To: <обезличенный user_id>` для настройки получателя в Zabbix.
- [x] В групповом чате или другом поддержанном chat-сценарии бот возвращает `RecipientType: chat_id` и `To: <обезличенный chat_id>` для настройки получателя в Zabbix.
- [x] Runtime-секреты MAX Bot API хранятся только во внешней конфигурации или переменных окружения.
- [x] Существующий Telegram-канал не нарушен и продолжает работать.
- [x] Документация позволяет повторить настройку без неформальных пояснений.
- [x] В документации и примерах нет реальных авторизационных значений, боевых идентификаторов, внутренних адресов и организационных названий.
- [x] Завершены задачи из `tasks/sprints/`, относящиеся к проекту.
- [x] Выполнен `npm test` без ошибок.
- [x] Проверка GitHub Actions завершилась успешно.
- [x] Проект не вышел за согласованные границы.

## Доказательства

Критерии выше подтверждаются следующими артефактами:

| Критерий | Доказательства |
|---|---|
| Media type `MAX` создан и включен | [`docs/test-runs/max-media-type-manual-run.md`](test-runs/max-media-type-manual-run.md), [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) |
| Используется `src/zabbix-media-type/max-webhook.js` | [`src/zabbix-media-type/max-webhook.js`](../src/zabbix-media-type/max-webhook.js), [`docs/test-runs/max-media-type-manual-run.md`](test-runs/max-media-type-manual-run.md), [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) |
| Параметры заполнены по `docs/zabbix-media-type.md` | [`docs/zabbix-media-type.md`](zabbix-media-type.md), [`docs/test-runs/max-media-type-manual-run.md`](test-runs/max-media-type-manual-run.md), [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) |
| Test message доставляется в МАХ | [`docs/test-runs/max-media-type-manual-run.md`](test-runs/max-media-type-manual-run.md), [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) |
| Problem доставляется в МАХ | [`docs/test-runs/max-problem-recovery-run.md`](test-runs/max-problem-recovery-run.md), [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) |
| Recovery доставляется в МАХ | [`docs/test-runs/max-problem-recovery-run.md`](test-runs/max-problem-recovery-run.md), [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) |
| Bot-platform формирует ответ с `user_id` / `chat_id` в dry-run | `npm test`, `docs/test-runs/final-acceptance-run.md` |
| Бот МАХ получает реальное входящее сообщение | Обезличенный live test-run для MAX Identity Bot |
| Бот МАХ отправляет реальный ответ через MAX Bot API | Обезличенный live test-run для MAX Identity Bot |
| Бот МАХ возвращает `user_id` в личном диалоге | Обезличенный live test-run для MAX Identity Bot |
| Бот МАХ возвращает `chat_id` в групповом чате или поддержанном chat-сценарии | Обезличенный live test-run для MAX Identity Bot |
| Runtime-секреты MAX Bot API хранятся вне репозитория | Обезличенный live test-run для MAX Identity Bot, `.gitignore`, локальная конфигурация стенда |
| Telegram-канал продолжает работать | [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) |
| Документация позволяет повторить настройку | [`docs/zabbix-media-type.md`](zabbix-media-type.md), [`examples/media-params.md`](../examples/media-params.md), [`examples/media-type-recreate-checklist.md`](../examples/media-type-recreate-checklist.md) |
| Нет реальных авторизационных значений и боевых идентификаторов | [`docs/test-runs/max-media-type-manual-run.md`](test-runs/max-media-type-manual-run.md), [`docs/test-runs/max-problem-recovery-run.md`](test-runs/max-problem-recovery-run.md), [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) |
| Завершены задачи из `tasks/sprints/`, относящиеся к проекту | [`tasks/sprints/`](../tasks/sprints/) |
| `npm test` проходит без ошибок | [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md), текущий `npm test` |
| GitHub Actions завершился успешно | [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md) |
| Проект не вышел за согласованные границы | [`docs/test-runs/final-acceptance-run.md`](test-runs/final-acceptance-run.md), [`docs/project-context.md`](project-context.md) |

## Не входит в приемку проекта

- отдельный bot-service;
- очередь сообщений;
- повторная отправка;
- SIEM-интеграция;
- AI-обработка событий;
- автоматическое реагирование;
- управление событиями Zabbix из МАХ;
- read/ack входящих сообщений МАХ без подтвержденного метода MAX Bot API.

По ADR-0022 в scope проекта входят: delivery-log (SQLite), connection-log и audit-trail (syslog), multi-source HTTP-ingress. Их критерии приемки определяются отдельно.

## Финальный приемочный прогон

Финальный прогон выполняется после закрытия задач из `tasks/sprints/`.

Последовательность:

1. Проверить структуру репозитория командой `npm test`.
2. Проверить настройки Media type `MAX` по `docs/zabbix-media-type.md`.
3. Отправить тестовое сообщение из Zabbix.
4. Проверить доставку Problem-события.
5. Проверить доставку Recovery-события.
6. Отправить реальное сообщение боту МАХ в личном диалоге.
7. Проверить, что бот ответил с `RecipientType: user_id` и обезличенным `To`.
8. Отправить реальное сообщение боту МАХ в групповом чате или другом поддержанном chat-сценарии.
9. Проверить, что бот ответил с `RecipientType: chat_id` и обезличенным `To`.
10. Проверить, что существующий Telegram-канал продолжает работать.
11. Проверить, что документация и примеры не содержат чувствительных значений.
12. Зафиксировать результат приемки в отдельной обезличенной заметке `docs/test-runs/`.

## Правило изменения критериев

Критерии завершения проекта меняются только через отдельное решение в `docs/decisions/`.

Если появляется необходимость добавить новый компонент или изменить границы проекта, сначала создается ADR, затем обновляется этот документ.
