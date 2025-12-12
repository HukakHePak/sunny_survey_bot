import { createNomination, getNominationByPosition, addVideoToNomination, exportResults } from '../src/services/nominationService';

describe('nominationService', () => {
  test('createNomination calls db and returns value', () => {
    const mockDb: any = { getMaxPosition: jest.fn().mockReturnValue(0), insertNomination: jest.fn().mockReturnValue({ id: 1 }) };
    const res = createNomination(mockDb, 'T');
    expect(mockDb.insertNomination).toHaveBeenCalledWith('T', 1);
    expect(res).toEqual({ id: 1, position: 1, title: 'T' });
  });

  test('createNomination throws on empty title', () => {
    const mockDb: any = { createNomination: jest.fn() };
    expect(() => createNomination(mockDb, '')).toThrow('title required');
  });

  test('getNominationByPosition returns null for invalid pos', () => {
    const mockDb: any = { getNominationByPosition: jest.fn() };
    expect(getNominationByPosition(mockDb, 0)).toBeNull();
  });

  test('addVideoToNomination calls db', () => {
    const mockDb: any = { insertVideo: jest.fn().mockReturnValue({ id: 2 }) };
    const res = addVideoToNomination(mockDb, 1, 'file123', 'nick');
    expect(mockDb.insertVideo).toHaveBeenCalledWith(1, 'file123', 'nick');
    expect(res).toEqual({ id: 2 });
  });

  test('exportResults returns csv', () => {
    const rows = [{ nomination_id: 1, nomination_title: 'N', video_id: 2, participant_nick: 'x', file_id: 'f', votes: 3 }];
    const mockDb: any = { selectAllResults: jest.fn().mockReturnValue(rows) };
    const csv = exportResults(mockDb);
    expect(csv).toContain('nomination_id');
    expect(csv).toContain('N');
  });
});
