# Sprint 5: Follow-up after live diagnosis

## Outcome

Доработать live MAX Identity Bot по итогам live-диагностики: подтвердить поведение групповых чатов MAX в открытых источниках и устранить блокировку event loop в live runtime.

Контекст диагностики зафиксирован в `docs/live-identity-bot.md`:

- в личном диалоге `message_created` доходит, бот отвечает;
- в групповом чате MAX по умолчанию не доставляет боту `message_created` (`GET /updates` возвращает пустой список `updates`) — поведение платформы, не дефект кода;
- live runtime использует блокирующий `spawnSync` для HTTP, что задерживает логи и мешает штатной остановке сервиса.

## Tasks

### Task 5.1: Подтвердить в открытых источниках доставку updates боту в групповых чатах MAX

**Status:** Done

**Description:** Найти в открытых источниках официальное подтверждение того, как MAX Bot API доставляет updates боту в групповых чатах, и при каких условиях бот получает `message_created`. Исследовательская задача, без кода.

**Result:** Подтверждено официальной документацией MAX Bot API (`dev.max.ru`): чтобы получать события из групповых чатов и каналов, бот должен быть администратором. Spec зафиксирован в `docs/identity-plugin/group-chat-update-delivery.md` (PR #3). Гипотеза про упоминание/reply официальными документами не подтверждена и снята.

**Acceptance criteria:**

- [x] Проверены официальные источники MAX Bot API (`https://dev.max.ru/docs-api` и дочерние страницы: objects/Update, objects/Message, методы получения updates).
- [x] Зафиксирован официальный ответ: доставляет ли MAX Bot API боту `message_created` для обычных сообщений участников группового чата.
- [x] Если не доставляет — зафиксированы официальные условия доставки (упоминание, reply, настройка приватности бота, права бота в чате, тип чата channel/group/dialog).
- [x] Проверены открытые SDK и клиенты MAX Bot API на предмет примеров обработки групповых чатов.
- [x] Результат оформлен как spec-документ без реальных токенов, `user_id`, `chat_id`, внутренних URL и организационных названий.

**Verification:**

- [x] В spec есть прямые ссылки на официальные страницы MAX Bot API или цитаты.
- [x] В spec явно отмечено: подтверждено официальной документацией / SDK / только локальным наблюдением / неизвестно.
- [ ] Вывод в `docs/live-identity-bot.md` обновлен по результатам spec.
- [ ] `npm test` passes.

**Dependencies:** Live-диагностика из Sprint 4, `docs/identity-plugin/max-api-source.md`.

### Task 5.2: Устранить блокировку event loop синхронными HTTP-вызовами в live runtime

**Status:** Done

**Description:** `src/bot-platform/runtime/live-service.js` выполняет HTTP-запросы к MAX Bot API через блокирующий `child_process.spawnSync` (`runFetchRequest`, `createNativeFetchHttpClient`). Long polling с `timeout=30` держит соединение открытым до 30 секунд, и `spawnSync` блокирует основной поток Node.js на всё время ожидания.

Наблюдаемые симптомы: между стартом сервиса и циклами polling логи не пишутся ~30s; при остановке сервиса через systemd видны строки `long polling cycle failed ... Live HTTP request failed` перед штатным `Stopping live MAX Identity Bot after SIGTERM`; при сетевом сбое сервис выглядит зависшим.

**Result:** `spawnSync` заменён на асинхронный `child_process.spawn` (не блокирует event loop) с `timeout`/`killSignal: SIGTERM` и новой переменной `MAX_HTTP_TIMEOUT_MS` (default 90s). Контракт `send()` сделан consistently async (contract-first): `outbound-client.send`, `runMaxIdentityDryRun`, `inbound-webhook.handle`, `runBotPlatformDryRun`, `main` — все async; `httpClient.post` теперь `await`-ится. HTTP boundary остался injectable. Добавлены 2 теста: таймаут HTTP (child вешается, убивается за `timeoutMs`, event loop свободен) и остановка сервиса во время polling-цикла (`stop()` возвращается мгновенно при pending poll).

**Acceptance criteria:**

- [x] Live runtime не блокирует event loop во время HTTP-запросов к MAX Bot API.
- [x] HTTP boundary остается injectable и fakeable в тестах.
- [x] Сервис отвечает на SIGTERM/SIGINT без задержки на полный long-poll timeout.
- [x] Ошибки сети обрабатываются без бесконечного ожидания, с таймаутом.
- [x] Токен, `user_id`, `chat_id`, URL запроса не появляются в логах.
- [x] Поведение, зафиксированное в ADR-0011 и `docs/identity-plugin/live-transport-spec.md`, не нарушено.

**Verification:**

- [x] Существующие fake-HTTP тесты остаются зелёными.
- [x] Добавлен тест на таймаут HTTP-запроса.
- [x] Добавлен тест на остановку сервиса во время активного polling-цикла.
- [x] `npm test` passes.
- [x] `docs/runbooks/live-identity-bot.md` обновлен, если изменились log markers.

**Dependencies:** Sprint 3 complete.

**Considerations:** выбран асинхронный `child_process.spawn` с `timeout` (вариант 1 из considerations). Архитектура runtime не изменилась — HTTP по-прежнему изолирован в child-процессе, boundary остаётся injectable. Отдельный ADR не требуется.

## Checkpoint

- [x] Поведение групповых чатов MAX подтверждено или уточнено в открытых источниках.
- [x] Live runtime не блокирует event loop во время HTTP-запросов.
- [x] `npm test` passes.
- [x] `docs/live-identity-bot.md` синхронизирован с результатами.
