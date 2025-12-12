const Database = require('better-sqlite3');
const db = new Database('/data/bot.db');

db.pragma('journal_mode = WAL');

db.prepare(
  `CREATE TABLE IF NOT EXISTS nominations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    closed INTEGER DEFAULT 0
  )`
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nomination_id INTEGER NOT NULL,
    title TEXT,
    file_id TEXT NOT NULL,
    participant_nick TEXT,
    FOREIGN KEY(nomination_id) REFERENCES nominations(id)
  )`
).run();

// clear existing test data (careful)
db.prepare('DELETE FROM votes').run();
db.prepare('DELETE FROM videos').run();
db.prepare('DELETE FROM nominations').run();

const insertNom = db.prepare('INSERT INTO nominations (title, position, closed) VALUES (?, ?, ?)');
const insertVid = db.prepare('INSERT INTO videos (nomination_id, title, file_id, participant_nick) VALUES (?, ?, ?, ?)');

const nominations = [
  'Лучшее вступление',
  'Лучшее соло',
  'Лучший дуэт'
];

let pos = 1;
for (const title of nominations) {
  const info = insertNom.run(title, pos++, 0);
  const nid = info.lastInsertRowid;
  for (let i = 1; i <= 4; i++) {
    insertVid.run(nid, `Короткое видео ${i}`, `file_${nid}_${i}`, `User${i}`);
  }
}

console.log('Seeded test nominations and videos.');
