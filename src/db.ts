import Database from 'better-sqlite3';

export function initDb(dbPath: string) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.prepare(
    `CREATE TABLE IF NOT EXISTS nominations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,
      closed INTEGER DEFAULT 0
    )`
  ).run();

  // Migration: ensure `closed` column exists for older databases
  try {
    const cols = db.prepare("PRAGMA table_info(nominations)").all();
    const hasClosed = (cols as Array<{ name?: string }>).some((c) => c && c.name === 'closed');
    if (!hasClosed) {
      db.prepare('ALTER TABLE nominations ADD COLUMN closed INTEGER DEFAULT 0').run();
    }
  } catch (e) {
    // ignore migration errors (table may not exist yet)
  }

  db.prepare(
    `CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nomination_id INTEGER NOT NULL,
      title TEXT,
      file_id TEXT NOT NULL,
      local_path TEXT,
      participant_nick TEXT,
      FOREIGN KEY(nomination_id) REFERENCES nominations(id)
    )`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      nomination_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS user_progress (
      user_id INTEGER PRIMARY KEY,
      position INTEGER NOT NULL
    )`
  ).run();


  const getMaxPosition = () => db.prepare('SELECT MAX(position) as m FROM nominations').get()?.m || 0;

  // Low-level DB primitives (no business logic)
  function insertNomination(title: string, position: number) {
    const info = db.prepare('INSERT INTO nominations (title, position) VALUES (?, ?)').run(title, position);
    return { id: info.lastInsertRowid as number };
  }

  function insertVideo(nominationId: number, fileId: string, participantNick?: string, title?: string) {
    const info = db
      .prepare('INSERT INTO videos (nomination_id, title, file_id, local_path, participant_nick) VALUES (?, ?, ?, ?, ?)')
      .run(nominationId, title || null, fileId, null, participantNick || null);
    return { id: info.lastInsertRowid as number };
  }

  // new insert that accepts local_path when available
  function insertVideoWithLocal(nominationId: number, fileId: string, participantNick?: string, title?: string, localPath?: string) {
    const info = db
      .prepare('INSERT INTO videos (nomination_id, title, file_id, local_path, participant_nick) VALUES (?, ?, ?, ?, ?)')
      .run(nominationId, title || null, fileId, localPath || null, participantNick || null);
    return { id: info.lastInsertRowid as number };
  }

  function selectNominationByPosition(position: number) {
    return db.prepare('SELECT * FROM nominations WHERE position = ?').get(position);
  }

  function selectNominationById(id: number) {
    return db.prepare('SELECT * FROM nominations WHERE id = ?').get(id);
  }

  function selectVideosByNomination(nominationId: number) {
    return db.prepare('SELECT * FROM videos WHERE nomination_id = ? ORDER BY id').all(nominationId);
  }

  function selectAllNominations() {
    return db.prepare('SELECT id, title, position, closed FROM nominations ORDER BY position').all();
  }

  function getSetting(key: string) {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? r.value : null;
  }

  function upsertSetting(key: string, value: string) {
    db.prepare('INSERT INTO settings(key,value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
  }

  function selectIsNominationClosed(id: number) {
    try {
      const r = db.prepare('SELECT closed FROM nominations WHERE id = ?').get(id);
      return r ? Boolean(r.closed) : false;
    } catch (e) {
      try {
        db.prepare('ALTER TABLE nominations ADD COLUMN closed INTEGER DEFAULT 0').run();
      } catch (ignored) {}
      return false;
    }
  }

  function updateCloseNomination(id: number) {
    return db.prepare('UPDATE nominations SET closed = 1 WHERE id = ?').run(id);
  }

  function deleteNomination(id: number) {
    // remove votes for nomination
    db.prepare('DELETE FROM votes WHERE nomination_id = ?').run(id);
    // remove videos for nomination
    db.prepare('DELETE FROM videos WHERE nomination_id = ?').run(id);
    // remove nomination
    db.prepare('DELETE FROM nominations WHERE id = ?').run(id);
    // shift positions down for nominations after deleted one
    db.prepare('UPDATE nominations SET position = position - 1 WHERE position > (SELECT position FROM nominations WHERE id = ?)')
      .run(id);
  }

  function getUserPosition(userId: number) {
    const r = db.prepare('SELECT position FROM user_progress WHERE user_id = ?').get(userId);
    return r ? r.position : 1;
  }

  function setUserPosition(userId: number, position: number) {
    db.prepare('INSERT INTO user_progress(user_id, position) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET position=excluded.position').run(userId, position);
  }

  // Vote primitives
  function selectExistingVote(userId: number, nominationId: number) {
    return db.prepare('SELECT id, video_id FROM votes WHERE user_id = ? AND nomination_id = ?').get(userId, nominationId);
  }

  function selectUserVote(userId: number, nominationId: number) {
    return db.prepare('SELECT video_id FROM votes WHERE user_id = ? AND nomination_id = ?').get(userId, nominationId);
  }

  function deleteVotesByUserNomination(userId: number, nominationId: number) {
    return db.prepare('DELETE FROM votes WHERE user_id = ? AND nomination_id = ?').run(userId, nominationId);
  }

  function insertVote(userId: number, nominationId: number, videoId: number) {
    return db.prepare('INSERT INTO votes (user_id, nomination_id, video_id) VALUES (?, ?, ?)').run(userId, nominationId, videoId);
  }

  function selectVoteCountsForNomination(nominationId: number) {
    return db
      .prepare(
        `SELECT v.video_id, COUNT(*) as votes FROM votes v WHERE v.nomination_id = ? GROUP BY v.video_id ORDER BY votes DESC`
      )
      .all(nominationId);
  }

  function selectAllResults() {
    return db
      .prepare(
        `SELECT n.id as nomination_id, n.title as nomination_title, v.id as video_id, v.participant_nick, v.file_id, COUNT(vt.id) as votes
         FROM nominations n
         JOIN videos v ON v.nomination_id = n.id
         LEFT JOIN votes vt ON vt.video_id = v.id
         GROUP BY v.id
         ORDER BY n.position, v.id`
      )
      .all();
  }

  return {
    db,
    // primitives
    getMaxPosition,
    insertNomination,
    insertVideo: insertVideoWithLocal,
    selectNominationByPosition,
    selectNominationById,
    selectVideosByNomination,
    selectExistingVote,
    deleteVotesByUserNomination,
    insertVote,
    selectVoteCountsForNomination,
    selectAllResults,
    getSetting,
    upsertSetting,
    selectIsNominationClosed,
    updateCloseNomination,
    deleteNomination,
    selectUserVote,
    getUserPosition,
    setUserPosition,
    selectAllNominations,
  };
}
