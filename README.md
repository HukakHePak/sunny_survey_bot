# TGLI Bot

Минимальный каркас Telegram-бота для голосования.

Запуск (локально):

1. Установить зависимости:

```bash
npm install
```

2. Создать `.env` по примеру `.env.example` и указать `BOT_TOKEN`.

3. Запустить в режиме разработки:

```bash
npm run dev
```

Файлы с исходниками: `src/`.

Docker
------

Собрать и запустить контейнер локально (использует `./data` для БД и `.env` для токена):

```bash
docker compose build
docker compose up -d
```

Контейнер берёт `DB_PATH` из `.env` или по умолчанию пишет в `/data/bot.db`.

**Администраторы бота**

- Получить ваш числовой Telegram ID: откройте в Telegram бота @userinfobot или @GetMyID_bot и нажмите Start — он вернёт `id`.
- Альтернатива: если вы уже писали нашему боту, выполните:

```bash
curl -s "https://api.telegram.org/bot$BOT_TOKEN/getUpdates" | jq .
```
и найдите `from.id` в ответе.

- Добавьте ваш `id` в файл `.env` проекта в переменную `ADMIN_CHAT_ID` — числовые id через запятую для нескольких админов. Пример:

```
ADMIN_CHAT_ID=123456789
```

- После изменения `.env` перезапустите контейнер:

```bash
docker compose restart tglibot
```

Вы получите доступ к админ-командам (`/add_nomination`, `/show_next`, `/set_repeat_vote`, `/close_nomination`, `/export_results`).

Также в боте есть команда `/whoami`, которая пришлёт ваш числовой `id` в чате — удобно, если вы не хотите пользоваться внешними сервисами.
 
Development (hot-reload)

- Для разработки удобно запускать контейнер в режиме `dev`, чтобы изменения в `src/` подхватывались без пересборки образа.
- Пример: используется `docker-compose.dev.yml`, который монтирует текущую папку в контейнер и запускает `npm run dev`.

Запуск (рекомендуется для разработки):

```bash
# Однажды (если нужно) соберите образ с нуля и установите зависимости внутри контейнера
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# При дальнейшем запуске (без пересборки)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Windows (PowerShell) примеры:

```powershell
# Сборка и запуск
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# Запуск без пересборки
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Файлы монтируются в контейнер, и `ts-node-dev` перезапускает процесс при изменениях в `src/`.

