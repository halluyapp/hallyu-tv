import type { PlaybackRouteParams } from "@/services/player/usePlaybackEngine";
import type { WorldId } from "@/services/provider/categories";

export type MobileTabParamList = {
  Home: undefined;
  Explore: { initialWorld?: WorldId; autoFocusSearch?: boolean } | undefined;
  Downloads: undefined;
  MySpace: undefined;
};

export type MobileStackParamList = {
  Onboarding: undefined;
  MobileTabs: undefined;
  MobileDetails: {
    subjectId: string;
    detailPath: string;
    title: string;
    posterUrl: string | null;
  };
  MobilePlayer: PlaybackRouteParams;
};
