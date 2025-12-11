import Database from 'better-sqlite3';
import path from 'path';

export function initDb(dbPath: string) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.prepare(
    `CREATE TABLE IF NOT EXISTS nominations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      position INTEGER NOT NULL
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

  db.prepare(
    `CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      nomination_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  return db;
}
