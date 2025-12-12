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
    const hasClosed = cols.some((c: any) => c && c.name === 'closed');
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

  function createNomination(title: string) {
    const pos = getMaxPosition() + 1;
    const info = db.prepare('INSERT INTO nominations (title, position) VALUES (?, ?)').run(title, pos);
    return { id: info.lastInsertRowid as number, title, position: pos };
  }

  function addVideo(nominationId: number, fileId: string, participantNick?: string, title?: string) {
    const info = db
      .prepare('INSERT INTO videos (nomination_id, title, file_id, participant_nick) VALUES (?, ?, ?, ?)')
      .run(nominationId, title || null, fileId, participantNick || null);
    return { id: info.lastInsertRowid as number };
  }

  function getNominationByPosition(position: number) {
    return db.prepare('SELECT * FROM nominations WHERE position = ?').get(position);
  }

  function getNominationById(id: number) {
    return db.prepare('SELECT * FROM nominations WHERE id = ?').get(id);
  }

  function getVideosByNomination(nominationId: number) {
    return db.prepare('SELECT * FROM videos WHERE nomination_id = ? ORDER BY id').all(nominationId);
  }

  function getSetting(key: string) {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? r.value : null;
  }

  function setSetting(key: string, value: string) {
    db.prepare('INSERT INTO settings(key,value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
  }

  function isNominationClosed(id: number) {
    const r = db.prepare('SELECT closed FROM nominations WHERE id = ?').get(id);
    return r ? Boolean(r.closed) : false;
  }

  function closeNomination(id: number) {
    return db.prepare('UPDATE nominations SET closed = 1 WHERE id = ?').run(id);
  }

  function getUserPosition(userId: number) {
    const r = db.prepare('SELECT position FROM user_progress WHERE user_id = ?').get(userId);
    return r ? r.position : 1;
  }

  function setUserPosition(userId: number, position: number) {
    db.prepare('INSERT INTO user_progress(user_id, position) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET position=excluded.position').run(userId, position);
  }

  function advanceUserPosition(userId: number) {
    const cur = getUserPosition(userId) || 1;
    const next = cur + 1;
    setUserPosition(userId, next);
    return next;
  }

  function recordVote(userId: number, nominationId: number, videoId: number) {
    if (isNominationClosed(nominationId)) {
      return { success: false, reason: 'Голосование по этой номинации закрыто администратором.' };
    }

    const repeatAllowed = getSetting('repeat_votes_allowed');
    const repeat = repeatAllowed === null ? '1' : repeatAllowed; // default allow

    const existing = db.prepare('SELECT id FROM votes WHERE user_id = ? AND nomination_id = ?').get(userId, nominationId);
    if (existing && repeat !== '1') {
      return { success: false, reason: 'Повторное голосование запрещено администратором.' };
    }

    // remove previous vote for this user and nomination (if repeat allowed we'll replace)
    db.prepare('DELETE FROM votes WHERE user_id = ? AND nomination_id = ?').run(userId, nominationId);
    db.prepare('INSERT INTO votes (user_id, nomination_id, video_id) VALUES (?, ?, ?)').run(userId, nominationId, videoId);
    return { success: true };
  }

  function getVoteCountsForNomination(nominationId: number) {
    return db
      .prepare(
        `SELECT v.video_id, COUNT(*) as votes FROM votes v WHERE v.nomination_id = ? GROUP BY v.video_id ORDER BY votes DESC`
      )
      .all(nominationId);
  }

  function getAllResults() {
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

  function exportResultsCSV() {
    const rows = getAllResults();
    const header = ['nomination_id', 'nomination_title', 'video_id', 'participant_nick', 'file_id', 'votes'];
    const lines = [header.join(',')];
    for (const r of rows) {
      const safe = (v: any) => {
        if (v === null || v === undefined) return '';
        return String(v).replace(/"/g, '""');
      };
      lines.push(
        `"${safe(r.nomination_id)}","${safe(r.nomination_title)}","${safe(r.video_id)}","${safe(
          r.participant_nick
        )}","${safe(r.file_id)}","${safe(r.votes)}"`
      );
    }
    return lines.join('\n');
  }

  return {
    db,
    createNomination,
    addVideo,
    getNominationByPosition,
    getNominationById,
    getVideosByNomination,
    recordVote,
    getVoteCountsForNomination,
    getAllResults,
    exportResultsCSV,
    getSetting,
    setSetting,
    isNominationClosed,
    closeNomination,
    getUserPosition,
    setUserPosition,
    advanceUserPosition,
  };
}
