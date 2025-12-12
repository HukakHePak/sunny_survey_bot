import { pushMsg } from '../src/utils';

describe('utils.pushMsg', () => {
  test('stores message_id into provided store', () => {
    const store: Record<number, number[]> = {};
    const msg = { message_id: 42 };
    pushMsg(store, 123, msg);
    expect(store[123]).toEqual([42]);
  });

  test('ignores messages without id', () => {
    const store: Record<number, number[]> = {};
    pushMsg(store, 1, undefined);
    expect(store[1]).toBeUndefined();
  });
});
