# Деплой Brainrot Mining на Cloudflare Workers (Free tier)

## Что создано

```
worker/
  index.js      ← точка входа Worker-а, все API-маршруты
  auth.js       ← Telegram initData проверка + сессионные cookie
  db.js         ← все D1-запросы (аккаунт, инвентарь, история)
  game.js       ← игровая логика (кейсы, апгрейды, рандом)
  bot.js        ← Telegram-бот через grammY webhook

public/         ← статические файлы (раздаёт ASSETS binding)
  index.html, style.css, case-opening.css
  app.js, case-opening.js, telegram-auth.js, live-spawns.js
  properties.js, properties.json
  images/

migrations/
  0001_init.sql         ← схема БД
  0002_seed_from_state.sql ← перенос данных из state.json (опционально)

wrangler.toml   ← конфиг Workers
scripts/
  set-webhook.js    ← установка Telegram webhook
  delete-webhook.js ← удаление webhook
```

---

## Шаг 1 — Установить зависимости

```powershell
cd "c:\Users\artem\Documents\Codex\2026-10-27\referenced-chatgpt-conversation-this-is-an\outputs\brainrot-farm-configurable"
npm install
```

---

## Шаг 2 — Войти в Cloudflare

```powershell
npx wrangler login
```

Откроется браузер. Авторизуйтесь через Cloudflare аккаунт.

---

## Шаг 3 — Создать D1 базу данных

```powershell
npx wrangler d1 create brainrot-mining-db
```

Команда выведет строку вида:
```
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Скопируйте этот ID** и вставьте в `wrangler.toml` вместо `REPLACE_WITH_YOUR_D1_DATABASE_ID`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "brainrot-mining-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← вставить сюда
```

---

## Шаг 4 — Применить SQL-миграции

```powershell
# Создать схему в продакшн D1
npx wrangler d1 migrations apply brainrot-mining-db --remote

# Опционально: перенести данные из state.json
npx wrangler d1 execute brainrot-mining-db --remote --file=migrations/0002_seed_from_state.sql
```

---

## Шаг 5 — Установить секреты Cloudflare

Каждый секрет вводится интерактивно (вставить значение, Enter):

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBAPP_URL
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put SESSION_SECRET
```

Значения:
| Переменная | Что вставить |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен от @BotFather, например `1234567890:AAH...` |
| `TELEGRAM_WEBAPP_URL` | URL вашего Worker-а, например `https://brainrot-mining.workers.dev` |
| `TELEGRAM_WEBHOOK_SECRET` | Любая случайная строка 32+ символов |
| `SESSION_SECRET` | Другая случайная строка 32+ символов |

Сгенерировать случайные строки в PowerShell:
```powershell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

---

## Шаг 6 — Деплой

```powershell
npx wrangler deploy --non-interactive
```

После деплоя вы увидите URL вида:
```
https://brainrot-mining.YOUR_SUBDOMAIN.workers.dev
```

---

## Шаг 7 — Установить Telegram Webhook

```powershell
$env:TELEGRAM_BOT_TOKEN = "ВАШ_ТОКЕН"
$env:TELEGRAM_WEBAPP_URL = "https://brainrot-mining.YOUR_SUBDOMAIN.workers.dev"
$env:TELEGRAM_WEBHOOK_SECRET = "ВАШ_СЕКРЕТ"
node scripts/set-webhook.js
```

Должно вывести:
```
✅ Webhook set: https://brainrot-mining.YOUR_SUBDOMAIN.workers.dev/api/telegram-webhook
```

Проверка webhook:
```powershell
Invoke-RestMethod "https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

---

## Шаг 8 — Подключить GitHub → Cloudflare (автодеплой)

1. Запушьте проект в GitHub:
```powershell
git init
git add .
git commit -m "Initial Cloudflare Workers migration"
git remote add origin https://github.com/ВАШ_АККАУНТ/BRAINROTMAINING.git
git push -u origin main
```

2. В **Cloudflare Dashboard** → Workers & Pages → Create → Workers → Connect to Git
3. Выберите репозиторий
4. Настройте:
   - **Build command**: `npm install`
   - **Deploy command**: `npx wrangler deploy --non-interactive`
   - **Root directory**: `/` (корень репозитория)
5. Секреты уже установлены через `wrangler secret put` — они сохранятся

---

## Локальная разработка

```powershell
# 1. Создать .dev.vars (скопировать и заполнить)
copy .dev.vars.example .dev.vars   # если создадите .dev.vars.example

# 2. Применить схему локально
npx wrangler d1 migrations apply brainrot-mining-db --local

# 3. Запустить
npx wrangler dev --local
```

Сайт откроется на http://localhost:8787

> ⚠️ Telegram Mini App требует HTTPS — для тестирования auth используйте ngrok:
> ```powershell
> ngrok http 8787
> # Установить webhook на https://xxxx.ngrok.io
> node scripts/set-webhook.js
> ```

---

## Структура API

| Метод | URL | Описание |
|---|---|---|
| GET | `/api/config` | Конфиг игры (без авторизации) |
| GET | `/api/auth/me` | Проверить сессию |
| POST | `/api/auth/telegram-webapp` | Войти через Telegram initData |
| POST | `/api/auth/logout` | Выйти |
| GET | `/api/state` | Баланс, инвентарь, история |
| GET | `/api/live-events` | Последние 30 дропов |
| POST | `/api/sell-item` | Продать предмет |
| POST | `/api/upgrade` | Апгрейд предмета |
| POST | `/api/open-case` | Открыть кейс |
| POST | `/api/telegram-webhook` | Telegram bot webhook |
| GET | `/*` | Статические файлы |

---

## Ограничения бесплатного тарифа Cloudflare Workers

| Параметр | Лимит Free | Хватит для |
|---|---|---|
| Запросы/день | 100,000 | ~100K открытий кейсов |
| CPU время/запрос | 10 мс | Достаточно (D1 + логика) |
| D1 запросы/день | 5,000,000 | Более чем достаточно |
| D1 хранилище | 5 GB | Хватит на годы |
| Static assets | 20 MB | Хватит (изображения ~2 MB) |

Если лимиты исчерпаются — Workers Paid стоит $5/мес и снимает практически все ограничения.

---

## Переменные окружения (итоговый список)

| Переменная | Тип | Где задать |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Secret | `wrangler secret put` |
| `TELEGRAM_WEBAPP_URL` | Secret | `wrangler secret put` |
| `TELEGRAM_WEBHOOK_SECRET` | Secret | `wrangler secret put` |
| `SESSION_SECRET` | Secret | `wrangler secret put` |
| `TELEGRAM_ADMIN_ID` | Var (не секрет) | `wrangler.toml` → `[vars]` |
| `DB` | D1 Binding | `wrangler.toml` → `[[d1_databases]]` |
| `ASSETS` | Assets Binding | `wrangler.toml` → `[assets]` |
