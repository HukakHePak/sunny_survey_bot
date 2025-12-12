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

  bot.command(CommandNames.Add, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    const userId = from?.id; if (!userId) return ctx.reply('Не удалось определить ваш id.');
    sessions.startAwaitingTitle(userId);
    return ctx.reply('Отправьте название номинации (текст).');
  });

  // /show_next removed — admin flow replaced by other controls

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

  // list nominations (users can view; shows user's votes if any)
  bot.command(CommandNames.List, async (ctx) => {
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

  bot.command(CommandNames.Remove, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    const noms = nominationService.listNominations(db);
    if (!noms || noms.length === 0) return ctx.reply('Номинаций нет.');
    const kb = new InlineKeyboard();
    for (const n of noms) kb.text(`${n.title}`, `delete_nom:${n.id}`).row();
    return ctx.reply('Выбери номинацию для удаления (будет запрос подтверждения):', { reply_markup: kb });
  });

  bot.command(CommandNames.Results, async (ctx) => {
    const from = ctx.from; if (!isAdmin(from)) return ctx.reply('Нет прав.');
    try {
      const summary = nominationService.summaryResults(db);
      await ctx.reply(`Результаты:\n\n${summary}`);
    } catch (e) {
      await ctx.reply('Ошибка при формировании результатов.');
    }
  });
}
