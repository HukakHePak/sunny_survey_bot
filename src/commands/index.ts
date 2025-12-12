import { Bot, InlineKeyboard } from 'grammy';
import * as nominationService from '../services/nominationService';

export function registerCommands(bot: Bot, db: any, isAdmin: (id?: number) => boolean) {
  bot.command('start', async (ctx) => { await ctx.reply('Привет! Используйте /whoami или команды админа.'); });

  bot.command('whoami', async (ctx) => { const userId = ctx.from?.id; if (!userId) return ctx.reply('Не удалось определить ваш id.'); return ctx.reply(`Ваш Telegram ID: ${userId}`); });

  bot.command('add_nomination', async (ctx) => {
    const fromId = ctx.from?.id; if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
    const parts = ctx.message?.text?.split(/\s+/) || []; const title = parts.slice(1).join(' ').trim();
    if (!title) return ctx.reply('Использование: /add_nomination <title>');
    const nom = nominationService.createNomination(db, title);
    return ctx.reply(`Создана номинация: id=${nom.id} position=${nom.position}`);
  });

  let nextPosition = 1;
  bot.command('show_next', async (ctx) => {
    const fromId = ctx.from?.id; if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
    const nom = nominationService.getNominationByPosition(db, nextPosition); if (!nom) return ctx.reply('Новых номинаций нет.');
    const videos = db.selectVideosByNomination(nom.id); if (!videos || videos.length === 0) return ctx.reply('У этой номинации нет видео.');
    await ctx.reply(`Номинация: ${nom.title}`);
    for (const v of videos) { try { await ctx.replyWithVideo(v.file_id, { caption: v.participant_nick || '' }); } catch (e) { /* ignore */ } }
    const kb = new InlineKeyboard(); for (const v of videos) kb.text(v.participant_nick || `#${v.id}`, `vote:${nom.id}:${v.id}`);
    await ctx.reply('Выбери участника:', { reply_markup: kb }); nextPosition += 1;
  });

  bot.command('export_results', async (ctx) => {
    const fromId = ctx.from?.id; if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
    const csv = nominationService.exportResults(db); const fn = `/data/results_${Date.now()}.csv`;
    try { (await import('fs')).default.writeFileSync(fn, csv, 'utf8'); await ctx.replyWithDocument({ source: (await import('fs')).default.createReadStream(fn) } as any); } catch (e) { await ctx.reply('Ошибка при создании файла результатов.'); }
  });

  bot.command('set_repeat_vote', async (ctx) => {
    const fromId = ctx.from?.id; if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
    const parts = ctx.message?.text?.split(/\s+/) || []; if (parts.length < 2) return ctx.reply('Использование: /set_repeat_vote on|off');
    const arg = parts[1].toLowerCase(); if (arg !== 'on' && arg !== 'off') return ctx.reply('Значение должно быть on или off');
    db.setSetting('repeat_votes_allowed', arg === 'on' ? '1' : '0'); return ctx.reply(`Повторное голосование теперь ${arg === 'on' ? 'разрешено' : 'запрещено'}`);
  });

  bot.command('close_nomination', async (ctx) => {
    const fromId = ctx.from?.id; if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
    const parts = ctx.message?.text?.split(/\s+/) || []; if (parts.length < 2) return ctx.reply('Использование: /close_nomination <nomination_id>');
    const id = Number(parts[1]); if (!id) return ctx.reply('Неверный id'); db.closeNomination(id); return ctx.reply(`Номинация ${id} закрыта администратором.`);
  });
}
