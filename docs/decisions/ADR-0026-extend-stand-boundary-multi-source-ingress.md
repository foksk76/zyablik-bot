# ADR-0026: Расширить границу стенда под multi-source ingress

## Статус

Принято.

## Дата

2026-07-17

## Контекст

ADR-0007/0008 фиксируют текущий LXC как outbound-only:

- серый IP за NAT;
- нет входящих соединений;
- нет DNS-имени;
- нет публичного порта.

Это подходило для identity-bot (long-polling — исходящий транспорт). Multi-source ingress (ADR-0022) требует:

- **Входящий HTTP** — `POST /ingest` от внешних источников (Zabbix, SIEM);
- **Исходящий HTTP к Okta** — JWKS-fetch, token-endpoint для client-credentials flow;
- **Исходящий HTTP к MAX Bot API** — доставка уведомлений (уже есть);
- **DNS-имя** для ingress-endpoint;
- **TLS-терминирование** (reverse-proxy илиterminated TLS);
- **Порт** для входящих подключений.

ADR-0006 описывает callback-path для MAX webhook, но multi-source ingress — другая задача: источники шлют запросы к боту, а неMAX шлёт callback. Требования к сети пересекаются, но не идентичны.

## Решение

Расширить границу стенда с outbound-only на **inbound-capable** для multi-source ingress live runs.

### Что меняется

| Свойство | Было (ADR-0007/0008) | Стало (ADR-0026) |
|---|---|---|
| Входящий HTTP | нет | `POST /ingest` на внутреннем порту |
| DNS | нет | внутреннее DNS-имя для ingress-endpoint |
| TLS | нет | TLS-терминирование (reverse-proxy или terminated TLS) |
| Исходящий к MAX | long-polling | long-polling + outbound delivery |
| Исходящий к Okta | нет | JWKS-fetch + token-endpoint |
| Порт | не экспонируется | внутренний порт для ingress |

### Архитектура стенда

```text
┌─────────────────────────────────────────────────┐
│  LXC on Proxmox (inbound-capable)              │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  bot-platform (app.js)                    │  │
│  │                                           │  │
│  │  Pipeline 1: long-polling → MAX Bot API   │  │
│  │  Pipeline 2: HTTP-ingress → outbound      │  │
│  │  JwtSourceAuth (ADR-0024)                 │  │
│  │  http.createServer(:PORT)                 │  │
│  │                                           │  │
│  └──────────────┬────────────────────────────┘  │
│                 │                               │
│  ┌──────────────▼────────────────────────────┐  │
│  │  reverse-proxy (nginx/caddy)              │  │
│  │  TLS-терминирование                       │  │
│  │  → :PORT (internal)                       │  │
│  └──────────────▲────────────────────────────┘  │
│                 │                               │
└─────────────────┼───────────────────────────────┘
                  │
    ┌─────────────┴──────────────┐
    │  Внешние источники         │
    │  Zabbix / SIEM / Bot-ы     │
    │  POST /ingest              │
    └────────────────────────────┘
```

### Сетевые требования

1. **Внутренний DNS** — `bot-platform.internal.corp` (или аналогичное) резолвится из сегмента источников.

2. **Порт ingress** — внутренний порт (например, `8443`), на котором `http.createServer` слушает `POST /ingest`. Не экспонируется напрямую — reverse-proxy терминирует TLS.

3. **TLS-терминирование** — reverse-proxy (nginx, caddy) перед bot-platform:
   - Принимает TLS-соединение от источников;
   - Проксирует на `http://localhost:PORT`;
   - Forward-ит `X-Forwarded-*` заголовки (IP клиента для connection-log).

4. **Исходящий доступ к Okta** — из LXC должен быть достижим:
   - JWKS-endpoint: `https://<okta-domain>/.well-known/jwks.json`;
   - Token-endpoint: `https://<okta-domain>/oauth2/default/v1/token`.

5. **Исходящий доступ к MAX Bot API** — уже настроен (long-polling работает).

### systemd

Текущий `systemd/max-identity-bot.service` продолжает работать для long-polling pipeline. HTTP-ingress pipeline добавляется в тот же процесс `app.js` — отдельный systemd-unit не требуется (ADR-0009, ADR-0023).

Новый systemd-unit для ingress mode (отдельный `.env` с ingress-конфигурацией):

```text
systemd/max-bot-platform-ingress.service
```

Единственное отличие от `max-identity-bot.service`:
- `EnvironmentFile` указывает на конфиг с ingress-параметрами (порт, Okta domain, source-mapping);
- Режим: `MAX_TRANSPORT_MODE=ingress` (или комбинация `long_polling` + `ingress`).

### Пререквизиты до live run

1. **Согласовать сетевой сегмент** — внутренний DNS, порт, reverse-proxy;
2. **Развёртывание Okta** — ADR-0027;
3. **TLS-сертификат** — внутренний CA или self-signed для reverse-proxy;
4. **Проверка connectivity** из LXC к Okta JWKS/token-endpoint и к MAX Bot API;
5. **Reverse-proxy настроен** — проксирует `POST /ingest` на `localhost:PORT`.

### Жизненный цикл стенда

```text
Stage 1: outbound-only (текущий)
  ├── long-polling к MAX Bot API
  ├── identity-bot / commands
  └── ADR-0007/0008

Stage 2: inbound-capable (ADR-0026)
  ├── Pipeline 1: long-polling (без изменений)
  ├── Pipeline 2: HTTP-ingress (POST /ingest)
  ├── Okta JWT-auth (ADR-0024 + ADR-0027)
  ├── delivery-log (ADR-0025)
  └── reverse-proxy + TLS
```

## Почему не создавать отдельный LXC для ingress

- ADR-0009 фиксирует «один runtime»;
- Отдельный LXC = два сервиса, два systemd-unit, дублирование конфигурации;
- Ingress и long-polling разделяют outbound-client — логично в одном процессе;
- Расширение существующего LXC проще операционно.

## Почему reverse-proxy, а не terminated TLS в bot-platform

- `http.createServer` (stdlib) не предоставляет TLS-терминирование без дополнительного кода;
- Reverse-proxy — стандартный pattern для TLS-терминирования в корпоративной среде;
- Forward-ит `X-Forwarded-*` заголовки (IP клиента для connection-log);
- Отделяет TLS-конcern от application logic.

## Почему не публичный DNS / публичный порт

- Источники в доверенной корпоративной сети (Zabbix, SIEM);
- Публичная доступность не нужна и расширяет attack surface;
- Internal DNS + internal port — достаточно для корпоративных источников.

## Последствия

- `docs/runbooks/bot-platform-stand.md` обновляется: inbound-capable.stage;
- `systemd/max-bot-platform-ingress.service` добавляется;
- Reverse-proxy (nginx/caddy) добавляется в стенд;
- DNS-запись для ingress-endpoint создаётся;
- TLS-сертификат для внутреннего DNS генерируется;
- Стенд перестаёт быть outbound-only.

## Рассмотренные альтернативы

### Публичный DNS + публичный порт

Минус: избыточно для корпоративных источников, расширяет attack surface. Отклонено.

### TLS в bot-platform (native `tls.createServer`)

Минус: добавляет TLS-логику в application code. Reverse-proxy проще и standard. Отклонено.

### Separate LXC для ingress

Минус: два сервиса, дублирование, нарушение ADR-0009. Отклонено.

### VPN-туннель вместо reverse-proxy

Минус: сложнее настроить, troubleshoot. Reverse-proxy — standard pattern. Отклонено.
