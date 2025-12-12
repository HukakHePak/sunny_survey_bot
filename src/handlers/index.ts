import { Bot, InlineKeyboard } from 'grammy';
import * as votingService from '../services/votingService';
import * as nominationService from '../services/nominationService';
import * as userService from '../services/userService';

export function registerHandlers(bot: Bot, db: any, isAdmin: (id?: number) => boolean) {
  // begin callback: initialize user position and send first nomination
  bot.callbackQuery('begin', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id; if (!userId) return;
    try {
      // set user to first nomination
      if (db.setUserPosition) db.setUserPosition(userId, 1);
      // find first non-closed nomination
      let pos = 1;
      let nom = db.selectNominationByPosition ? db.selectNominationByPosition(pos) : null;
      while (nom && nom.closed) { pos += 1; nom = db.selectNominationByPosition ? db.selectNominationByPosition(pos) : null; }
      if (!nom) return ctx.reply('Нет номинаций для начала.');
      if (db.setUserPosition) db.setUserPosition(userId, pos);
      await sendNominationToUser(bot, db, userId, nom);
    } catch (e) {
      // ignore
    }
  });

  bot.on('message', async (ctx) => {
    const msg = ctx.message as any; const caption: string | undefined = msg?.caption;
    if (caption && caption.startsWith('/add_video')) {
      const parts = caption.split(/\s+/); if (parts.length < 3) return ctx.reply('Использование: /add_video <nomination_id> <nick>');
      const nominationId = Number(parts[1]); const nick = parts.slice(2).join(' '); if (!nominationId || !nick) return ctx.reply('Неверные параметры.');
      const fileId = msg.video?.file_id || msg.document?.file_id; if (!fileId) return ctx.reply('Прикрепите видео.');
      const res = nominationService.addVideoToNomination(db, nominationId, fileId, nick); return ctx.reply(`Видео добавлено id=${res.id}`);
    }
  });

  bot.callbackQuery(/^vote:/, async (ctx) => {
    await ctx.answerCallbackQuery(); const parts = (ctx.callbackQuery.data || '').split(':'); if (parts.length !== 3) return;
    const nominationId = Number(parts[1]); const videoId = Number(parts[2]); const userId = ctx.from?.id; if (!userId) return;

    const res = votingService.recordVote(db, userId, nominationId, videoId);
    if (!res || res.success === false) return ctx.answerCallbackQuery({ text: res?.reason || 'Голос не принят.' });

    const videos = db.selectVideosByNomination(nominationId);
    const counts = votingService.getVoteCounts(db, nominationId) || [];
    const countsMap: Record<number, number> = {}; for (const c of counts) countsMap[c.video_id] = c.votes || 0;

    const kb = new InlineKeyboard(); for (const v of videos) kb.text(v.participant_nick || `#${v.id}`, `vote:${nominationId}:${v.id}`);
    const text = 'Ваш голос учтён.\n' + videos.map((v: any) => `${v.participant_nick || `#${v.id}`}: ${countsMap[v.id] || 0}`).join('\n');
    try { await ctx.editMessageText(text, { reply_markup: kb }); } catch (e) { await ctx.reply(text); }

    // advance and skip closed nominations
    let nextPos = userService.advanceUserPosition(db, userId);
    let nextNom = nominationService.getNominationByPosition(db, nextPos);
    while (nextNom && nextNom.closed) {
      nextPos = userService.advanceUserPosition(db, userId);
      nextNom = nominationService.getNominationByPosition(db, nextPos);
    }
    if (nextNom) {
      try { await sendNominationToUser(bot, db, userId, nextNom); } catch (e) {}
    } else {
      // no more nominations -> completion
      const kb = new InlineKeyboard().text('Завершить', 'finish');
      try { await bot.api.sendMessage(userId, 'Вы проголосовали по всем номинациям. Нажмите Завершить.', { reply_markup: kb }); } catch (e) {}
    }
  });

  // finish callback: acknowledge and reset progress
  bot.callbackQuery('finish', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id; if (!userId) return;
    try {
      if (db.setUserPosition) db.setUserPosition(userId, 1);
      await ctx.reply('Спасибо! Вы завершили голосование.');
    } catch (e) {}
  });

}

export async function sendNominationToUser(bot: Bot, db: any, userId: number, nom: any) {
  try {
    await bot.api.sendMessage(userId, `Номинация: ${nom.title}`);
    const videos = (db.selectVideosByNomination && db.selectVideosByNomination(nom.id)) || [];
    const first = videos.slice(0, 4);
    // send up to 4 videos
    for (const v of first) {
      try {
        await bot.api.sendVideo(userId, v.file_id, { caption: v.participant_nick || '' });
      } catch (e) {
        try { await bot.api.sendMessage(userId, `${v.participant_nick || ''} — видео недоступно`); } catch (e) {}
      }
    }
    const kb = new InlineKeyboard();
    for (const v of first) kb.text(v.participant_nick || `#${v.id}`, `vote:${nom.id}:${v.id}`);
    await bot.api.sendMessage(userId, 'Выбери участника:', { reply_markup: kb });
  } catch (e) { /* ignore send errors */ }
}
