import { Bot, InlineKeyboard } from 'grammy';
import * as nominationService from '../services/nominationService';
import sessions from '../state/creationSessions';

export function registerCommands(bot: Bot, db: any, isAdmin: (id?: number) => boolean) {
  // start: show nominations and 'Начать'
  bot.command('start', async (ctx) => {
    // Send welcome with list of nominations and 'Начать' button
    try {
      const noms = db.selectAllNominations ? db.selectAllNominations() : [];
      if (!noms || noms.length === 0) {
        await ctx.reply('Привет! В системе пока нет номинаций. Обратитесь к администратору.');
        return;
      }
      const lines = noms.map((n: any) => `${n.position}. ${n.title}${n.closed ? ' (закрыта)' : ''}`);
      const text = `Привет! Доступные номинации:\n${lines.join('\n')}\n\nНажмите «Начать», чтобы пройти голосование.`;
      const kb = new InlineKeyboard().text('Начать', 'begin');
      await ctx.reply(text, { reply_markup: kb });
    } catch (e) {
      await ctx.reply('Ошибка получения списка номинаций.');
    }
  });

  bot.command('me', async (ctx) => { const userId = ctx.from?.id; if (!userId) return ctx.reply('Не удалось определить ваш id.'); return ctx.reply(`Ваш Telegram ID: ${userId}`); });

  bot.command('add_nomination', async (ctx) => {
    const fromId = ctx.from?.id; if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
    const userId = ctx.from?.id; if (!userId) return ctx.reply('Не удалось определить ваш id.');
    sessions.startAwaitingTitle(userId);
    return ctx.reply('Отправьте название номинации (текст).');
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

  // Dev-only: seed test data
  bot.command('seed', async (ctx) => {
    const devMode = process.env.NODE_ENV === 'development' || process.env.DEV === 'true';
    if (!devMode) return ctx.reply('Команда /seed доступна только в dev режиме.');
    const fromId = ctx.from?.id; if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
    try {
      // wipe existing nominations/videos/votes (dev only)
      if (db && db.db) {
        db.db.prepare('DELETE FROM votes').run();
        db.db.prepare('DELETE FROM videos').run();
        db.db.prepare('DELETE FROM nominations').run();
      }
      const titles = ['Лучшее вступление', 'Лучшее соло', 'Лучший дуэт'];
      for (const t of titles) {
        const nom = nominationService.createNomination(db, t);
        for (let i = 1; i <= 4; i++) {
          nominationService.addVideoToNomination(db, nom.id, `file_${nom.id}_${i}`, `User${i}`);
        }
      }
      return ctx.reply('DB заполнена тестовыми данными.');
    } catch (e) {
      return ctx.reply('Ошибка при заполнении тестовых данных.');
    }
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
