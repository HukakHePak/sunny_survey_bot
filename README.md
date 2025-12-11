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

