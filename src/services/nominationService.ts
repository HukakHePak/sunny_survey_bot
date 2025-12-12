export function createNomination(db: any, title: string) {
  if (!title || title.trim() === '') throw new Error('title required');
  return db.createNomination(title.trim());
}

export function getNominationByPosition(db: any, pos: number) {
  if (!pos || pos < 1) return null;
  return db.getNominationByPosition(pos);
}

export function addVideoToNomination(db: any, nominationId: number, fileId: string, nick: string) {
  if (!nominationId || !fileId) throw new Error('invalid params');
  return db.addVideo(nominationId, fileId, nick || '');
}

export function exportResults(db: any) {
  return db.exportResultsCSV();
}
