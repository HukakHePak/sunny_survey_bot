import { DbAPI } from '../types';

export function getUserPosition(db: DbAPI, userId: number) {
  return db.getUserPosition ? db.getUserPosition(userId) : 1;
}

export function setUserPosition(db: DbAPI, userId: number, position: number) {
  return db.setUserPosition ? db.setUserPosition(userId, position) : undefined;
}

export function advanceUserPosition(db: DbAPI, userId: number) {
  const cur = (db.getUserPosition ? db.getUserPosition(userId) : undefined) || 1;
  const next = cur + 1;
  if (db.setUserPosition) db.setUserPosition(userId, next);
  return next;
}
