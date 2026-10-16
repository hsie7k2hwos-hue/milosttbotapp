# Telegram Mini App — Коллекция карточек

Фронтенд мини-приложения для Telegram. Хостится на **Vercel**, API — на BotHost вместе с ботом.

## Возможности

- 🃏 Каталог всех карточек с фильтрами по редкости и поиском
- 🏆 Топ по монетам / карточкам / стрику
- 👤 Профиль: баланс, стрик, место, разбивка коллекции, свои карты
- 🌙 AMOLED тёмная + светлая тема
- ✨ Плавающий навбар и liquid glass (backdrop-filter)

## Быстрый старт (Vercel)

1. Создайте репозиторий и положите содержимое этой папки в корень.
2. Откройте `js/config.js` и замените `FALLBACK` на публичный URL API:

```js
const FALLBACK = "https://your-bothost-domain.com";
```

Либо при открытии мини-приложения передайте query:

```
https://your-app.vercel.app/?api=https://your-bothost-domain.com
```

3. Deploy на Vercel (Import Git Repository → Deploy).
4. В [@BotFather](https://t.me/BotFather):
   - `/newapp` или `/myapps` → выберите бота → укажите URL Vercel
   - Либо `Bot Settings → Menu Button → Configure menu button` → URL мини-приложения

5. В `.env` бота на BotHost:

```env
WEBAPP_URL=https://your-app.vercel.app
API_BASE=https://your-bothost-public-url
START_API=1
CORS_ORIGINS=https://your-app.vercel.app,https://web.telegram.org
BOT_TOKEN=...
```

6. Скопируйте `api.py` из `../bot_side/` в корень репозитория бота (рядом с `main.py`, `game_config.py`).

## Структура

```
miniapp/
  index.html
  css/styles.css
  js/config.js    # API_BASE
  js/api.js       # fetch + Telegram initData
  js/app.js       # UI
  vercel.json
```

## Авторизация

Запросы к `/api/me` и `/api/me/collection` требуют заголовок:

```
X-Telegram-Init-Data: <Telegram.WebApp.initData>
```

Подпись проверяется на сервере через `BOT_TOKEN`.

## Локальная разработка

Откройте `index.html` через любой static server, либо:

```bash
npx serve .
```

Для API без Telegram можно временно положить сырой initData в `localStorage.dev_init_data` (только для отладки).
