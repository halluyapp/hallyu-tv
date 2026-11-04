export interface LibraryTitle {
  subject_id: string;
  detail_path: string | null;
  media_type: "movie" | "series";
  title: string;
  poster_url: string | null;
}

export interface ProgressRow extends LibraryTitle {
  season_number: number | null;
  episode_number: number | null;
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
  updated_at: string;
}

/** Playback at or beyond this share of duration counts as completed. */
export const COMPLETION_THRESHOLD = 0.95;
