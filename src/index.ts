import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { initDb } from './db';
import path from 'path';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is not set in environment');
  process.exit(1);
}

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'bot.db');
const db = initDb(dbPath);

const bot = new Bot(token);

bot.command('start', async (ctx) => {
  const keyboard = new InlineKeyboard().text('Начать', 'start_vote');
  await ctx.reply('Привет! Номинации: (пусто пока).', { reply_markup: keyboard });
});

bot.callbackQuery('start_vote', async (ctx) => {
  await ctx.answerCallbackQuery();
  // Placeholder: send first nomination
  await ctx.editMessageText(`Номинация 1:\n(4 видео)\n\nВыбери участника:`);
});

bot.on('message', async (ctx) => {
  // Fallback
  await ctx.reply('Используй /start для начала.');
});

if (process.env.DISABLE_TELEGRAM === 'true') {
  console.log('DISABLE_TELEGRAM=true — пропускаю инициализацию grammy');
  // Keep the process alive for in-container testing without connecting to Telegram
  setInterval(() => {}, 1 << 30);
} else {
  bot.start();
  console.log('Bot started');
}
