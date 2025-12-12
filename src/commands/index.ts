import { Bot, InlineKeyboard } from 'grammy';
import * as nominationService from '../services/nominationService';
import sessions from '../state/creationSessions';
import CommandNames from './commandNames';

export function registerCommands(bot: Bot, db: any, isAdmin: (user?: { id?: number; username?: string } | number | string) => boolean) {
  // start: show nominations and 'Начать'
  const safeCommand = (name: string, handler: (ctx: any) => any) => {
    try {
      bot.command(name, handler as any);
    } catch (e) {
      console.warn('Failed to register command', name, e);
    }
  };
  safeCommand(CommandNames.Start, async (ctx) => {
    // Send welcome with list of nominations and 'Начать' button
    try {
      const noms = db.selectAllNominations ? db.selectAllNominations() : [];
      if (!noms || noms.length === 0) {
        await ctx.reply('Привет! В системе пока нет номинаций. Обратитесь к администратору.');
        return;
      }
      const accepting = db.getSetting ? db.getSetting('accepting_applications') : '1';
      const repeat = db.getSetting ? db.getSetting('repeat_votes_allowed') : '1';
      const lines = noms.map((n: any) => `👑 ${n.title}${n.closed ? ' (закрыта)' : ''}`);
      let text = `Привет! Голосование за номинации:\n\n${lines.join('\n\n')}`;
      if (accepting !== '1') {
        text += `\n\nПриём заявок временно закрыт. Голосование недоступно.`;
        await ctx.reply(text);
        return;
      }
      if (repeat !== '1') {
        text += `\n\nПовторное голосование запрещено администратором.`;
        await ctx.reply(text);
        return;
      }
      // accepting === '1' && repeat === '1'
      text += `\n\nНажми «Начать», чтобы пройти голосование.`;
      const kb = new InlineKeyboard().text('Начать', 'begin');
      await ctx.reply(text, { reply_markup: kb });
    } catch (e) {
      await ctx.reply('Ошибка получения списка номинаций.');
    }
  });

  safeCommand(CommandNames.Add, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    const userId = from?.id; if (!userId) return ctx.reply('Не удалось определить ваш id.');
    sessions.startAwaitingTitle(userId);
    return ctx.reply('Отправьте название номинации (текст).');
  });

  // /show_next removed — admin flow replaced by other controls

  safeCommand(CommandNames.RepeatVote, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    const cur = db.getSetting ? db.getSetting('repeat_votes_allowed') : '0';
    const next = cur === '1' ? '0' : '1';
    if (db.upsertSetting) db.upsertSetting('repeat_votes_allowed', next);
    return ctx.reply(`Повторное голосование теперь ${next === '1' ? 'разрешено' : 'запрещено'}`);
  });

  safeCommand(CommandNames.Stats, async (ctx) => {
    try {
      const noms = db.selectAllNominations ? db.selectAllNominations() : [];
      let videosCount = 0;
      if (db.db) {
        try { videosCount = db.db.prepare('SELECT COUNT(*) as c FROM videos').get()?.c || 0; } catch (e) { videosCount = 0; }
      } else if (db.selectAllNominations && db.selectVideosByNomination) {
        for (const n of noms) { const vs = db.selectVideosByNomination(n.id) || []; videosCount += vs.length; }
      }
      const accepting = db.getSetting ? db.getSetting('accepting_applications') : '1';
      const repeat = db.getSetting ? db.getSetting('repeat_votes_allowed') : '1';
      const dbPath = process.env.DB_PATH || 'unknown';
      const from = ctx.from;
      const adminStatus = from ? (isAdmin(from) ? '✅ Вы администратор' : '❌ Вы не администратор') : 'Неизвестно';
      const lines = [
        `Статус бота:`,
        `Номинаций: ${noms.length}`,
        `Видео: ${videosCount}`,
        `Приём заявок: ${accepting === '1' ? 'включён' : 'закрыт'}`,
        `Повторное голосование: ${repeat === '1' ? 'разрешено' : 'запрещено'}`,
        `DB: ${dbPath}`,
        `Права: ${adminStatus}`,
      ];
      await ctx.reply(lines.join('\n'));
    } catch (e) {
      await ctx.reply('Ошибка при получении статуса.');
    }
  });

  safeCommand(CommandNames.Survey, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    // toggle global 'accepting applications' setting. When off, voting disabled for all nominations.
    const cur = db.getSetting ? db.getSetting('accepting_applications') : '1';
    const next = cur === '1' ? '0' : '1';
    if (db.upsertSetting) db.upsertSetting('accepting_applications', next);
    return ctx.reply(`Приём заявок теперь ${next === '1' ? 'включён' : 'закрыт'}. Голосование ${next === '1' ? 'разрешено' : 'заблокировано'}.`);
  });

  safeCommand(CommandNames.Update, async (ctx) => {
    const from = ctx.from; if (!from || !from.id) return ctx.reply('Не удалось определить ваш id.');
    const isDev = process.env.NODE_ENV === 'development' || process.env.DISABLE_TELEGRAM === 'true';
    if (!isDev && !isAdmin(from)) return ctx.reply('Нет прав.');
    const userId = Number(from.id);
    const cmds = [
      { command: CommandNames.Start, description: 'Запустить бота' },
      { command: CommandNames.Add, description: 'Добавить номинацию' },
      { command: CommandNames.List, description: 'Показать номинации' },
      { command: CommandNames.Remove, description: 'Удалить номинацию' },
      { command: CommandNames.Survey, description: 'Возобновить/остановить голосование' },
      { command: CommandNames.RepeatVote, description: 'Разрешить/запретить повторное голосование' },
      { command: CommandNames.Results, description: 'Показать результаты' },
      { command: CommandNames.Stats, description: 'Статус бота' },
    ];
    try {
      // In dev: if caller is NOT admin, clear commands for their chat (hide menu).
      if (isDev && !isAdmin(from)) {
        await ctx.api.setMyCommands([], { scope: { type: 'chat', chat_id: userId } as any });
        return ctx.reply('Интерфейс очищён для вашего чата.');
      }
      // Otherwise (admin or production): install full commands for the chat
      await ctx.api.setMyCommands(cmds as any, { scope: { type: 'chat', chat_id: userId } as any });
      return ctx.reply('Интерфейс обновлён.');
    } catch (e) {
      console.warn('setMyCommands failed for update', userId, e);
      return ctx.reply('Не удалось обновить интерфейс.');
    }
  });

  // list nominations (users can view; shows user's votes if any)
  safeCommand(CommandNames.List, async (ctx) => {
    const user = ctx.from; if (!user || !user.id) return ctx.reply('Не удалось определить ваш id.');
    const userId = user.id;
    const noms = nominationService.listNominations(db);
    if (!noms || noms.length === 0) return ctx.reply('Номинаций нет.');
    const lines: string[] = [];
    for (const n of noms) {
      const voteRow = db.selectUserVote ? db.selectUserVote(userId, n.id) : null;
      let line = `${n.title}`;
      if (voteRow && voteRow.video_id) {
        const vids = db.selectVideosByNomination ? db.selectVideosByNomination(n.id) : [];
        const vid = vids.find((v: any) => Number(v.id) === Number(voteRow.video_id));
        const nick = vid ? (vid.participant_nick || `#${vid.id}`) : `#${voteRow.video_id}`;
        line += ` — Вы проголосовали за: ${nick}`;
      }
      lines.push(line);
    }
    const kb = new InlineKeyboard();
    for (const n of noms) kb.text(`${n.title}`, `view_nom:${n.id}`).row();
    await ctx.reply(lines.join('\n\n'));
    return ctx.reply('Кликни номинацию, чтобы просмотреть её:', { reply_markup: kb });
  });

  safeCommand(CommandNames.Remove, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    const noms = nominationService.listNominations(db);
    if (!noms || noms.length === 0) return ctx.reply('Номинаций нет.');
    const kb = new InlineKeyboard();
    for (const n of noms) kb.text(`${n.title}`, `delete_nom:${n.id}`).row();
    return ctx.reply('Выбери номинацию для удаления (будет запрос подтверждения):', { reply_markup: kb });
  });

  safeCommand(CommandNames.Results, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    try {
      const summary = nominationService.summaryResults(db);
      await ctx.reply(`Результаты:\n\n${summary}`);
    } catch (e) {
      await ctx.reply('Ошибка при формировании результатов.');
    }
  });

}
