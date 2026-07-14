# Sprint 5: Follow-up after live diagnosis

## Outcome

Доработать live MAX Identity Bot по итогам live-диагностики: подтвердить поведение групповых чатов MAX в открытых источниках и устранить блокировку event loop в live runtime.

Контекст диагностики зафиксирован в `docs/live-identity-bot.md`:

- в личном диалоге `message_created` доходит, бот отвечает;
- в групповом чате MAX по умолчанию не доставляет боту `message_created` (`GET /updates` возвращает пустой список `updates`) — поведение платформы, не дефект кода;
- live runtime использует блокирующий `spawnSync` для HTTP, что задерживает логи и мешает штатной остановке сервиса.

## Tasks

### Task 5.1: Подтвердить в открытых источниках доставку updates боту в групповых чатах MAX

**Status:** Open

**Description:** Найти в открытых источниках официальное подтверждение того, как MAX Bot API доставляет updates боту в групповых чатах, и при каких условиях бот получает `message_created`. Исследовательская задача, без кода.

**Acceptance criteria:**

- [ ] Проверены официальные источники MAX Bot API (`https://dev.max.ru/docs-api` и дочерние страницы: objects/Update, objects/Message, методы получения updates).
- [ ] Зафиксирован официальный ответ: доставляет ли MAX Bot API боту `message_created` для обычных сообщений участников группового чата.
- [ ] Если не доставляет — зафиксированы официальные условия доставки (упоминание, reply, настройка приватности бота, права бота в чате, тип чата channel/group/dialog).
- [ ] Проверены открытые SDK и клиенты MAX Bot API на предмет примеров обработки групповых чатов.
- [ ] Результат оформлен как spec-документ без реальных токенов, `user_id`, `chat_id`, внутренних URL и организационных названий.

**Verification:**

- [ ] В spec есть прямые ссылки на официальные страницы MAX Bot API или цитаты.
- [ ] В spec явно отмечено: подтверждено официальной документацией / SDK / только локальным наблюдением / неизвестно.
- [ ] Вывод в `docs/live-identity-bot.md` обновлен по результатам spec.
- [ ] `npm test` passes.

**Dependencies:** Live-диагностика из Sprint 4, `docs/identity-plugin/max-api-source.md`.

### Task 5.2: Устранить блокировку event loop синхронными HTTP-вызовами в live runtime

**Status:** Open

**Description:** `src/bot-platform/runtime/live-service.js` выполняет HTTP-запросы к MAX Bot API через блокирующий `child_process.spawnSync` (`runFetchRequest`, `createNativeFetchHttpClient`). Long polling с `timeout=30` держит соединение открытым до 30 секунд, и `spawnSync` блокирует основной поток Node.js на всё время ожидания.

Наблюдаемые симптомы: между стартом сервиса и циклами polling логи не пишутся ~30s; при остановке сервиса через systemd видны строки `long polling cycle failed ... Live HTTP request failed` перед штатным `Stopping live MAX Identity Bot after SIGTERM`; при сетевом сбое сервис выглядит зависшим.

**Acceptance criteria:**

- [ ] Live runtime не блокирует event loop во время HTTP-запросов к MAX Bot API.
- [ ] HTTP boundary остается injectable и fakeable в тестах.
- [ ] Сервис отвечает на SIGTERM/SIGINT без задержки на полный long-poll timeout.
- [ ] Ошибки сети обрабатываются без бесконечного ожидания, с таймаутом.
- [ ] Токен, `user_id`, `chat_id`, URL запроса не появляются в логах.
- [ ] Поведение, зафиксированное в ADR-0011 и `docs/identity-plugin/live-transport-spec.md`, не нарушено.

**Verification:**

- [ ] Существующие fake-HTTP тесты остаются зелёными.
- [ ] Добавлен тест на таймаут HTTP-запроса.
- [ ] Добавлен тест на остановку сервиса во время активного polling-цикла.
- [ ] `npm test` passes.
- [ ] `docs/runbooks/live-identity-bot.md` обновлен, если изменились log markers.

**Dependencies:** Sprint 3 complete.

**Considerations:** варианты для отдельного решения в рамках задачи — асинхронный `child_process.spawn` с таймаутом; встроенный `fetch` с `AbortSignal.timeout()` в основном процессе (требует проверки обработки `NODE_EXTRA_CA_CERTS`); `undici`/`https` с injectable agent. Выбор фиксируется в задаче или отдельном ADR, если меняет архитектуру runtime.

## Checkpoint

- [ ] Поведение групповых чатов MAX подтверждено или уточнено в открытых источниках.
- [ ] Live runtime не блокирует event loop во время HTTP-запросов.
- [ ] `npm test` passes.
- [ ] `docs/live-identity-bot.md` синхронизирован с результатами.
