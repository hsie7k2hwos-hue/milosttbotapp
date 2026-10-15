# API и мини-приложение «Мряу»

## Структура

```
api.py                 # FastAPI: /api/me, /api/collection, /api/top, /api/profile/{id}
webapp/
  index.html
  static/
    app.css
    app.js
```

## Переменные окружения

| Переменная | Описание |
|---|---|
| `BOT_TOKEN` | Токен user-бота (для проверки initData) |
| `DB_NAME` | Путь к SQLite (как у бота, по умолчанию `/app/data/cards_game.db`) |
| `CARD_PHOTOS_DIR` | Папка с фото карточек (`/app/data/card_photos`) |
| `WEBAPP_STATIC` | Путь к папке `webapp` (по умолчанию рядом с `api.py`) |
| `START_API=1` | Включить API из `bot.py` |
| `PORT` / `API_PORT` | Порт API (по умолчанию 8080) |
| `WEBAPP_URL` | Публичный URL мини-приложения (для кнопки в боте) |

## Запуск

Бот уже умеет поднимать API при `START_API=1`:

```bash
START_API=1 python bot.py
```

Или отдельно:

```bash
uvicorn api:app --host 0.0.0.0 --port 8080
```

Мини-приложение открывается по корню (`/`) — отдаётся `webapp/index.html`.  
Фото карточек: `/api/card-photo/{filename}`.

## Авторизация

Telegram WebApp передаёт `initData`. Клиент шлёт:

- `Authorization: tma <initData>`
- или `X-Telegram-Init-Data: <initData>`

Сервер проверяет HMAC-SHA256 по [документации Telegram](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).

## Эндпоинты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/me` | Свой профиль (монеты, стрик, кол-во карт) |
| GET | `/api/collection?rarity=` | Карточки пользователя + категории |
| GET | `/api/top?kind=coins\|cards\|streak` | Топ игроков |
| GET | `/api/profile/{user_id}` | Публичный профиль **без** списка карточек |
| GET | `/api/card-photo/{file}` | Локальное фото карточки |
| GET | `/api/rarities` | Список редкостей |
| GET | `/api/health` | Healthcheck |

## UI мини-приложения

1. **Мои карточки** — сетка с чипами редкостей, клик → модалка с фото.
2. **Топ** — переключение монеты / карточки / стрик; клик по игроку → его профиль.
3. **Профиль** — свои монеты, стрик, прогресс коллекции.

В шапке всегда: 🪙 монеты и 🔥 стрик текущего пользователя.

Чужой профиль из топа: статистика видна, **список карточек скрыт** (`cards_hidden: true`).

## Зависимости

```
fastapi
uvicorn
aiosqlite
python-dotenv
```

(Pillow и aiogram уже используются ботом для `card_photos`.)
