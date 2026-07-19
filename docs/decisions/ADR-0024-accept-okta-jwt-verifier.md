# ADR-0024: Принять `@okta/jwt-verifier` как исключение из ADR-0015

## Статус

Принято.

## Дата

2026-07-17

## Контекст

ADR-0015 устанавливает нулевые внешние зависимости. Multi-source ingest (ADR-0022) требует проверки входящих JWT от источников через корпоративный Okta IdP.

Рукописная JWT/JWKS-реализация поверх `crypto` + `fetch` — нетривиальна:

- Алгоритмы подписи (RS256, ES256, HS256);
- Claims-валидация (`iss`, `aud`, `exp`, `nbf`, `iat`);
- JWKS-fetch и кэширование;
- Key-rotation при неизвестном `kid`;
- Обработка ошибок (expired, wrong issuer/audience, malformed token).

Стандартная рекомендация — использовать поддерживаемую библиотеку. Самостоятельная реализация чревата security-ошибками.

## Решение

Принять `@okta/jwt-verifier` v4.x как единственную JWT-библиотеку в auth-слое multi-source ingress.

### Библиотека

- Пакет: `@okta/jwt-verifier` (npm)
- Актуальная версия: v4.x (active, latest 2025-08-28)
- Предыдущее поколение: v2.x (retired 2025-01-31)

### Обоснование выбора

- Стандартная claims-валидация (`iss`, `aud`, `exp`, `kid`);
- JWKS-fetch с in-memory кэшированием (zero per-request latency после начального fetch);
- Key-rotation: lazy-refresh при неизвестном `kid`;
- Активно поддерживается Okta (posture поддержки подтверждена);
- Официальный репозиторий: [okta/okta-jwt-verifier-js](https://github.com/okta/jwt-verifier-js)

### Граница исключения

Исключение ограничено **auth-слоем** multi-source ingress:

- `JwtSourceAuth` middleware — единственная точка использования `@okta/jwt-verifier`;
- Остальная кодовая база bot-platform остаётся zero-dep (ADR-0015);
- `package.json` получает секцию `dependencies` только для этого пакета.

### Связь с ADR-0016

ADR-0016 (инъекция зависимостей через options) позволяет:

- Инжектировать `JwtSourceAuth` как зависимость в HTTP-сервер;
- Тестировать auth-логику без реального Okta (mock-JWT в тестах);
- Заменить `@okta/jwt-verifier` на альтернативу в будущем без изменения контрактов.

## Почему `@okta/jwt-verifier`, а не `jose`

- `@okta/jwt-verifier` — Okta-специфичный, готовая интеграция с Okta JWKS;
- `jose` — generic, больше клея для Okta-специфичной логики;
- При наличии Okta как единого issuer — Okta-специфичная библиотека стратегически чище;
- Оба — одного класса (JWT-верификация через JWKS), разница в готовой логике.

## Почему не рукописную реализацию

- JWT/JWKS-логика нетривиальна (алгоритмы, claim-валидация, key-rotation);
- Чревата security-ошибками (неполная валидация, неправильное сравнение подписей);
- Стандартная рекомендация — использовать поддерживаемую библиотеку;
- Поддержка v4.x подтверждена до 2025-08-28.

## Принятое следствие

Runtime-зависимость от доступности Okta (допущение 2 из идеи multi-source-ingest): недоступность Okta приравнивается к недоступности сети. Бот не доставляет уведомления при недоступности IdP — сознательное решение.

## Последствия

- `package.json` получает `dependencies: { "@okta/jwt-verifier": "^4.x" }`;
- `npm install` устанавливает `@okta/jwt-verifier` и его transitive dependencies;
- Supply-chain attack surface расширяется на one package (acceptable trade-off по решению проекта);
- `JwtSourceAuth` тестируется с mock-JWT без реального Okta;
- будущее изменение JWT-библиотеки — через ADR (сменаtrusted library).

## Рассмотренные альтернативы

### Рукописная JWT/JWKS-реализация

Минус: нетривиальна, чревата security-ошибками, нет поддержки key-rotation. Отклонено.

### `jose` (generic JWT-библиотека)

Минус: меньше готовой Okta-специфичной логики, больше клея. Отклонено в пользу Okta-специфичной библиотеки.

### Introspection endpoint вместо JWKS

Минус: каждый запрос = вызов к Okta (latency, availability dependency). JWKS-кэш даёт zero per-request latency после начального fetch. Отклонено.

### Static shared-token (без JWT)

Минус: нет централизованного отзыва токенов, нет аудита выдачи, нет стандартизированных claims. Убрано из MVP в ревизии 2 идеи.
