import { recordVote, getVoteCounts } from '../src/services/votingService';

describe('votingService', () => {
  test('recordVote returns invalid when params missing', () => {
    const res = recordVote(null as any, 0 as any, 0 as any, 0 as any);
    expect(res.success).toBe(false);
  });

  test('recordVote delegates to db', () => {
    const mockDb: any = { recordVote: jest.fn().mockReturnValue({ success: true }) };
    const res = recordVote(mockDb, 1, 2, 3);
    expect(mockDb.recordVote).toHaveBeenCalledWith(1, 2, 3);
    expect(res).toEqual({ success: true });
  });

  test('getVoteCounts returns empty for invalid', () => {
    const mockDb: any = { getVoteCountsForNomination: jest.fn() };
    expect(getVoteCounts(mockDb, 0)).toEqual([]);
  });

  test('getVoteCounts delegates to db', () => {
    const mockDb: any = { getVoteCountsForNomination: jest.fn().mockReturnValue([{ video_id: 1, votes: 2 }]) };
    expect(getVoteCounts(mockDb, 5)).toEqual([{ video_id: 1, votes: 2 }]);
  });
});
