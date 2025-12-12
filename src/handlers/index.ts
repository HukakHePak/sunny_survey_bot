import { Bot, InlineKeyboard } from 'grammy';
import * as votingService from '../services/votingService';
import * as nominationService from '../services/nominationService';
import * as userService from '../services/userService';
import sessions from '../state/creationSessions';

export function registerHandlers(bot: Bot, db: any, isAdmin: (user?: { id?: number; username?: string } | number | string) => boolean) {
  // track messages sent by the bot per user (so we can delete them on retake)
  const userMessages: Record<number, number[]> = {};
  // track admin control message (save/cancel) per admin during nomination creation
  const adminControlsMsg: Record<number, number> = {};

  const pushMsg = (userId: number, msg: any) => {
    try {
      if (!msg) return;
      const mid = (msg as any).message_id || (msg as any).messageId || null;
      if (!mid) return;
      userMessages[userId] = userMessages[userId] || [];
      userMessages[userId].push(mid);
    } catch (e) { /* ignore */ }
  };

  // begin callback: initialize user position and send first nomination
  bot.callbackQuery('begin', async (ctx) => {
    await ctx.answerCallbackQuery();
    // delete the "Начать" message after click
    try { await ctx.deleteMessage(); } catch (e) { /* ignore */ }
    const userId = ctx.from?.id; if (!userId) return;
    // if accepting applications is disabled, do not proceed
    const accepting = db.getSetting ? db.getSetting('accepting_applications') : '1';
    if (accepting !== '1') {
      try { await ctx.reply('Приём заявок временно закрыт. Голосование недоступно.'); } catch (e) {}
      return;
    }
    try {
      // set user to first nomination
      if (db.setUserPosition) db.setUserPosition(userId, 1);
      // find first non-closed nomination
      let pos = 1;
      let nom = db.selectNominationByPosition ? db.selectNominationByPosition(pos) : null;
      while (nom && nom.closed) { pos += 1; nom = db.selectNominationByPosition ? db.selectNominationByPosition(pos) : null; }
      if (!nom) return ctx.reply('Нет номинаций для начала.');
      if (db.setUserPosition) db.setUserPosition(userId, pos);
      await sendNominationToUser(bot, db, userId, nom, pushMsg);
    } catch (e) {
      // ignore
    }
  });

  bot.on('message', async (ctx) => {
    const msg = ctx.message as any; const caption: string | undefined = msg?.caption;
    const from = ctx.from;
    const userId = from?.id;
    // ignore all plain messages from non-admin users — управление только через кнопки
    if (userId && !isAdmin(from)) return;
    if (userId) {
      const session = sessions.getSession(userId);
      if (session) {
        if (session.state === 'awaiting_title') {
          if (msg.text && !msg.text.startsWith('/')) {
            const title = msg.text.trim();
            // do not create nomination yet — wait for at least one video
            sessions.startCollectingPending(userId, title);
            const kb = new InlineKeyboard().text('Отмена', 'add_cancel');
            await ctx.reply(`Название получено: "${title}". Теперь отправьте первое видео с подписью (ник участника). Номинация будет создана только после добавления видео.`, { reply_markup: kb });
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
              try {
                const vids = db.selectVideosByNomination ? db.selectVideosByNomination(session.nominationId) : [];
                if (vids && vids.length >= 2) {
                  const mid = adminControlsMsg[userId];
                  if (mid) {
                    try { await bot.api.deleteMessage(userId, mid); } catch (e) {}
                    delete adminControlsMsg[userId];
                  }
                }
              } catch (e) { /* ignore */ }
            }
            return;
          }
          // any non-video message no longer auto-ends collection; instruct admin to use buttons
          await ctx.reply('Используйте кнопку "Сохранить" для завершения или "Отмена" для отмены добавления номинации.');
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
              // send control buttons (Save / Cancel)
              const kb = new InlineKeyboard().text('Сохранить', 'add_save').text('Отмена', 'add_cancel');
              const m = await ctx.reply(`Номинация "${title}" создана и первое видео участника "${nick}" добавлено. Добавляйте следующие видео или сохраните номинацию.`, { reply_markup: kb });
              try { adminControlsMsg[userId] = (m as any).message_id; } catch (e) {}
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
    try { await ctx.editMessageText(text); } catch (e) { const m = await ctx.reply(text); pushMsg(userId, m); }

    // advance and skip closed nominations
    let nextPos = userService.advanceUserPosition(db, userId);
    let nextNom = nominationService.getNominationByPosition(db, nextPos);
    while (nextNom && nextNom.closed) {
      nextPos = userService.advanceUserPosition(db, userId);
      nextNom = nominationService.getNominationByPosition(db, nextPos);
    }
    if (nextNom) {
      try { await sendNominationToUser(bot, db, userId, nextNom, pushMsg); } catch (e) {}
    } else {
      // no more nominations -> completion
      const kb = new InlineKeyboard().text('Завершить', 'finish');
      try { const m = await bot.api.sendMessage(userId, 'Вы проголосовали по всем номинациям. Нажмите Завершить.', { reply_markup: kb }); pushMsg(userId, m); } catch (e) {}
    }
  });

  // finish callback: acknowledge and reset progress
  bot.callbackQuery('finish', async (ctx) => {
    await ctx.answerCallbackQuery();
    // delete the "Завершить" message after click
    try { await ctx.deleteMessage(); } catch (e) { /* ignore */ }
    const userId = ctx.from?.id; if (!userId) return;
    try {
      if (db.setUserPosition) db.setUserPosition(userId, 1);
      const repeat = db.getSetting ? db.getSetting('repeat_votes_allowed') : '1';
      if (repeat === '1') {
        const kb = new InlineKeyboard().text('Да, пройти ещё раз', 'retake_yes').text('Нет', 'retake_no');
        const m = await bot.api.sendMessage(userId, 'Вы можете пройти голосование заново, чтобы изменить выбор. Хотите пройти ещё раз?', { reply_markup: kb });
        pushMsg(userId, m);
      } else {
        const m = await ctx.reply('Спасибо! ожидайте окончания голосования, чтобы узнать результаты.');
        pushMsg(userId, m);
      }
    } catch (e) {}
  });

  bot.callbackQuery('retake_no', async (ctx) => {
    await ctx.answerCallbackQuery();
    // delete the retake prompt and show waiting message
    try { await ctx.deleteMessage(); } catch (e) { /* ignore */ }
    try { await ctx.reply('Спасибо! Ожидайте результатов.'); } catch (e) { /* ignore */ }
  });

  bot.callbackQuery('retake_yes', async (ctx) => {
    await ctx.answerCallbackQuery();
    // user agreed: delete all tracked bot messages, reset position and send start message
    const userId = ctx.from?.id; if (!userId) return;
    try {
      // delete tracked bot messages
      const list = userMessages[userId] || [];
      for (const mid of list) {
        try { await bot.api.deleteMessage(userId, mid); } catch (e) { /* ignore */ }
      }
      userMessages[userId] = [];
      // reset position
      if (db.setUserPosition) db.setUserPosition(userId, 1);
      // send start-like message with nominations and Begin button
      const noms = db.selectAllNominations ? db.selectAllNominations() : [];
      if (!noms || noms.length === 0) {
        const m = await bot.api.sendMessage(userId, 'Привет! В системе пока нет номинаций. Обратитесь к администратору.');
        try { pushMsg(userId, m); } catch (e) {}
        return;
      }
      const accepting = db.getSetting ? db.getSetting('accepting_applications') : '1';
      const repeatSetting = db.getSetting ? db.getSetting('repeat_votes_allowed') : '1';
      const lines = noms.map((n: any) => `👑 ${n.title}${n.closed ? ' (закрыта)' : ''}`);
      let text = `Привет! Голосование за номинации:\n\n${lines.join('\n\n')}`;
      if (accepting !== '1') {
        text += `\n\nПриём заявок временно закрыт. Голосование недоступно.`;
        const m = await bot.api.sendMessage(userId, text);
        try { pushMsg(userId, m); } catch (e) {}
        return;
      }
      if (repeatSetting !== '1') {
        text += `\n\nПовторное голосование запрещено администратором.`;
        const m = await bot.api.sendMessage(userId, text);
        try { pushMsg(userId, m); } catch (e) {}
        return;
      }
      text += `\n\nНажми «Начать», чтобы пройти голосование.`;
      const kb = new InlineKeyboard().text('Начать', 'begin');
      const m = await bot.api.sendMessage(userId, text, { reply_markup: kb });
      try { pushMsg(userId, m); } catch (e) {}
    } catch (e) { /* ignore */ }
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
      await sendNominationToUser(bot, db, userId, nom, pushMsg);
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

  // admin add nomination: cancel or save
  bot.callbackQuery('add_cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id; if (!userId) return;
    if (!isAdmin(ctx.from)) return ctx.answerCallbackQuery({ text: 'Нет прав.' });
    const session = sessions.getSession(userId);
    try {
      if (!session) {
        try { await ctx.editMessageText('Добавление отменено.'); } catch (e) { await ctx.reply('Добавление отменено.'); }
        return;
      }
      if (session.state === 'collecting_videos_pending') {
        sessions.endSession(userId);
        try { await ctx.editMessageText('Добавление отменено. Номинация не создана.'); } catch (e) { await ctx.reply('Добавление отменено. Номинация не создана.'); }
        return;
      }
      if (session.state === 'collecting_videos') {
        const nomId = (session as any).nominationId;
        try { nominationService.deleteNomination(db, nomId); } catch (e) {}
        sessions.endSession(userId);
        try {
          // remove control message if present
          const mid = adminControlsMsg[userId]; if (mid) { try { await bot.api.deleteMessage(userId, mid); } catch (e) {} delete adminControlsMsg[userId]; }
        } catch (e) {}
        try { await ctx.editMessageText('Добавление отменено. Номинация не создана.'); } catch (e) { await ctx.reply('Добавление отменено. Номинация не создана.'); }
        return;
      }
    } catch (e) { try { await ctx.reply('Ошибка обработки отмены.'); } catch (er) {} }
  });

  bot.callbackQuery('add_save', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id; if (!userId) return;
    if (!isAdmin(ctx.from)) return ctx.answerCallbackQuery({ text: 'Нет прав.' });
    const session = sessions.getSession(userId);
    if (!session || session.state !== 'collecting_videos') {
      try { await ctx.reply('Нет активной сессии добавления номинации.'); } catch (e) {}
      return;
    }
    const nomId = (session as any).nominationId;
    const vids = db.selectVideosByNomination ? db.selectVideosByNomination(nomId) : [];
    if (!vids || vids.length < 2) {
      try { await ctx.reply('Нельзя сохранить — для номинации требуется минимум 2 видео.'); } catch (e) {}
      return;
    }
    // finalize
    sessions.endSession(userId);
    try {
      const mid = adminControlsMsg[userId]; if (mid) { try { await bot.api.deleteMessage(userId, mid); } catch (e) {} delete adminControlsMsg[userId]; }
    } catch (e) {}
    try { await ctx.editMessageText('Номинация сохранена.'); } catch (e) { try { await ctx.reply('Номинация сохранена.'); } catch (er) {} }
  });

  // vipe (wipe votes) confirmation handlers
  bot.callbackQuery('vipe_cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    try { await ctx.editMessageText('Операция отменена.'); } catch (e) { try { await ctx.reply('Операция отменена.'); } catch (e) {} }
  });

  bot.callbackQuery('vipe_confirm', async (ctx) => {
    await ctx.answerCallbackQuery();
    const from = ctx.from; if (!isAdmin(from)) return ctx.answerCallbackQuery({ text: 'Нет прав.' });
    try {
      // delete all votes
      if (db.db) {
        db.db.prepare('DELETE FROM votes').run();
        try { db.db.prepare('VACUUM').run(); } catch (e) { /* ignore */ }
        // reset user progress positions
        try { db.db.prepare('UPDATE user_progress SET position = 1').run(); } catch (e) { /* ignore */ }
      } else if (db.deleteAllVotes) {
        try { db.deleteAllVotes(); } catch (e) { /* ignore */ }
      }
      try { await ctx.editMessageText('Результаты голосования очищены.'); } catch (e) { await ctx.reply('Результаты голосования очищены.'); }
    } catch (e) {
      try { await ctx.reply('Ошибка при очистке результатов.'); } catch (er) {}
    }
  });

}

export async function sendNominationToUser(bot: Bot, db: any, userId: number, nom: any, pushMsg?: (uid: number, msg: any) => void) {
  try {
    const videos = (db.selectVideosByNomination && db.selectVideosByNomination(nom.id)) || [];
    const first = videos.slice(0, 4);
    // send up to 4 videos
    for (const v of first) {
      try {
        const m = await bot.api.sendVideo(userId, v.file_id, { caption: v.participant_nick || '' });
        try { if (pushMsg) pushMsg(userId, m); } catch (e) {}
      } catch (e) {
        try { const m = await bot.api.sendMessage(userId, `${v.participant_nick || ''} — видео недоступно`); if (pushMsg) pushMsg(userId, m); } catch (e) {}
      }
    }
    // check user's existing vote
    const userVoteRow = db.selectUserVote ? db.selectUserVote(userId, nom.id) : null;
    const repeat = db.getSetting ? db.getSetting('repeat_votes_allowed') : '1';
    if (userVoteRow && userVoteRow.video_id && repeat !== '1') {
      // find participant nick
      const selected = first.find((v: any) => Number(v.id) === Number(userVoteRow.video_id)) || (db.selectVideosByNomination ? db.selectVideosByNomination(nom.id).find((v: any) => Number(v.id) === Number(userVoteRow.video_id)) : null);
      const participant = selected ? (selected.participant_nick || `#${selected.id}`) : `#${userVoteRow.video_id}`;
      const text = `👑 ${nom.title}\n\nВы проголосовали за: ${participant}\n\nвы уже проголосовали, изменить выбор нельзя`;
      const m = await bot.api.sendMessage(userId, text);
      try { if (pushMsg) pushMsg(userId, m); } catch (e) {}
      return;
    }

    const kb = new InlineKeyboard();
    for (const v of first) kb.text(v.participant_nick || `#${v.id}`, `vote:${nom.id}:${v.id}`).row();
    const m = await bot.api.sendMessage(userId, `👑 ${nom.title}`, { reply_markup: kb });
    try { if (pushMsg) pushMsg(userId, m); } catch (e) {}
  } catch (e) { /* ignore send errors */ }
}
