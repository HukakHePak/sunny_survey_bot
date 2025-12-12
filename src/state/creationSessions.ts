type Session =
  | { state: 'awaiting_title' }
  | { state: 'collecting_videos'; nominationId: number };

const sessions: Map<number, Session> = new Map();

export function startAwaitingTitle(userId: number) {
  sessions.set(userId, { state: 'awaiting_title' });
}

export function startCollecting(userId: number, nominationId: number) {
  sessions.set(userId, { state: 'collecting_videos', nominationId });
}

export function endSession(userId: number) {
  sessions.delete(userId);
}

export function getSession(userId: number) {
  return sessions.get(userId);
}

export default { startAwaitingTitle, startCollecting, endSession, getSession };
