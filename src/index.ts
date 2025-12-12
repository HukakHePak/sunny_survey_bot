
import 'dotenv/config';
import path from 'path';
import { initDb } from './db';
import { startBot } from './bot';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is not set in environment');
  process.exit(1);
}

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'bot.db');
const db = initDb(dbPath);

(async () => {
  await startBot(token, db);
})();