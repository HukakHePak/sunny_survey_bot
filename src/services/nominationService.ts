import { DbAPI } from '../types';

export function createNomination(db: DbAPI, title: string) {
  if (!title || title.trim() === '') throw new Error('title required');
  const pos = (db.getMaxPosition && db.getMaxPosition()) || 0;
  const position = pos + 1;
  if (!db.insertNomination) throw new Error('DB insertNomination not available');
  const info = db.insertNomination(title.trim(), position);
  return { id: info.id, title: title.trim(), position };
}

export function getNominationByPosition(db: DbAPI, pos: number) {
  if (!pos || pos < 1) return null;
  return db.selectNominationByPosition ? db.selectNominationByPosition(pos) : null;
}

export function addVideoToNomination(db: DbAPI, nominationId: number, fileId: string, nick: string) {
  if (!nominationId || !fileId) throw new Error('invalid params');
  return db.insertVideo ? db.insertVideo(nominationId, fileId, nick || '') : { id: 0 };
}

export function exportResults(db: DbAPI) {
  const rows = db.selectAllResults ? db.selectAllResults() : [];
  const header = ['nomination_id', 'nomination_title', 'video_id', 'participant_nick', 'file_id', 'votes'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const safe = (v: unknown) => {
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

export function summaryResults(db: DbAPI) {
  const noms = db.selectAllNominations ? db.selectAllNominations() : [];
  if (!noms || noms.length === 0) return 'Результатов нет — номинаций нет.';
  const parts: string[] = [];
  for (const n of noms) {
    parts.push(`${n.position}. ${n.title}`);
    const vids = db.selectVideosByNomination ? db.selectVideosByNomination(n.id) : [];
    const counts = db.selectVoteCountsForNomination ? db.selectVoteCountsForNomination(n.id) : [];
    if (!vids || vids.length === 0) {
      parts.push('  Нет участников.');
    } else {
      for (const v of vids) {
          const cnt = (counts.find((c) => Number(c.video_id) === Number(v.id)) || { votes: 0 }).votes || 0;
          parts.push(`  - ${v.participant_nick || `#${v.id}`}: ${cnt} голосов`);
        }
    }
    parts.push('');
  }
  return parts.join('\n');
}

export function deleteNomination(db: DbAPI, id: number) {
  if (!id) throw new Error('invalid id');
  if (!db.deleteNomination) throw new Error('DB delete not available');
  db.deleteNomination(id);
}

export function listNominations(db: DbAPI) {
  return db.selectAllNominations ? db.selectAllNominations() : [];
}
