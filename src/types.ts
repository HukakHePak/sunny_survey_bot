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
