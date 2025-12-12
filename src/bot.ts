import { Bot } from 'grammy';
import { registerCommands } from './commands';
import { registerHandlers } from './handlers';
import CommandNames from './commands/commandNames';
import { fullCommands, minimalCommands } from './commands/commandsList';
import { getSettingDefault } from './utils';
import { DbAPI } from './types';

export async function startBot(token: string, db: DbAPI) {
  const bot = new Bot(token);

  bot.catch((err: any) => {
    try { console.error('Error in middleware', err.update ?? '', err.error ?? err); } catch (e) { console.error('Unhandled bot error', err); }
  });

  const ADMIN_IDS = process.env.ADMIN_CHAT_ID ? process.env.ADMIN_CHAT_ID.split(',').map((s) => s.trim()) : null;
  const ADMIN_USERNAMES = process.env.ADMIN_USERNAMES ? process.env.ADMIN_USERNAMES.split(',').map((s) => s.trim().replace(/^@/, '')) : null;
  const isAdmin = (user?: { id?: number; username?: string } | number | string) => {
    // By default, do NOT grant admin rights unless configured via env vars
    if (!ADMIN_IDS && !ADMIN_USERNAMES) return false;
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

  const botCommands = fullCommands;

  if (process.env.DISABLE_TELEGRAM === 'true') {
    console.log('DISABLE_TELEGRAM=true — пропускаю инициализацию grammy');
    setInterval(() => {}, 1 << 30);
  } else {
    // set minimal commands for regular users (default/all scopes)
    try {
      await bot.api.setMyCommands(minimalCommands as any, { scope: { type: 'default' } as any });
    } catch (e) { }
    try {
      await bot.api.setMyCommands(minimalCommands as any, { scope: { type: 'all_private_chats' } as any });
    } catch (e) { }
    try {
      await bot.api.setMyCommands(minimalCommands as any, { scope: { type: 'all_group_chats' } as any });
    } catch (e) { }

    // set commands only for admin chats (if configured)
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
    // send admin status summary on startup
    try {
      const noms = db.selectAllNominations ? db.selectAllNominations() : [];
      let videosCount = 0;
      if (db.db) {
        try { videosCount = db.db.prepare('SELECT COUNT(*) as c FROM videos').get()?.c || 0; } catch (e) { videosCount = 0; }
      } else if (db.selectAllNominations && db.selectVideosByNomination) {
        for (const n of noms) { const vs = db.selectVideosByNomination(n.id) || []; videosCount += vs.length; }
      }
      const accepting = getSettingDefault(db, 'accepting_applications', '1');
      const repeat = getSettingDefault(db, 'repeat_votes_allowed', '1');
      const dbPath = process.env.DB_PATH || 'unknown';
      const lines = [
        `Бот запущен на сервере.`,
        `Номинаций: ${noms.length}`,
        `Видео: ${videosCount}`,
        `Приём заявок: ${accepting === '1' ? 'включён' : 'закрыт'}`,
        `Повторное голосование: ${repeat === '1' ? 'разрешено' : 'запрещено'}`,
        `DB: ${dbPath}`,
      ];
      const text = lines.join('\n');
      // send to numeric admin ids
      if (ADMIN_IDS && ADMIN_IDS.length > 0) {
        for (const aid of ADMIN_IDS) {
          const idNum = Number(aid);
          if (!isNaN(idNum)) {
            try { await bot.api.sendMessage(idNum, text); } catch (e) { console.warn('send admin status failed for', aid, e); }
          }
        }
      }
      // also attempt usernames
      if (ADMIN_USERNAMES && ADMIN_USERNAMES.length > 0) {
        for (const uname of ADMIN_USERNAMES) {
          const target = uname.startsWith('@') ? uname : `@${uname}`;
          try { await bot.api.sendMessage(target, text); } catch (e) { console.warn('send admin status failed for', target, e); }
        }
      }
      // skipping broadcast to all users on startup
    } catch (e) {
      console.warn('Failed to send admin startup status', e);
    }
  }

  return bot;
}
