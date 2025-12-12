import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { initDb } from './db';
import path from 'path';
import fs from 'fs';
bot.on('message', async (ctx) => {
  const msg = ctx.message as any;
  const caption: string | undefined = msg?.caption;
  // Handle video messages with caption: /add_video <nomination_id> <nick>
  if (caption && caption.startsWith('/add_video')) {
    const parts = caption.split(/\s+/);
    if (parts.length < 3) return ctx.reply('Использование в подписи видео: /add_video <nomination_id> <participant_nick>');
    const nominationId = Number(parts[1]);
    const nick = parts.slice(2).join(' ');
    if (!nominationId || !nick) return ctx.reply('Неверные параметры.');
    // get file id
    const fileId = msg.video?.file_id || msg.document?.file_id;
    if (!fileId) return ctx.reply('Прикрепите видео (как video или документ).');
    const res = db.addVideo(nominationId, fileId, nick);
    return ctx.reply(`Видео добавлено id=${res.id} к номинации ${nominationId}`);
  }

  // fallback: ignore plain text (we removed reply keyboard), only commands
  if (msg.text && msg.text.startsWith('/')) return;
  // otherwise do nothing (no reply keyboard)
});
    if (text === LABEL_WHOAMI) {
      const userId = ctx.from?.id;
      if (!userId) return ctx.reply('Не удалось определить ваш id.');
      return ctx.reply(`Ваш Telegram ID: ${userId}`);
    }

    // Добавить номинацию — подсказка
    if (text === LABEL_ADD_NOM) {
      const fromId = ctx.from?.id;
      if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
      return ctx.reply('Использование: /add_nomination <название номинации>');
    }

    // Показать следующую (админ)
    if (text === LABEL_SHOW_NEXT) {
      const fromId = ctx.from?.id;
      if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
      const nom = db.getNominationByPosition(nextPosition);
      if (!nom) return ctx.reply('Новых номинаций нет.');
      const videos = db.getVideosByNomination(nom.id);
      if (!videos || videos.length === 0) return ctx.reply('У этой номинации нет привязанных видео.');

      await ctx.reply(`Номинация: ${nom.title}`);
      for (const v of videos) {
        try {
          await ctx.replyWithVideo(v.file_id, { caption: v.participant_nick || '' });
        } catch (e) {
          await ctx.reply(`Не удалось отправить видео id=${v.id}`);
        }
      }

      const kb = new InlineKeyboard();
      for (const v of videos) {
        kb.text(v.participant_nick || `#${v.id}`, `vote:${nom.id}:${v.id}`);
      }
      await ctx.reply('Выбери участника:', { reply_markup: kb });
      nextPosition += 1;
      return;
    }

    // Toggle repeat votes
    if (text === LABEL_TOGGLE_REPEAT) {
      const fromId = ctx.from?.id;
      if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
      const cur = db.getSetting('repeat_votes_allowed');
      const next = cur === '1' ? '0' : '1';
      db.setSetting('repeat_votes_allowed', next);
      return ctx.reply(`Повторное голосование теперь ${next === '1' ? 'разрешено' : 'запрещено'}`);
    }

    // Close nomination instruction
    if (text === LABEL_CLOSE_NOM) {
      const fromId = ctx.from?.id;
      if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
      return ctx.reply('Использование: /close_nomination <id> — чтобы закрыть конкретную номинацию');
    }

    // Export results
    if (text === LABEL_EXPORT) {
      const fromId = ctx.from?.id;
      if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
      const csv = db.exportResultsCSV();
      const fn = `/data/results_${Date.now()}.csv`;
      try {
        fs.writeFileSync(fn, csv, 'utf8');
        await ctx.replyWithDocument({ source: fs.createReadStream(fn) } as any);
      } catch (e) {
        await ctx.reply('Ошибка при создании файла результатов.');
      }
      return;
    }
  }
  if (caption && caption.startsWith('/add_video')) {
    const parts = caption.split(/\s+/);
    if (parts.length < 3) return ctx.reply('Использование в подписи видео: /add_video <nomination_id> <participant_nick>');
    const nominationId = Number(parts[1]);
    const nick = parts.slice(2).join(' ');
    if (!nominationId || !nick) return ctx.reply('Неверные параметры.');
    // get file id
    const fileId = msg.video?.file_id || msg.document?.file_id;
    if (!fileId) return ctx.reply('Прикрепите видео (как video или документ).');
    const res = db.addVideo(nominationId, fileId, nick);
    return ctx.reply(`Видео добавлено id=${res.id} к номинации ${nominationId}`);
  }

  // fallback
  if (msg.text && msg.text.startsWith('/')) return; // other commands
  await ctx.reply('Используйте /start или админ-команды.');
});

