export function getUserPosition(db: any, userId: number) {
  return db.getUserPosition(userId);
}

export function setUserPosition(db: any, userId: number, position: number) {
  return db.setUserPosition(userId, position);
}

export function advanceUserPosition(db: any, userId: number) {
  const cur = db.getUserPosition(userId) || 1;
  const next = cur + 1;
  db.setUserPosition(userId, next);
  return next;
}
