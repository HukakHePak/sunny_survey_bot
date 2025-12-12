import { DbAPI } from '../types';
import { getSettingDefault } from '../utils';

export function recordVote(db: DbAPI, userId: number, nominationId: number, videoId: number) {
  if (!userId || !nominationId || !videoId) return { success: false, reason: 'invalid' };

  if (db.selectIsNominationClosed && db.selectIsNominationClosed(nominationId)) {
    return { success: false, reason: 'Голосование по этой номинации закрыто администратором.' };
  }

    const repeat = getSettingDefault(db, 'repeat_votes_allowed', '1');

  const existing = db.selectExistingVote ? db.selectExistingVote(userId, nominationId) : null;
  if (existing && repeat !== '1') {
    return { success: false, reason: 'вы уже проголосовали, изменить выбор нельзя' };
  }

  if (db.deleteVotesByUserNomination) db.deleteVotesByUserNomination(userId, nominationId);
  if (db.insertVote) db.insertVote(userId, nominationId, videoId);
  return { success: true };
}

export function getVoteCounts(db: DbAPI, nominationId: number) {
  if (!nominationId) return [];
  return (db.selectVoteCountsForNomination && db.selectVoteCountsForNomination(nominationId)) || [];
}