// Handle vote callbacks: data format vote:<nominationId>:<videoId>
bot.callbackQuery(/^vote:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const data = ctx.callbackQuery.data || '';
  const parts = data.split(':');
  if (parts.length !== 3) return;
  const nominationId = Number(parts[1]);
  const videoId = Number(parts[2]);
  const userId = ctx.from?.id;
  if (!userId) return;

  const res = db.recordVote(userId, nominationId, videoId);
  if (!res || res.success === false) {
    return ctx.answerCallbackQuery({ text: res?.reason || 'Голос не принят.' });
  }

  const videos = db.getVideosByNomination(nominationId);
  const counts = db.getVoteCountsForNomination(nominationId) || [];
  const countsMap: Record<number, number> = {};
  for (const c of counts) countsMap[c.video_id] = c.votes || 0;

  const kb = new InlineKeyboard();
  for (const v of videos) {
    kb.text(v.participant_nick || `#${v.id}`, `vote:${nominationId}:${v.id}`);
  }

  let text = 'Ваш голос учтён.';
  text += '\nТекущий счёт:\n' + videos.map((v: any) => `${v.participant_nick || `#${v.id}`}: ${countsMap[v.id] || 0}`).join('\n');

  try {
    await ctx.editMessageText(text, { reply_markup: kb });
  } catch (e) {
    await ctx.reply(text);
  }

  // Advance this user's position and send next nomination (if any)
  const nextPos = db.advanceUserPosition(userId);
  const nextNom = db.getNominationByPosition(nextPos);
  if (nextNom) {
    await sendNominationToUser(userId, nextNom);
  } else {
    try {
      await bot.api.sendMessage(userId, 'Новых номинаций пока нет.');
    } catch (e) {
      // ignore
    }
  }
});

// Admin: export results to CSV and send as document
bot.command('export_results', async (ctx) => {
  const fromId = ctx.from?.id;
  if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
  const csv = db.exportResultsCSV();
  const fn = `/data/results_${Date.now()}.csv`;
  try {
    fs.writeFileSync(fn, csv, 'utf8');
    // Type cast to any because grammy InputFile types differ across versions
    await ctx.replyWithDocument({ source: fs.createReadStream(fn) } as any);
  } catch (e) {
    await ctx.reply('Ошибка при создании файла результатов.');
  }
});

// Admin: toggle repeat-vote allowance
bot.command('set_repeat_vote', async (ctx) => {
  const fromId = ctx.from?.id;
  if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
  const parts = ctx.message?.text?.split(/\s+/) || [];
  if (parts.length < 2) return ctx.reply('Использование: /set_repeat_vote on|off');
  const arg = parts[1].toLowerCase();
  if (arg !== 'on' && arg !== 'off') return ctx.reply('Значение должно быть on или off');
  db.setSetting('repeat_votes_allowed', arg === 'on' ? '1' : '0');
  return ctx.reply(`Повторное голосование теперь ${arg === 'on' ? 'разрешено' : 'запрещено'}`);
});

// Admin: close nomination by id
bot.command('close_nomination', async (ctx) => {
  const fromId = ctx.from?.id;
  if (!isAdmin(fromId)) return ctx.reply('Нет прав.');
  const parts = ctx.message?.text?.split(/\s+/) || [];
  if (parts.length < 2) return ctx.reply('Использование: /close_nomination <nomination_id>');
  const id = Number(parts[1]);
  if (!id) return ctx.reply('Неверный id');
  db.closeNomination(id);
  return ctx.reply(`Номинация ${id} закрыта администратором.`);
});

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
  (async () => {
    try {
      if (ADMIN_IDS && ADMIN_IDS.length > 0) {
        // register commands only for each admin's private chat so ordinary users don't see slash-commands
        for (const aid of ADMIN_IDS) {
          const idNum = Number(aid);
          if (!isNaN(idNum)) {
            try {
              await bot.api.setMyCommands(botCommands, { scope: { type: 'chat', chat_id: idNum } as any });
            } catch (e) {
              console.warn('Не удалось зарегистрировать команды для admin', aid, e);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Ошибка при регистрации команд бота:', e);
    }
    bot.start();
    console.log('Bot started');
  })();
}

