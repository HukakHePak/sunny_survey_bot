import { initDb } from '../src/db';
import { sendNominationToUser } from '../src/handlers';

describe('sendNominationToUser integration', () => {
  const dbPath = './data/test_integration.db';
  let dbapi: any;
  beforeAll(() => {
    dbapi = initDb(dbPath);
    // create nomination and videos
    const n = dbapi.insertNomination('Тестовая', 1);
    dbapi.insertVideo(n.id, 'file1', 'Alice');
    dbapi.insertVideo(n.id, 'file2', 'Bob');
  });

  afterAll(() => {
    try { if (dbapi && dbapi.db) dbapi.db.close(); } catch (e) {}
    try { require('fs').unlinkSync(dbPath); } catch (e) {}
  });

  test('sends videos and message', async () => {
    const sent: any[] = [];
    const botMock: any = {
      api: {
        sendVideo: jest.fn().mockImplementation(async (userId: number, fileId: string, opts: any) => {
          const m = { message_id: sent.length + 1, fileId, opts };
          sent.push(['video', m]);
          return m;
        }),
        sendMessage: jest.fn().mockImplementation(async (userId: number, text: string, opts?: any) => {
          const m = { message_id: sent.length + 1, text, opts };
          sent.push(['msg', m]);
          return m;
        }),
      },
    };

    const noms = dbapi.selectAllNominations();
    expect(noms.length).toBeGreaterThan(0);
    const userId = 99999;
    await sendNominationToUser(botMock, dbapi, userId, noms[0], (uid: number, m: any) => {});

    // should have sent 2 videos and 1 message with inline keyboard
    expect(botMock.api.sendVideo).toHaveBeenCalled();
    expect(botMock.api.sendMessage).toHaveBeenCalled();
  });
});
