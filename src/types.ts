export type Nomination = {
  id?: number;
  title: string;
  position: number;
};

export type Video = {
  id?: number;
  nomination_id: number;
  title?: string;
  file_id: string;
  participant_nick?: string;
};

export interface NominationRow { id: number; title: string; position: number; closed?: number }
export interface VideoRow { id: number; nomination_id: number; title?: string; file_id: string; participant_nick?: string }
export interface VoteRow { id: number; user_id: number; nomination_id: number; video_id: number }
export interface ResultRow { nomination_id: number; nomination_title: string; video_id: number; participant_nick?: string; file_id?: string; votes: number }

import Database from 'better-sqlite3';

export interface DbAPI {
  db?: Database;
  getMaxPosition?: () => number;
  insertNomination?: (title: string, position: number) => { id: number };
  insertVideo?: (nominationId: number, fileId: string, participantNick?: string, title?: string) => { id: number };
  selectNominationByPosition?: (pos: number) => NominationRow | null;
  selectNominationById?: (id: number) => NominationRow | null;
  selectVideosByNomination?: (nominationId: number) => VideoRow[];
  selectAllNominations?: () => NominationRow[];
  // Row shapes
  // these are lightweight descriptions of returned rows from DB primitives
  // Prefer narrowing in service code when needed.
  selectExistingVote?: (userId: number, nominationId: number) => { id: number; video_id: number } | null;
  deleteVotesByUserNomination?: (userId: number, nominationId: number) => { changes?: number } | void;
  insertVote?: (userId: number, nominationId: number, videoId: number) => { changes?: number; lastInsertRowid?: number } | void;
  selectVoteCountsForNomination?: (nominationId: number) => { video_id: number; votes: number }[];
  selectAllResults?: () => ResultRow[];
  deleteAllVotes?: () => void;
  getSetting?: (key: string) => string | null;
  upsertSetting?: (key: string, value: string) => void;
  selectIsNominationClosed?: (id: number) => boolean;
  updateCloseNomination?: (id: number) => { changes?: number } | void;
  deleteNomination?: (id: number) => void;
  selectUserVote?: (userId: number, nominationId: number) => { video_id: number } | null;
  getUserPosition?: (userId: number) => number;
  setUserPosition?: (userId: number, position: number) => void;
}
