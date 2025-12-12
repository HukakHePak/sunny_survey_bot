
# TGLI Bot

Кратко: Telegram-бот для проведения голосований. Репозиторий настроен под контейнерный рабочий процесс: всё развитие и тестирование выполняется в dev-контейнере.

Требования

- Docker и Docker Compose.

Файлы важные для работы

- `src/` — исходники
- `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`
- `.env.example` — пример переменных окружения

Быстрый старт (development — контейнер)

- Скопируйте `.env.example` → `.env` и укажите `BOT_TOKEN` (и при необходимости `ADMIN_CHAT_ID`, `DB_PATH`).
- Запустите dev-контейнер (монтирует код и включает hot-reload):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Для обычного запуска без пересборки:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Тесты (в контейнере)

```bash
docker compose -f docker-compose.dev.yml exec tglibot npm test -- --runInBand
```

Production: сборка образа и запуск

```bash
docker compose -f docker-compose.yml build --no-cache tglibot
docker compose -f docker-compose.yml up -d
```

Переменные окружения (основные)

- `BOT_TOKEN` — токен бота (обязательно).
- `ADMIN_CHAT_ID` — числовые id администраторов (через запятую).
- `DB_PATH` — путь к файлу БД в контейнере (обычно `/data/bot.db`); задаётся в `.env`.

Хранение данных

- Папка `./data` монтируется в контейнер и содержит SQLite БД.
 
Pruning local video storage

- Проект сохраняет загруженные видео в `./data/videos` чтобы не зависеть от долговечности `file_id` у Telegram.
- Запустить ручную ротацию:

```bash
node scripts/prune_videos.js
```

- Настройки через `.env`:
	- `VIDEO_STORE_DIR` — директория (по умолчанию `./data/videos`).
	- `VIDEO_STORE_MAX_FILES` — макс. количество файлов (по умолчанию `1000`).
	- `VIDEO_STORE_MAX_BYTES` — макс. общий размер (по умолчанию `5000000000`).

- Автоматическая ротация: в `docker-compose.yml` добавлен сервис `pruner`, который выполняет `prune_videos.js` в цикле (по умолчанию раз в 86400s). Интервал можно переопределить через `PRUNE_INTERVAL_SECONDS`.

- Чтобы при очистке голосов удалялись локальные файлы, установите `DELETE_VIDEO_FILES_ON_VOTE_CLEAR=1` перед запуском `node scripts/clear_votes.js`.
