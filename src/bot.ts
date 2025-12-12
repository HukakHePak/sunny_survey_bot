import { Bot } from 'grammy';
import { registerCommands } from './commands';
import { registerHandlers } from './handlers';

export async function startBot(token: string, db: any) {
  const bot = new Bot(token);

  bot.catch((err: any) => {
    try { console.error('Error in middleware', err.update ?? '', err.error ?? err); } catch (e) { console.error('Unhandled bot error', err); }
  });

  const ADMIN_IDS = process.env.ADMIN_CHAT_ID ? process.env.ADMIN_CHAT_ID.split(',').map((s) => s.trim()) : null;
  const ADMIN_USERNAMES = process.env.ADMIN_USERNAMES ? process.env.ADMIN_USERNAMES.split(',').map((s) => s.trim().replace(/^@/, '')) : null;
  const isAdmin = (user?: { id?: number; username?: string } | number | string) => {
    if (!ADMIN_IDS && !ADMIN_USERNAMES) return true; // no admin restriction
    // normalize
    if (typeof user === 'number' || (typeof user === 'string' && /^[0-9]+$/.test(user))) {
      const idStr = String(user);
      if (ADMIN_IDS && ADMIN_IDS.includes(idStr)) return true;
    } else if (typeof user === 'string') {
      const uname = user.replace(/^@/, '');
      if (ADMIN_USERNAMES && ADMIN_USERNAMES.includes(uname)) return true;
    } else if (user && typeof user === 'object') {
      if (user.id && ADMIN_IDS && ADMIN_IDS.includes(String(user.id))) return true;
      if (user.username && ADMIN_USERNAMES && ADMIN_USERNAMES.includes(String(user.username).replace(/^@/, ''))) return true;
    }
    return false;
  };

  registerCommands(bot, db, isAdmin);
  registerHandlers(bot, db, isAdmin);

  const botCommands = [
    { command: 'start', description: 'Запустить бота' },
    { command: 'me', description: 'Показать ваш numeric id' },
    { command: 'add_nomination', description: 'Добавить номинацию' },
    { command: 'show_next', description: 'Показать следующую номинацию (админ)' },
    { command: 'set_repeat_vote', description: 'Вкл/выкл повторные голоса (админ)' },
    { command: 'close_nomination', description: 'Закрыть номинацию (админ)' },
    { command: 'export_results', description: 'Экспорт результатов (админ)' },
  ];

  if (process.env.DISABLE_TELEGRAM === 'true') {
    console.log('DISABLE_TELEGRAM=true — пропускаю инициализацию grammy');
    setInterval(() => {}, 1 << 30);
  } else {
    if (ADMIN_IDS && ADMIN_IDS.length > 0) {
      for (const aid of ADMIN_IDS) {
        const idNum = Number(aid);
        if (!isNaN(idNum)) {
          try { await bot.api.setMyCommands(botCommands, { scope: { type: 'chat', chat_id: idNum } as any }); } catch (e) { console.warn('setMyCommands failed for', aid, e); }
        }
      }
    }
    await bot.start();
    console.log('Bot started');
  }

  return bot;
}
