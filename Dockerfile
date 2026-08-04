# SPDX-License-Identifier: Apache-2.0
# Zyablik bot-platform — образ для стенда (ADR-0044/0045).
# Конфигурация: файл zyablik.config.json в writable volume ./config
# (ADR-0045); секреты — $VAR-ссылки из env/docker secrets (не литералы).

# --- Стадия сборки UI (M5, ADR-0036/0046). ---
# Dashboard отдаёт SPA из src/queue-monitor/ui/dist. dist gitignored, поэтому
# без отдельной стадии образ остался бы без UI (только API).
FROM node:22-bookworm-slim AS ui-build

WORKDIR /ui

COPY src/queue-monitor/ui/package.json src/queue-monitor/ui/package-lock.json ./
RUN npm ci
COPY src/queue-monitor/ui/ ./
RUN npm run build

# --- Runtime стадия. ---
FROM node:22-bookworm-slim

WORKDIR /opt/zyablik-bot

# build-essential для better-sqlite3 (native module, ADR-0025).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
# UI-сборка из стадии ui-build: в build context'е dist нет (gitignored, см.
# .dockerignore), поэтому копируем готовый результат сборки.
COPY --from=ui-build /ui/dist ./src/queue-monitor/ui/dist/
COPY systemd/ ./systemd/

ENV NODE_ENV=production
ENV ZYABLIK_CONFIG=/opt/zyablik-bot/config/zyablik.config.json

# Volume: host-каталог ./config (writable — Stage/Apply/Rollback пишут файлы,
# lkg/.pending/.staged в той же директории, ADR-0045).
VOLUME /opt/zyablik-bot/config

EXPOSE 8443 9000

# Точка входа: app.js (ingress + queue + dashboard). Запуск от root не
# требуется; при желании использовать нерутового пользователя — создать
# и передать в docker-compose (user: node), а ./config сделать владельцем node.
CMD ["node", "src/bot-platform/app.js"]
