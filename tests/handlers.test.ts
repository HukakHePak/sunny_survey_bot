import { initDb } from '../src/db';
import { registerHandlers } from '../src/handlers';

class FakeBot {
  handlers: Array<{ pattern: string | RegExp; fn: Function }> = [];
  api: any;
  constructor(apiImpl: any) {
    this.api = apiImpl;
  }
  callbackQuery(pattern: string | RegExp, fn: Function) {
    this.handlers.push({ pattern, fn });
  }
  on(_event: string, _fn: Function) {
    // not used in these tests
  }
}

function findHandler(bot: FakeBot, data: string) {
  for (const h of bot.handlers) {
    if (typeof h.pattern === 'string' && h.pattern === data) return h.fn;
    if (h.pattern instanceof RegExp && h.pattern.test(data)) return h.fn;
  }
  return null;
}

describe('handlers callbacks (unit)', () => {
  let dbapi: any;
  beforeEach(() => {
    const p = './data/test_handlers.db';
    try { require('fs').unlinkSync(p); } catch (e) {}
    dbapi = initDb(p);
  });
  afterEach(() => {
    try { if (dbapi && dbapi.db) dbapi.db.close(); } catch (e) {}
    try { require('fs').unlinkSync('./data/test_handlers.db'); } catch (e) {}
  });

  test('vote callback records vote and advances', async () => {
    const n1 = dbapi.insertNomination('N1', 1);
    const n2 = dbapi.insertNomination('N2', 2);
    const v1 = dbapi.insertVideo(n1.id, 'f1', 'A');
    const v2 = dbapi.insertVideo(n2.id, 'f2', 'B');

    const sent: any[] = [];
    const api = {
      sendVideo: jest.fn().mockImplementation(async () => ({})),
      sendMessage: jest.fn().mockImplementation(async (_uid: number, text: string, opts?: any) => { sent.push(text); return { message_id: sent.length }; }),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
    };

    const bot = new FakeBot(api as any);
    const isAdmin = () => false;
    registerHandlers(bot as any, dbapi, isAdmin);

    const handler = findHandler(bot, `vote:${n1.id}:${v1.id}`);
    expect(handler).toBeTruthy();
    if (!handler) throw new Error('vote handler not found');
    // create a minimal ctx expected by handler
    const ctx: any = {
      callbackQuery: { data: `vote:${n1.id}:${v1.id}` },
      from: { id: 12345 },
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockRejectedValue(new Error('no edit')), // force fallback
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await handler(ctx);

    // after voting, user position should advance to nomination 2
    const pos = dbapi.getUserPosition(12345);
    expect(pos).toBeGreaterThanOrEqual(2);
  });

  test('finish callback offers retake when repeat allowed', async () => {
    const n1 = dbapi.insertNomination('Only', 1);
    const api = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
    };
    const bot = new FakeBot(api as any);
    const isAdmin = () => false;
    registerHandlers(bot as any, dbapi, isAdmin);

    const handler = findHandler(bot, 'finish');
    expect(handler).toBeTruthy();
    if (!handler) throw new Error('finish handler not found');
    
    const ctx: any = {
      callbackQuery: { data: 'finish' },
      from: { id: 777 },
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };

    await handler(ctx);

    // Ensure user position reset to 1 after finish
    const pos = dbapi.getUserPosition(777);
    expect(pos).toBe(1);
  });
});
