import { DbAPI } from './types';

export function getSettingDefault(db: DbAPI, key: string, def: string) {
  try {
    if (!db || !db.getSetting) return def;
    const v = db.getSetting(key);
    return v === null || v === undefined ? def : String(v);
  } catch (e) {
    return def;
  }
}

export function safeCall<T extends any[]>(fn?: ((...args: T) => any), ...args: T) {
  try {
    if (!fn) return undefined;
    return fn(...args);
  } catch (e) {
    return undefined;
  }
}

export interface MinimalMessage { message_id?: number; messageId?: number }

export function pushMsg(store: Record<number, number[]>, userId: number, msg: MinimalMessage | undefined) {
  try {
    if (!msg) return;
    const mid = msg.message_id || msg.messageId || null;
    if (!mid) return;
    store[userId] = store[userId] || [];
    store[userId].push(mid);
  } catch (e) {
    // ignore
  }
}

export default { getSettingDefault, safeCall };
