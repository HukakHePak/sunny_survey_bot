import { createNomination, getNominationByPosition, addVideoToNomination, exportResults } from '../src/services/nominationService';

describe('nominationService', () => {
  test('createNomination calls db and returns value', () => {
    const mockDb: any = { createNomination: jest.fn().mockReturnValue({ id: 1, position: 1, title: 'T' }) };
    const res = createNomination(mockDb, 'T');
    expect(mockDb.createNomination).toHaveBeenCalledWith('T');
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
    const mockDb: any = { addVideo: jest.fn().mockReturnValue({ id: 2 }) };
    const res = addVideoToNomination(mockDb, 1, 'file123', 'nick');
    expect(mockDb.addVideo).toHaveBeenCalledWith(1, 'file123', 'nick');
    expect(res).toEqual({ id: 2 });
  });

  test('exportResults returns csv', () => {
    const mockDb: any = { exportResultsCSV: jest.fn().mockReturnValue('a,b,c') };
    expect(exportResults(mockDb)).toBe('a,b,c');
  });
});
