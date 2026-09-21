# 🃏 Мряу Mini App

Красивая Telegram Mini App для карточной игры **Мряу**.  
Работает как Web App внутри Telegram и как обычный сайт (демо-режим).

---

## Что умеет

- **Профиль** — ник, баланс монет/кристаллов, стрик, статистика
- **Коллекция** — карточки по редкостям, фильтры, просмотр
- **Маркет** — просмотр цен, обмен монет → кристаллы
- **Топ** — рейтинг по монетам / карточкам / стрику
- **Помощь** — краткая справка по игре
- **Действия** — получить карточку (с кулдауном), бросить кубик

Данные в демо-режиме хранятся в `localStorage`.  
При открытии из Telegram подхватывается имя и аватар пользователя.

---

## Быстрый старт (локально)

```bash
cd meow-miniapp
# любой статический сервер, например:
npx serve .
# или
python -m http.server 8080
```

Открой `http://localhost:8080` в браузере.

---

## Размещение на Vercel (рекомендуется)

1. Установи [Vercel CLI](https://vercel.com/docs/cli) или используй веб-интерфейс.

2. **Через сайт:**
   - Зайди на [vercel.com](https://vercel.com) → **Add New Project**
   - Импортируй репозиторий с этой папкой **или** загрузи файлы через drag-and-drop (Deploy)
   - Framework Preset: **Other**
   - Root Directory: папка с `index.html` (если в корне — оставь пустым)
   - Deploy

3. **Через CLI:**
   ```bash
   npm i -g vercel
   cd meow-miniapp
   vercel
   ```
   Следуй подсказкам. Получишь URL вида `https://meow-miniapp.vercel.app`

4. В BotFather:
   ```
   /mybots → твой бот → Bot Settings → Menu Button
   → Configure menu button → укажи URL мини-аппки
   ```
   Или добавь кнопку Web App в боте (см. ниже).

---

## Размещение на GitHub Pages

1. Создай репозиторий на GitHub (например `meow-miniapp`).

2. Залей файлы:
   ```bash
   cd meow-miniapp
   git init
   git add .
   git commit -m "Мряу Mini App"
   git branch -M main
   git remote add origin https://github.com/ТВОЙ_ЮЗЕР/meow-miniapp.git
   git push -u origin main
   ```

3. В репозитории: **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: `main` / folder: `/ (root)`
   - Save

4. Сайт будет доступен по адресу:
   `https://ТВОЙ_ЮЗЕР.github.io/meow-miniapp/`

5. Этот URL укажи в BotFather как Menu Button / Web App URL.

> ⚠️ GitHub Pages иногда отдаёт страницу с задержкой 1–2 минуты после пуша.

---

## Подключение к боту (aiogram)

### 1. Menu Button (кнопка слева внизу в чате с ботом)

В BotFather:
```
/mybots → выбери бота → Bot Settings → Menu Button
→ Configure menu button
→ Web App URL: https://твой-домен.vercel.app
→ Title: 🃏 Мряу
```

### 2. Inline-кнопка Web App в сообщении

Добавь в бота (пример для aiogram 3):

```python
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

WEBAPP_URL = "https://твой-домен.vercel.app"  # ← твой URL

def get_webapp_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🃏 Открыть мини-аппку",
            web_app=WebAppInfo(url=WEBAPP_URL),
        )]
    ])

# В /start или в профиле:
await message.answer(
    "Открой мини-аппку для удобного просмотра коллекции:",
    reply_markup=get_webapp_kb(),
)
```

### 3. Reply-кнопка (клавиатура)

```python
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo

kb = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="🃏 Мини-аппка", web_app=WebAppInfo(url=WEBAPP_URL))],
        # ... остальные кнопки
    ],
    resize_keyboard=True,
)
```

---

## Как сделать «живые» данные (API)

Сейчас мини-аппка работает в **демо-режиме** (localStorage).  
Чтобы показывать реальные карточки/баланс из SQLite бота:

1. Подними простой API (FastAPI / aiohttp) рядом с ботом, который:
   - принимает `initData` от Telegram WebApp
   - проверяет подпись (`HMAC-SHA256` с bot token)
   - возвращает JSON: `{ coins, gems, streak, inventory, cards... }`

2. В `app.js` замени загрузку state на `fetch('/api/me', { headers: { 'X-Telegram-Init-Data': tg.initData } })`.

3. Хостинг API: тот же Vercel (serverless functions) или VPS, где крутится бот.

Пример минимальной проверки `initData` (Python):

```python
import hmac, hashlib, urllib.parse

def check_webapp_init_data(init_data: str, bot_token: str) -> dict | None:
    parsed = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        return None
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, received_hash):
        return None
    # parsed["user"] — JSON-строка с id, first_name и т.д.
    return parsed
```

---

## Структура файлов

```
meow-miniapp/
├── index.html    # разметка
├── styles.css    # тёмная тема, адаптив под Telegram
├── app.js        # логика, демо-данные, Telegram WebApp API
└── README.md     # эта инструкция
```

Никаких зависимостей — чистый HTML/CSS/JS.  
Работает на любом статическом хостинге.

---

## Советы

- URL мини-аппки должен быть **HTTPS** (обязательно для Telegram).
- После деплоя проверь, что открывается внутри Telegram (не только в браузере).
- Для теста в браузере — просто открой сайт: будет демо-режим с моковыми данными.
- Haptic Feedback и тема Telegram подхватываются автоматически при запуске из клиента.

Удачи с карточками 🐱🃏
