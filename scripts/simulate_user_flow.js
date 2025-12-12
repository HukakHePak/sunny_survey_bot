const Database = require('better-sqlite3');
const db = new Database('/data/bot.db');

function selectAllNominations() {
  return db.prepare('SELECT id, title, position, closed FROM nominations ORDER BY position').all();
}

function selectVideosByNomination(nominationId) {
  return db.prepare('SELECT * FROM videos WHERE nomination_id = ? ORDER BY id').all(nominationId);
}

function simulate(userId = 12345) {
  const noms = selectAllNominations();
  console.log('--- Welcome message ---');
  if (!noms || noms.length === 0) { console.log('No nominations'); return; }
  console.log('Available nominations:');
  for (const n of noms) console.log(`${n.position}. ${n.title}${n.closed ? ' (closed)' : ''}`);
  console.log('\n[Button] Начать');

  console.log('\n--- Starting flow for user', userId, '---');
  let pos = 1;
  for (const n of noms) {
    if (n.closed) continue;
    console.log(`\n[Message] Номинация: ${n.title}`);
    const vids = selectVideosByNomination(n.id).slice(0,4);
    for (const v of vids) console.log(`  - video: ${v.file_id} (nick: ${v.participant_nick})`);
    console.log('  [Buttons] ' + vids.map(v => v.participant_nick || `#${v.id}`).join(' | '));
    pos += 1;
  }

  console.log('\n[Message] Вы проголосовали по всем номинациям. [Button] Завершить');
}

simulate();
