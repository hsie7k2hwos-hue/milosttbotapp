# Мряу Mini App v2

Мини-приложение читает профиль, карточки, топ и выдаёт бесплатную карточку из той же SQLite, что и бот.

```
Telegram → Mini App (HTML на Vercel / GitHub Pages)
                ↓ HTTPS + initData
         api.py (FastAPI на VPS / Bothost рядом с ботом)
                ↓
         cards_game.db
```

## Вкладки

| Вкладка | Описание |
|---------|----------|
| **Карточки** | Коллекция (уникальные, без ×amount) |
| **Получить** | Бесплатная карточка / таймер кулдауна 4 ч |
| **Топ** | Монеты · уникальные карточки · стрик |
| **Профиль** | Ник, карточки, стрик, дни |

- **Помощь** — иконка ❓ справа в шапке
- **Админка** — двойной тап по карточке профиля (только admin/superadmin)

Маркет и кристаллы **удалены**.

---

## 1. API (на сервере бота)

Положи обновлённый `api.py` в корень репозитория бота (рядом с ботом и БД).

```bash
pip install fastapi uvicorn aiosqlite pydantic

export BOT_TOKEN="123456:ABC..."
export DB_NAME="/app/data/cards_game.db"
export CORS_ORIGINS="https://твой-фронт.vercel.app,https://web.telegram.org"
export API_PORT=8080   # или PORT на Bothost

uvicorn api:app --host 0.0.0.0 --port 8080
```

Или через `run_bot_and_api.py` (бот + API в одном процессе).

Проверка: `curl https://твой-api/health`

### Новые эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/claim` | Получить бесплатную карточку |
| GET | `/api/help` | Справка (без auth) |
| GET/POST/PATCH/DELETE | `/api/admin/cards` | CRUD карточек |
| GET/PATCH | `/api/admin/users` | Игроки |
| POST | `/api/admin/users/{id}/give-card` | Выдать карточку |

Удалены: `/api/market*`, gems, exchange, buy.

Заголовок для `/api/*` (кроме `/api/help` и фото):

```
X-Telegram-Init-Data: <tg.initData>
```

---

## 2. Фронтенд

В `index.html`:

```html
<script>
  window.MEOW_API_BASE = "https://api.example.com";
</script>
```

Залей папку на **Vercel** или **GitHub Pages**.

**Vercel:** New Project → загрузить папку → Framework Other → Deploy.

**GitHub Pages:** push → Settings → Pages → branch main / root.

---

## 3. Кнопка в боте (aiogram 3)

```python
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

WEBAPP_URL = "https://meow-xxx.vercel.app"

def webapp_kb():
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🃏 Открыть мини-аппку",
            web_app=WebAppInfo(url=WEBAPP_URL),
        )
    ]])
```

Или Menu Button в BotFather → URL фронта.

---

## Файлы (только фронт)

```
meow-miniapp/
├── index.html
├── styles.css
├── app.js
├── vercel.json
└── README.md
```

`api.py` лежит в **проекте бота**, не здесь.

---

## Проблемы

| Симптом | Что сделать |
|---------|-------------|
| API не настроен | `window.MEOW_API_BASE` в index.html |
| Открой из Telegram | Кнопка Web App в боте |
| 401 подпись | BOT_TOKEN API = токен того же бота |
| CORS | Домен фронта в CORS_ORIGINS |
| Нет HTTPS | Telegram не пустит запросы |
| Админка не открывается | Нужна роль admin/superadmin + двойной тап по профилю |
