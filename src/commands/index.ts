import { Bot, InlineKeyboard } from 'grammy';
import * as nominationService from '../services/nominationService';
import sessions from '../state/creationSessions';
import CommandNames from './commandNames';

export function registerCommands(bot: Bot, db: any, isAdmin: (user?: { id?: number; username?: string } | number | string) => boolean) {
  // start: show nominations and 'Начать'
  bot.command(CommandNames.Start, async (ctx) => {
    // Send welcome with list of nominations and 'Начать' button
    try {
      const noms = db.selectAllNominations ? db.selectAllNominations() : [];
      if (!noms || noms.length === 0) {
        await ctx.reply('Привет! В системе пока нет номинаций. Обратитесь к администратору.');
        return;
      }
      const lines = noms.map((n: any) => `👑 ${n.title}${n.closed ? ' (закрыта)' : ''}`);
      const text = `Привет!\n\n${lines.join('\n\n')}\n\nНажми «Начать», чтобы пройти голосование.`;
      const kb = new InlineKeyboard().text('Начать', 'begin');
      await ctx.reply(text, { reply_markup: kb });
    } catch (e) {
      await ctx.reply('Ошибка получения списка номинаций.');
    }
  });

  bot.command(CommandNames.Add, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    const userId = from?.id; if (!userId) return ctx.reply('Не удалось определить ваш id.');
    sessions.startAwaitingTitle(userId);
    return ctx.reply('Отправьте название номинации (текст).');
  });

  // /show_next removed — admin flow replaced by other controls

  bot.command(CommandNames.Results, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    const csv = nominationService.exportResults(db); const fn = `/data/results_${Date.now()}.csv`;
    try { (await import('fs')).default.writeFileSync(fn, csv, 'utf8'); await ctx.replyWithDocument({ source: (await import('fs')).default.createReadStream(fn) } as any); } catch (e) { await ctx.reply('Ошибка при создании файла результатов.'); }
  });

  // /seed removed

  bot.command(CommandNames.RepeatVote, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    const cur = db.getSetting ? db.getSetting('repeat_votes_allowed') : '0';
    const next = cur === '1' ? '0' : '1';
    if (db.upsertSetting) db.upsertSetting('repeat_votes_allowed', next);
    return ctx.reply(`Повторное голосование теперь ${next === '1' ? 'разрешено' : 'запрещено'}`);
  });

  bot.command(CommandNames.Survey, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    // toggle global 'accepting applications' setting. When off, voting disabled for all nominations.
    const cur = db.getSetting ? db.getSetting('accepting_applications') : '1';
    const next = cur === '1' ? '0' : '1';
    if (db.upsertSetting) db.upsertSetting('accepting_applications', next);
    return ctx.reply(`Приём заявок теперь ${next === '1' ? 'включён' : 'закрыт'}. Голосование ${next === '1' ? 'разрешено' : 'заблокировано'}.`);
  });

  // list nominations for admin (to choose id to delete)
  bot.command(CommandNames.List, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    const noms = nominationService.listNominations(db);
    if (!noms || noms.length === 0) return ctx.reply('Номинаций нет.');
    const kb = new InlineKeyboard();
    for (const n of noms) {
      kb.text(`👑 ${n.title}`, `view_nom:${n.id}`).row();
    }
    return ctx.reply('Кликни номинацию, чтобы просмотреть её:', { reply_markup: kb });
  });

  bot.command(CommandNames.Remove, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    const noms = nominationService.listNominations(db);
    if (!noms || noms.length === 0) return ctx.reply('Номинаций нет.');
    const kb = new InlineKeyboard();
    for (const n of noms) kb.text(`👑 ${n.title}`, `delete_nom:${n.id}`).row();
    return ctx.reply('Выбери номинацию для удаления (будет запрос подтверждения):', { reply_markup: kb });
  });
}
