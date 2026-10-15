# Мряу — Telegram Mini App (Vercel)

Фронтенд мини-приложения. API живёт на BotHost вместе с ботом.

## Структура

```
miniapp/
  index.html
  styles.css
  app.js
  vercel.json
  README.md
```

## Настройка

1. Создайте репозиторий и задеплойте на Vercel.
2. Укажите URL API бота. Два варианта:

### Вариант A — в `index.html` перед `app.js`

```html
<script>
  window.__API_BASE__ = "https://YOUR-BOTHOST-DOMAIN";
</script>
<script src="app.js"></script>
```

### Вариант B — meta-тег

```html
<meta name="api-base" content="https://YOUR-BOTHOST-DOMAIN" />
```

3. В BotFather / настройках бота:
   - Menu Button → Web App URL = `https://your-app.vercel.app`
   - или `WEBAPP_URL` / deep-link `?startapp` уже в боте.

4. На API (BotHost) в `.env`:

```env
START_API=1
BOT_TOKEN=...
CORS_ORIGINS=https://your-app.vercel.app,https://*.vercel.app
```

`CORS_ORIGINS=*` тоже работает для теста.

## Вкладки

| Вкладка    | Содержимое |
|------------|------------|
| Карточки   | Свои карточки, фильтр по редкости, просмотр фото |
| Топ        | Монеты / карточки / стрик. Клик по игроку → его профиль |
| Профиль    | Монеты, кол-во карточек, стрик. Чужие карточки не показываются |

## Локальная проверка

Откройте из Telegram (initData обязателен). Без Telegram API вернёт 401.
