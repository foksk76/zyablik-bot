# Zyablik monitoring — шаблон Zabbix

Agent-less шаблон мониторинга [Zyablik bot](https://github.com/foksk76/zyablik-bot)
(очередь доставки уведомлений из Zabbix в МАХ).

Метрики собираются по HTTP без установки Zabbix agent на хост бота — через
эндпоинты bot-platform `/api/metrics/*` и `/readyz` (ADR-0034). Требуется
**Zabbix 7.0+**.

```text
Zyablik bot (HTTP agent items)
  ├─ GET /readyz                    — healthcheck без авторизации
  ├─ GET /api/metrics/summary       — сводные счётчики очереди (Bearer)
  └─ GET /api/metrics/discovery     — список метрик для LLD (Bearer)
```

## Состав

| Компонент | Что делает |
|---|---|
| `zyablik.readyz` | Healthcheck `/readyz` без авторизации; триггер доступности бота |
| `zyablik.summary` | Мастер `/api/metrics/summary` (Bearer `{$ZYABLIK.API_KEY}`) |
| `zyablik.status.*` | Dependent-элементы со счётчиками очереди: `pending`, `processing`, `delivered`, `failed`, `total`, `totalAttempts` |
| `zyablik.backlog` | Расчётный элемент: `pending + processing` (застой очереди) |
| `zyablik.*.delta` | Элементы переходов (препроцессинг `SIMPLE_CHANGE`): прирост счётчика между опросами |
| `zyablik.queue.discovery` | LLD-правило на `/api/metrics/discovery` — поверхность расширения на новые метрики |
| `Zyablik queue [{#METRIC}]` | Прототипы элементов, создаваемые LLD по ключам discovery |

Всего: **14 items** (3 HTTP-мастера + 8 dependent/calculated + 4 delta + 1 LLD),
**1 LLD-правило**, **4 триггера**, **2 графика**, **1 дашборд**.

### Триггеры

| Триггер | Выражение | Приоритет |
|---|---|---|
| «бот недоступен» | `nodata(/Zyablik monitoring/zyablik.readyz,{$ZYABLIK.NODATA_SEC})=1` | HIGH |
| «очередь не разгружается» | `min(/Zyablik monitoring/zyablik.status.pending,{$ZYABLIK.BACKLOG_SEC})>0` | AVERAGE |
| «рост числа ошибок доставки» | `last(…failed)-last(…failed,{$ZYABLIK.BACKLOG_SEC})>{$ZYABLIK.MAX_FAILED}` | HIGH |
| «накопление ошибок доставки» | `last(…totalAttempts)-last(…totalAttempts,{$ZYABLIK.BACKLOG_SEC})>{$ZYABLIK.MAX_FAILED}` | WARNING |

Восстановление триггеров автоматическое (одиночные выражения, отдельные
recovery-выражения не задаются).

### Дашборд «Обзор очереди»

- 4 item-виджета по delta-элементам с агрегацией **SUM** за период дашборда
  (прирост pending, processing, failed, backlog);
- 2 svggraph-виджета: «Статусы очереди по времени» и «Backlog и результат
  доставки»;
- виджет последних проблем.

## Макросы

| Макрос | По умолчанию | Описание |
|---|---|---|
| `{$ZYABLIK.URL}` | `http://127.0.0.1` | Базовый URL бота без порта и пути |
| `{$ZYABLIK.PORT}` | `9000` | HTTP-порт bot-platform |
| `{$ZYABLIK.API_KEY}` | — (секрет) | API-ключ `/api/metrics/*` (Bearer); задаётся на уровне хоста |
| `{$ZYABLIK.POLL_INTERVAL}` | `30` | Интервал опроса, секунды |
| `{$ZYABLIK.NODATA_SEC}` | `90` | Окно отсутствия `/readyz` для триггера «бот недоступен» |
| `{$ZYABLIK.BACKLOG_SEC}` | `1800` | Окно анализа застоя очереди и роста ошибок |
| `{$ZYABLIK.MAX_FAILED}` | `10` | Порог прироста failed/totalAttempts за окно |

Секретные макросы не передаются в шаблон: `{$ZYABLIK.API_KEY}` пустой в файле,
реальный токен задаётся на уровне хоста (из `METRICS_API_KEY` bot-platform).

## Установка

1. Импортируйте `zyablik-monitoring-template.yaml`:
   **Data collection → Templates → Import** (*Create missing / Update existing*).
2. Привяжите шаблон **Zyablik monitoring** к хосту бота.
3. На уровне хоста задайте макросы:
   - `{$ZYABLIK.URL}` — например `http://bot.example.internal`;
   - `{$ZYABLIK.PORT}` — `9000`;
   - `{$ZYABLIK.API_KEY}` — реальный токен `METRICS_API_KEY` (Secret).

Проверка локального импорта в Docker-Zabbix 7.2:

```bash
cd scripts
docker compose up -d --wait
node import-and-verify.js
docker compose down -v
```

## Документация

- `../zabbix-monitoring-template.md` — подробное описание, макросы, триггеры и
  известные особенности Zabbix;
- `../decisions/ADR-0043-zabbix-monitoring-template.md` — решение (ADR);
- `scripts/` — тестовый стек: `docker-compose.yml`, `import-and-verify.js`,
  `stand-host.js`.

## Известные особенности (кратко)

- **SIMPLE_CHANGE** отбрасывает отрицательные дельты: сумма delta за период =
  сумма положительных приростов (для счётчиков — число новых событий).
- **Rate-триггеры** (прирост failed/totalAttempts): если за окно
  `{$ZYABLIK.BACKLOG_SEC}` нет истории, `last(…,sec)` возвращает 0 и дельта
  равна всему счётчику — сразу после привязки шаблона триггер может сработать
  на накопленном значении.
- Полный список ограничений — в `../zabbix-monitoring-template.md`.

---

Репозиторий бота: [https://github.com/foksk76/zyablik-bot](https://github.com/foksk76/zyablik-bot).
