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
    // Optionally delete local video files left orphaned after clearing votes
    if (process.env.DELETE_VIDEO_FILES_ON_VOTE_CLEAR === '1' || process.env.DELETE_VIDEO_FILES_ON_VOTE_CLEAR === 'true') {
      try {
        const vids = db.prepare('SELECT id, local_path FROM videos WHERE local_path IS NOT NULL').all();
        console.log('Found local video files to consider for deletion:', vids.length);
        const removed = [];
        for (const v of vids) {
          try {
            if (v.local_path && require('fs').existsSync(v.local_path)) {
              require('fs').unlinkSync(v.local_path);
              removed.push(v.local_path);
            }
          } catch (e) { console.warn('Failed to remove file', v.local_path, e.message); }
        }
        if (removed.length > 0) console.log('Removed local files:', removed.length);
        // Nullify local_path pointers in DB
        try { db.prepare('UPDATE videos SET local_path = NULL WHERE local_path IS NOT NULL').run(); } catch (e) { console.warn('Failed to clear local_path in DB:', e.message); }
      } catch (e) { console.warn('Error while removing local video files:', e.message); }
    }
} catch (e) {
  console.error('Failed to clear votes:', e);
  process.exit(1);
} finally {
  db.close();
}
