const Database = require('better-sqlite3');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
let dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'bot.db');
// If DB path from env is not accessible on host (e.g. '/data/bot.db' inside container),
// fall back to workspace ./data/bot.db when present.
const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  const alt = path.join(__dirname, '..', 'data', 'bot.db');
  if (fs.existsSync(alt)) dbPath = alt;
}

console.log('Using DB:', dbPath);
const db = new Database(dbPath);

try {
  const before = db.prepare('SELECT COUNT(*) as c FROM votes').get();
  console.log('Votes before:', before.c);
  const res = db.prepare('DELETE FROM votes').run();
  console.log('Deleted rows:', res.changes);
  try { db.prepare('VACUUM').run(); console.log('VACUUM executed'); } catch (e) { console.warn('VACUUM failed or not necessary:', e.message); }
  const after = db.prepare('SELECT COUNT(*) as c FROM votes').get();
  console.log('Votes after:', after.c);
} catch (e) {
  console.error('Failed to clear votes:', e);
  process.exit(1);
} finally {
  db.close();
}
