export function recordVote(db: any, userId: number, nominationId: number, videoId: number) {
  if (!userId || !nominationId || !videoId) return { success: false, reason: 'invalid' };

  if (db.selectIsNominationClosed && db.selectIsNominationClosed(nominationId)) {
    return { success: false, reason: 'Голосование по этой номинации закрыто администратором.' };
  }

  const repeatAllowed = db.getSetting ? db.getSetting('repeat_votes_allowed') : null;
  const repeat = repeatAllowed === null ? '1' : repeatAllowed;

  const existing = db.selectExistingVote ? db.selectExistingVote(userId, nominationId) : null;
  if (existing && repeat !== '1') {
    return { success: false, reason: 'Повторное голосование запрещено администратором.' };
  }

  if (db.deleteVotesByUserNomination) db.deleteVotesByUserNomination(userId, nominationId);
  if (db.insertVote) db.insertVote(userId, nominationId, videoId);
  return { success: true };
}

export function getVoteCounts(db: any, nominationId: number) {
  if (!nominationId) return [];
  return (db.selectVoteCountsForNomination && db.selectVoteCountsForNomination(nominationId)) || [];
}
