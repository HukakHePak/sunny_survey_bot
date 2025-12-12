export function recordVote(db: any, userId: number, nominationId: number, videoId: number) {
  if (!userId || !nominationId || !videoId) return { success: false, reason: 'invalid' };
  return db.recordVote(userId, nominationId, videoId);
}

export function getVoteCounts(db: any, nominationId: number) {
  if (!nominationId) return [];
  return db.getVoteCountsForNomination(nominationId) || [];
}
