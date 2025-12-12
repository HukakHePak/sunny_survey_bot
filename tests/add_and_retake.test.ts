import { initDb } from '../src/db';
import sessions from '../src/state/creationSessions';

describe('admin add nomination flow and retake flows', () => {
  let dbapi: any;
  beforeEach(() => {
    const p = './data/test_add.db';
    try { require('fs').unlinkSync(p); } catch (e) {}
    dbapi = initDb(p);
  });
  afterEach(() => {
    try { if (dbapi && dbapi.db) dbapi.db.close(); } catch (e) {}
    try { require('fs').unlinkSync('./data/test_add.db'); } catch (e) {}
  });

  test('add nomination: title -> video1 -> video2 -> save', async () => {
    const { registerHandlers } = require('../src/handlers');
    const api = { sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }), sendVideo: jest.fn().mockResolvedValue({ message_id: 2 }) };
    class FakeBot {
      messageHandler: Function | null = null;
      handlers: Array<{ pattern: string | RegExp; fn: Function }> = [];
      api: any;
      constructor(apiImpl: any) { this.api = apiImpl; }
      on(event: string, fn: Function) { if (event === 'message') this.messageHandler = fn; }
      callbackQuery(pattern: string | RegExp, fn: Function) { this.handlers.push({ pattern, fn }); }
    }

    const fakeBot = new FakeBot(api);
    const isAdmin = () => true;
    registerHandlers(fakeBot as any, dbapi, isAdmin);

    const userId = 500;
    // start awaiting title
    sessions.startAwaitingTitle(userId);
    // send title
    const titleCtx: any = { from: { id: userId }, message: { text: 'Best Nom' }, reply: jest.fn().mockResolvedValue({}) };
    await (fakeBot.messageHandler as any)(titleCtx);

    // send first video (pending -> creates nomination and moves to collecting)
    const video1Ctx: any = { from: { id: userId }, message: { video: { file_id: 'f1' }, caption: 'Alice' }, reply: jest.fn().mockResolvedValue({}) };
    await (fakeBot.messageHandler as any)(video1Ctx);

    // send second video
    const video2Ctx: any = { from: { id: userId }, message: { video: { file_id: 'f2' }, caption: 'Bob' }, reply: jest.fn().mockResolvedValue({}) };
    await (fakeBot.messageHandler as any)(video2Ctx);

    // now save
    const saveCtx: any = { from: { id: userId }, message: { text: 'Сохранить' }, reply: jest.fn().mockResolvedValue({}) };
    await (fakeBot.messageHandler as any)(saveCtx);

    // verify nomination exists and has 2 videos
    const noms = dbapi.selectAllNominations();
    expect(noms.length).toBeGreaterThan(0);
    const n = noms[0];
    const vids = dbapi.selectVideosByNomination(n.id);
    expect(vids.length).toBeGreaterThanOrEqual(2);
  });

  test('retake_yes and retake_no flows', async () => {
    const { registerHandlers } = require('../src/handlers');
    const api = { sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }), deleteMessage: jest.fn().mockResolvedValue(undefined) };
    class FakeBot {
      messageHandler: Function | null = null;
      handlers: Array<{ pattern: string | RegExp; fn: Function }> = [];
      api: any;
      constructor(apiImpl: any) { this.api = apiImpl; }
      on(event: string, fn: Function) { if (event === 'message') this.messageHandler = fn; }
      callbackQuery(pattern: string | RegExp, fn: Function) { this.handlers.push({ pattern, fn }); }
    }
    const fakeBot = new FakeBot(api);
    const isAdmin = () => false;
    registerHandlers(fakeBot as any, dbapi, isAdmin);

    // create nomination and vote for user
    const n = dbapi.insertNomination('RT', 1);
    const v = dbapi.insertVideo(n.id, 'ff', 'X');
    dbapi.insertVote(123, n.id, v.id);

    // find finish handler and invoke
    const finishHandler = fakeBot.handlers.find(h => h.pattern === 'finish')?.fn;
    expect(finishHandler).toBeDefined();
    const finishCtx: any = { from: { id: 123 }, answerCallbackQuery: jest.fn().mockResolvedValue(undefined), deleteMessage: jest.fn().mockResolvedValue(undefined), reply: jest.fn().mockResolvedValue(undefined) };
    await (finishHandler as any)(finishCtx);

    // simulate retake_no
    const retakeNoHandler = fakeBot.handlers.find(h => h.pattern === 'retake_no')?.fn;
    expect(retakeNoHandler).toBeDefined();
    const noCtx: any = { answerCallbackQuery: jest.fn().mockResolvedValue(undefined), deleteMessage: jest.fn().mockResolvedValue(undefined), reply: jest.fn().mockResolvedValue(undefined) };
    await (retakeNoHandler as any)(noCtx);
    expect(noCtx.reply).toHaveBeenCalled();

    // simulate retake_yes
    const retakeYesHandler = fakeBot.handlers.find(h => h.pattern === 'retake_yes')?.fn;
    expect(retakeYesHandler).toBeDefined();
    const yesCtx: any = { from: { id: 123 }, answerCallbackQuery: jest.fn().mockResolvedValue(undefined), reply: jest.fn().mockResolvedValue(undefined) };
    await (retakeYesHandler as any)(yesCtx);

    const pos = dbapi.getUserPosition(123);
    expect(pos).toBe(1);
  });
});
