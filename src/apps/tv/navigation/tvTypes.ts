import type { PlaybackRouteParams } from "@/services/player/usePlaybackEngine";
import type { WorldId } from "@/services/provider/categories";

export type TvSectionId =
  | "search"
  | "home"
  | "discover"
  | "kdrama"
  | "cdrama"
  | "anime"
  | "movies"
  | "series"
  | "hollywood"
  | "continue"
  | "mylist"
  | "downloads"
  | "settings";

export const TV_SECTION_TO_WORLD: Partial<Record<TvSectionId, WorldId>> = {
  discover: "discover",
  kdrama: "kdrama",
  cdrama: "cdrama",
  anime: "anime",
  movies: "movies",
  series: "series",
  hollywood: "hollywood",
};

export type TvStackParamList = {
  TvShell: undefined;
  TvDetails: {
    subjectId: string;
    detailPath: string;
    title: string;
    posterUrl: string | null;
  };
  TvPlayer: PlaybackRouteParams;
};
