import { Bot, InlineKeyboard } from 'grammy';
import * as votingService from '../services/votingService';
import * as nominationService from '../services/nominationService';
import * as userService from '../services/userService';
import sessions from '../state/creationSessions';

export function registerHandlers(bot: Bot, db: any, isAdmin: (user?: { id?: number; username?: string } | number | string) => boolean) {
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
    const userId = ctx.from?.id;
    if (userId) {
      const session = sessions.getSession(userId);
      if (session) {
        if (session.state === 'awaiting_title') {
          if (msg.text && !msg.text.startsWith('/')) {
            const title = msg.text.trim();
            // do not create nomination yet — wait for at least one video
            sessions.startCollectingPending(userId, title);
            await ctx.reply(`Название получено: "${title}". Теперь отправьте первое видео с подписью (ник участника). Номинация будет создана только после добавления видео. Отправьте любое текстовое сообщение или команду, чтобы отменить.`);
          } else {
            await ctx.reply('Ожидаю название номинации (текст).');
          }
          return;
        }

        if (session.state === 'collecting_videos') {
          // if message contains video/document -> try add
          const fileId = msg.video?.file_id || msg.document?.file_id;
          if (fileId) {
            const nick = msg.caption?.trim();
            if (!nick) {
              await ctx.reply('Ошибка: видео должно содержать имя участника в подписи. Видео не добавлено.');
            } else {
              const res = nominationService.addVideoToNomination(db, session.nominationId, fileId, nick);
              await ctx.reply(`Видео участника "${nick}" добавлено.`);
            }
            return;
          }
          // any non-video message or command ends collection
          sessions.endSession(userId);
          await ctx.reply('Добавление видео завершено.');
          return;
        }

        if (session.state === 'collecting_videos_pending') {
          // waiting for first video to create nomination
          const fileId = msg.video?.file_id || msg.document?.file_id;
          if (fileId) {
            const nick = msg.caption?.trim();
            if (!nick) {
              await ctx.reply('Ошибка: видео должно содержать имя участника в подписи. Видео не добавлено.');
              return;
            }
            // create nomination now and add video
            try {
              const title = (session as any).title;
              const nom = nominationService.createNomination(db, title);
              nominationService.addVideoToNomination(db, nom.id, fileId, nick);
              sessions.startCollecting(userId, nom.id);
              await ctx.reply(`Номинация "${title}" создана и первое видео участника "${nick}" добавлено.`);
            } catch (e) {
              await ctx.reply('Ошибка при создании номинации.');
            }
            return;
          }
          // non-video -> cancel pending nomination
          sessions.endSession(userId);
          await ctx.reply('Добавление отменено. Номинация не создана.');
          return;
        }
      }
    }

    // fallback existing add_video pattern (legacy): /add_video <id> <nick> in caption
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

    const videos = db.selectVideosByNomination(nominationId) || [];
    const selected = videos.find((v: any) => Number(v.id) === Number(videoId));
    const nomination = db.selectNominationById ? db.selectNominationById(nominationId) : null;
    const participant = selected ? (selected.participant_nick || `#${selected.id}`) : `#${videoId}`;
    const title = nomination ? nomination.title : '';
    const text = `Вы проголосовали за ${participant}${title ? ' — ' + title : ''}`;
    try { await ctx.editMessageText(text); } catch (e) { await ctx.reply(text); }

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

  // view nomination callback (from list) — open nomination for user
  bot.callbackQuery(/^view_nom:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const parts = (ctx.callbackQuery.data || '').split(':'); if (parts.length !== 2) return;
    const id = Number(parts[1]); if (!id) return;
    const nom = db.selectNominationById ? db.selectNominationById(id) : null;
    if (!nom) return ctx.reply('Номинация не найдена.');
    const userId = ctx.from?.id; if (!userId) return;
    try {
      await sendNominationToUser(bot, db, userId, nom);
    } catch (e) { /* ignore */ }
  });

  // delete nomination flow: admin clicks delete -> confirmation -> confirm_delete
  bot.callbackQuery(/^delete_nom:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const from = ctx.from; if (!isAdmin(from)) return ctx.answerCallbackQuery({ text: 'Нет прав.' });
    const parts = (ctx.callbackQuery.data || '').split(':'); if (parts.length !== 2) return;
    const id = Number(parts[1]); if (!id) return;
    const kb = new InlineKeyboard().text('Удалить', `confirm_delete:${id}`).text('Отмена', `cancel_delete:${id}`);
    try { await ctx.reply(`Подтвердите удаление номинации ${id}:`, { reply_markup: kb }); } catch (e) { }
  });

  bot.callbackQuery(/^confirm_delete:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const from = ctx.from; if (!isAdmin(from)) return ctx.answerCallbackQuery({ text: 'Нет прав.' });
    const parts = (ctx.callbackQuery.data || '').split(':'); if (parts.length !== 2) return;
    const id = Number(parts[1]); if (!id) return;
    try {
      nominationService.deleteNomination(db, id);
      try { await ctx.editMessageText(`Номинация ${id} была удалена.`); } catch (e) { await ctx.reply(`Номинация ${id} была удалена.`); }
    } catch (e) {
      try { await ctx.reply('Ошибка при удалении номинации.'); } catch (e) {}
    }
  });

  bot.callbackQuery(/^cancel_delete:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const parts = (ctx.callbackQuery.data || '').split(':');
    try { await ctx.editMessageText('Удаление отменено.'); } catch (e) { try { await ctx.reply('Удаление отменено.'); } catch (e) {} }
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
