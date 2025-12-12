import { Bot } from 'grammy';
import { registerCommands } from './commands';
import { registerHandlers } from './handlers';

export async function startBot(token: string, db: any) {
  const bot = new Bot(token);

  bot.catch((err: any) => {
    try { console.error('Error in middleware', err.update ?? '', err.error ?? err); } catch (e) { console.error('Unhandled bot error', err); }
  });

  const ADMIN_IDS = process.env.ADMIN_CHAT_ID ? process.env.ADMIN_CHAT_ID.split(',').map((s) => s.trim()) : null;
  const isAdmin = (userId?: number) => { if (!ADMIN_IDS) return true; if (!userId) return false; return ADMIN_IDS.includes(String(userId)); };

  registerCommands(bot, db, isAdmin);
  registerHandlers(bot, db, isAdmin);

  const botCommands = [
    { command: 'start', description: 'Запустить бота' },
    { command: 'whoami', description: 'Показать ваш numeric id' },
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
