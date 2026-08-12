# Architecture Decision Records

Этот раздел — каноничное место для архитектурных решений проекта.

ADR фиксируют не только принятое решение, но и контекст, ограничения, рассмотренные альтернативы и последствия. Это нужно, чтобы будущие инженеры и AI-агенты понимали, почему проект устроен именно так, и не переизобретали уже принятые решения.

## Правила

- ADR не удаляются из истории решений.
- Если решение изменилось, создается новый ADR со ссылкой на старый.
- Существенные изменения архитектуры, границ проекта, процесса разработки или документации фиксируются через ADR.
- Служебный каталог `.agents/` может ссылаться на ADR, но не является каноничным хранилищем решений.

## Список решений

| ADR | Статус | Решение |
|---|---|---|
| [ADR-0001](ADR-0001-ai-assisted-dev.md) | Принято | Использовать явный AI-assisted каркас разработки |
| [ADR-0002](ADR-0002-use-external-agent-skills.md) | Принято | Использовать внешний `agent-skills` без submodule |
| [ADR-0003](ADR-0003-project-acceptance-and-run-methods.md) | Принято | Выделить критерии завершения проекта и методы прогонов |
| [ADR-0004](ADR-0004-use-node-policy-tests-and-github-actions.md) | Принято | Использовать Node.js policy tests и GitHub Actions вместо bash-проверки |
| [ADR-0005](ADR-0005-use-hubot-for-max-identity-bot-mvp.md) | Заменён ([ADR-0049](ADR-0049-supersede-hubot-with-custom-bot-platform.md)) | Выбрать платформу MVP MAX Identity Bot |
| [ADR-0006](ADR-0006-use-lxc-integration-stand-for-mvp-callback-path.md) | Принято | Использовать LXC integration stand для callback-path прогона MVP |
| [ADR-0007](ADR-0007-use-long-polling-by-default-for-bot-platform-development.md) | Принято | Использовать long polling по умолчанию для разработки и тестирования bot-platform |
| [ADR-0008](ADR-0008-use-outbound-only-lxc-for-safe-test-bot-development.md) | Принято | Использовать outbound-only LXC для safe test bot development |
| [ADR-0009](ADR-0009-place-long-polling-loop-in-the-bot-platform-runtime-entrypoint.md) | Принято | Разместить long polling loop в runtime entrypoint bot-platform |
| [ADR-0010](ADR-0010-require-live-evidence-for-max-identity-bot-acceptance.md) | Принято | Требовать live evidence для приемки MAX Identity Bot |
| [ADR-0011](ADR-0011-use-long-polling-for-first-live-max-identity-bot.md) | Принято | Использовать Long Polling для первой live-реализации MAX Identity Bot |
| [ADR-0012](ADR-0012-use-convention-based-plugin-loader.md) | Принято | Использовать convention-based plugin loader для bot-platform |
| [ADR-0013](ADR-0013-safe-logger-secret-redaction.md) | Принято | Использовать многоуровневую safe logger для маскировки секретов |
| [ADR-0014](ADR-0014-async-http-via-child-process.md) | Принято | Использовать async HTTP через child_process.spawn |
| [ADR-0015](ADR-0015-zero-external-dependencies.md) | Принято | Использовать нулевые внешние зависимости для bot-platform |
| [ADR-0016](ADR-0016-injectable-dependency-injection.md) | Принято | Использовать инъекцию зависимостей через options объект |
| [ADR-0017](ADR-0017-internal-event-contract.md) | Принято | Ввести внутренний контракт событий (canonical event model) |
| [ADR-0018](ADR-0018-pipeline-command-dispatch.md) | Принято | Ввести pipeline command dispatch (ветвление в pipeline) |
| [ADR-0019](ADR-0019-outbound-response-shape-extensibility.md) | Принято | Расширить outbound response shape для text-only ответов |
| [ADR-0020](ADR-0020-expanded-pipeline-event-scope.md) | Принято | Расширить scope pipeline для обработки bot_added событий |
| [ADR-0021](ADR-0021-handle-bot-started-welcome.md) | Принято | Обработка bot_started событий с приветствием |
| [ADR-0022](ADR-0022-expand-scope-multi-source-ingest.md) | Принято | Расширить scope проекта под multi-source ingress + журналы |
| [ADR-0023](ADR-0023-incoming-http-bot-platform.md) | Принято | Принять входящие HTTP-запросы в bot-platform (изменение посылки ADR-0015) |
| [ADR-0024](ADR-0024-accept-okta-jwt-verifier.md) | Принято | Принять `@okta/jwt-verifier` как исключение из ADR-0015 |
| [ADR-0025](ADR-0025-accept-better-sqlite3.md) | Принято | Принять `better-sqlite3` как исключение из ADR-0015 |
| [ADR-0026](ADR-0026-extend-stand-boundary-multi-source-ingress.md) | Принято | Расширить границу стенда под multi-source ingress (outbound-only → inbound-capable) |
| [ADR-0027](ADR-0027-install-configure-okta-on-mvp-stand.md) | Принято | Установить и настроить Okta IdP на MVP стенде для live runs |
| [ADR-0028](ADR-0028-introduce-delivery-queue.md) | Принято | Ввести очередь доставки сообщений (delivery queue) для at-least-once guarantee |
| [ADR-0029](ADR-0029-lifecycle-audit-trail.md) | Принято | Ввести lifecycle audit trail для журналирования всего pipeline |
| [ADR-0030](ADR-0030-outbound-rate-limiter.md) | Принято | Ввести outbound rate limiter для защиты от 429 MAX API |
| [ADR-0031](ADR-0031-preprod-brand-license-rename.md) | Принято | Пре-продакшн: лицензия Apache-2.0, бренд «Зяблик», полный ренейминг в zyablik-bot |
| [ADR-0032](ADR-0032-log-outbound-api-response-body.md) | Принято | Логировать тело ответа внешних API в ошибках доставки |
| [ADR-0033](ADR-0033-delivery-pipeline-crash-recovery.md) | Принято | Crash recovery для delivery pipeline: reclaim stale processing-строк, poison-loop prevention, coordinated graceful shutdown |
| [ADR-0034](ADR-0034-queue-monitor-dashboard.md) | Принято | Queue Monitor Dashboard: встроенный дашборд с readonly SQLite replica, API для внешних систем мониторинга, auth через IdP |
| [ADR-0035](ADR-0035-session-auth-for-dashboard-metrics.md) | Принято | Session auth как альтернатива Bearer для dashboard metrics |
| [ADR-0036](ADR-0036-design-system-for-queue-monitor-ui.md) | Принято | Дизайн-система для React UI queue-monitor (design tokens, компоненты, Storybook, AI-guidelines) |
| [ADR-0037](ADR-0037-ssrf-protection-for-idp-requests.md) | Принято | SSRF-защита для IdP-запросов (dns resolution + private IP blocking) |
| [ADR-0038](ADR-0038-hand-rolled-jwt-verifier-for-ingress.md) | Принято | Hand-rolled JWT-verifier для ingress layer (RS256/384/512, JWKS cache) |
| [ADR-0039](ADR-0039-auth-rate-limiting-for-dashboard.md) | Принято | Rate limiting для auth-эндпоинтов dashboard (sliding window + concurrency cap) |
| [ADR-0040](ADR-0040-ui-improvements-for-queue-monitor.md) | Принято | Улучшения UI Queue Monitor Dashboard (error drill-down, session redirect, alert→banner, configurable limits, countdown, error boundary) |
| [ADR-0041](ADR-0041-global-time-filter.md) | Принято | Глобальный фильтр времени для Queue Monitor Dashboard (TimeRangeBar, предустановки, absolute range, drag-to-pan) |
| [ADR-0042](ADR-0042-web-interface-archive.md) | Принято | Web Interface — navigation shell + archive (React Router hash-based, archive API, retry через queueStore, backend export) |
| [ADR-0043](ADR-0043-zabbix-monitoring-template.md) | Принято | Zabbix Monitoring Template: agent-less LLD-шаблон 7.0+, смена `{#METRIC}` на `pending`, полный набор триггеров, тестовый Zabbix 7.2 в Docker |
| [ADR-0044](ADR-0044-nginx-reverse-proxy.md) | Принято | Nginx reverse proxy для HTTP-серверов bot-platform: TLS-терминирование ingress (`8443`) и dashboard (`9000`), единый порт `443`, самоподписанный сертификат на локальном стенде |
| [ADR-0045](ADR-0045-config-file-source-of-truth.md) | Принято | Файл конфигурации как источник правды: `zyablik.config.json`, трёхслойный мерж defaults→файл→env, `$VAR`-секреты, Stage→Apply→рестарт, last-known-good, bootstrap через `--generate-config` |
| [ADR-0046](ADR-0046-schema-driven-config-webui.md) | Принято | Schema-driven управление конфигурацией в web UI: `configSchema` у плагинов, динамические формы, `/api/config/*`, маскирование секретов, импорт/экспорт JSON |
| [ADR-0047](ADR-0047-dev-markers-and-clean-build.md) | Принято | Dev-маркеры и чистая сборка: `/* DEV-ONLY: <ADR|задача> */` + `scripts/clean-build.js` + `npm run build:clean`, policy-тест на чистый артефакт, гейт CI на результат чистой сборки (без `DEV-ONLY` в `dist/clean/`) |
| [ADR-0048](ADR-0048-automated-dev-lifecycle.md) | Принято | Автоматизированный жизненный цикл разработки: идея → ветка → код со скилами и dev-маркерами → чистая сборка → ревью человеком по чек-листу → merge → полу-авто доставка, дихотомия «репо = полная история / прод = чистый код» |
| [ADR-0049](ADR-0049-supersede-hubot-with-custom-bot-platform.md) | Принято | Заменить Hubot кастомной bot-platform: признать Hubot-путь (ADR-0005) нереализованным, основным путём считать `src/bot-platform/` |
