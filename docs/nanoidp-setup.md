# IdP setup for bot-platform

Документ описывает установку и настройку Identity Provider для bot-platform ingress.

## Назначение

```text
IdP (NanoIDP/Keycloak/Authentik) → JWT → bot-platform ingress → MAX
```

## MVP стенд: NanoIDP

### Почему NanoIDP

```text
- Один Docker контейнер (~50 MB RAM)
- YAML конфигурация (без БД)
- OIDC Discovery + JWKS + client_credentials
- Web UI для управления
- Нет внешних зависимостей
```

### Установка

#### 1. Клонировать конфигурацию

```bash
cd infra/nanoidp
```

#### 2. Запустить

```bash
docker compose up -d
```

#### 3. Проверить

```bash
# OIDC Discovery
curl http://localhost:8000/.well-known/openid-configuration

# JWKS
curl http://localhost:8000/.well-known/jwks.json

# Получить токен
curl -X POST http://localhost:8000/token \
  -u 'zabbix-bot:zabbix-bot-secret-2024' \
  -d 'grant_type=client_credentials'
```

### Конфигурация

#### Файлы

```text
infra/nanoidp/
├── docker-compose.yml           # Базовый compose файл
├── docker-compose.override.yml  # Overrides для стенда
└── config/
    ├── settings.yaml            # Настройки OAuth/SAML
    └── users.yaml               # Пользователи и entitlements
```

#### settings.yaml

```yaml
oauth:
  issuer: "http://localhost:8000"
  audience: "bot-platform"
  clients:
    - client_id: "zabbix-bot"
      client_secret: "zabbix-bot-secret-2024"
      description: "Zabbix to MAX bot-platform M2M client"
```

#### users.yaml

```yaml
users:
  admin:
    entitlements: ["ADMIN_ACCESS", "USER_MANAGEMENT", "zabbix"]
    # ...
```

### JWT claim для source identification

NanoIDP не поддерживает произвольные custom claims. Используется `entitlements` массив:

```bash
# В .env bot-platform:
IDP_ISSUER=http://localhost:8000
IDP_AUDIENCE=bot-platform
JWT_CLAIM_NAME=entitlements
JWT_CLAIM_VALUE=zabbix
```

### Переменные окружения bot-platform

```bash
IDP_ISSUER=http://localhost:8000    # URL IdP
IDP_AUDIENCE=bot-platform           # Аудиенция для verification
JWT_CLAIM_NAME=entitlements         # Имя claim для source
JWT_CLAIM_VALUE=zabbix              # Значение claim для source
```

### Управление

```bash
# Остановить
docker compose down

# Логи
docker compose logs -f nanoidp

# Перезапустить
docker compose restart nanoidp
```

### Добавление нового source

1. Добавить entitlement в `users.yaml`:

```yaml
users:
  admin:
    entitlements: ["ADMIN_ACCESS", "USER_MANAGEMENT", "zabbix", "siem"]
```

2. Создать нормализатор в `src/bot-platform/ingress/normalizers/siem.js`
3. Зарегистрировать в `src/bot-platform/ingress/normalizers/index.js`

### Безопасность

```text
- Пароли в users.yaml хранятся в открытом виде (dev mode)
- Для продакшна: использовать bcrypt hashing
- Не коммитить реальные секреты в репозиторий
- Использовать .env для секретов
```

## Продакшн: Keycloak / Authentik

### Сравнение

| Фактор | Keycloak | Authentik |
|--------|----------|-----------|
| RAM | ~1 GB | ~512 MB |
| Зависимости | PostgreSQL | PostgreSQL + Redis |
| OIDC | ✅ | ✅ |
| Client Credentials | ✅ | ✅ |
| Custom Claims | ✅ (Mappers) | ✅ (Providers) |
| Web UI | ✅ | ✅ |
| LDAP | ✅ | ✅ |
| Кластер | ✅ | ✅ |
| License | Apache 2.0 | Generic |

### Рекомендация

**Для продакшна** — Keycloak:

```text
- Стандарт de facto для self-hosted IAM
- Полная поддержка OIDC + client_credentials
- Custom claims через Protocol Mappers
- LDAP/AD federation
- Кластерная поддержка
- Активное сообщество
```

### Keycloak: Быстрый старт

```bash
# Docker
docker run -d \
  --name keycloak \
  -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest \
  start-dev

# OIDC Discovery
curl http://localhost:8080/realms/master/.well-known/openid-configuration
```

### Authentik: Быстрый старт

```bash
# Docker Compose (упрощённый)
docker run -d \
  --name authentik \
  -p 9000:9000 \
  -e AUTHENTIK_BOOTSTRAP_PASSWORD=admin \
  ghcr.io/goauthentik/server:latest
```

### Переход с NanoIDP на Keycloak

1. Установить Keycloak
2. Создать Realm
3. Создать Client (client_credentials)
4. Настроить Protocol Mapper для custom claims
5. Обновить `IDP_ISSUER` в `.env`
6. Обновить `JWT_CLAIM_NAME`/`JWT_CLAIM_VALUE` если изменился формат claims
7. Перезапустить bot-platform

## Сравнение IdP

| Фактор | NanoIDP (MVP) | Keycloak (Production) | Authentik |
|--------|---------------|----------------------|-----------|
| Время.setup | ~5 мин | ~30 мин | ~20 мин |
| RAM | ~50 MB | ~1 GB | ~512 MB |
| Зависимости | Docker | PostgreSQL | PostgreSQL + Redis |
| OIDC | ✅ | ✅ | ✅ |
| Client Credentials | ✅ | ✅ | ✅ |
| Custom Claims | Limited | ✅ | ✅ |
| LDAP | ❌ | ✅ | ✅ |
| Кластер | ❌ | ✅ | ✅ |
| Web UI | ✅ | ✅ | ✅ |
| Audit Log | Basic | ✅ | ✅ |
| License | MIT | Apache 2.0 | Generic |
