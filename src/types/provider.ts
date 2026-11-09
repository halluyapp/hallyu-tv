/**
 * Zarhosting public API contract. Runtime validation is mandatory: provider
 * JSON is never trusted because of TypeScript types.
 */

export interface CatalogueItem {
  /** Raw provider title, exactly as published (may contain `[Hindi]` tags). */
  name: string;
  /** Title with metadata tags removed — this is what the UI shows. */
  displayName?: string;
  posterUrl: string | null;
  slug: string;
  subjectId: string;
  badge: string | null;
  rating: string | null;
  year: string | null;
  /** Comma-separated, canonicalised genres. */
  genre: string | null;
  mediaType: "movie" | "series";
  /** Production country, when the endpoint returns it (search does). */
  country?: string | null;
  /** Original language, when known. */
  language?: string | null;
  /** Audio track label, when known. */
  audio?: string | null;
  /** Provider dub flag (true = dubbed release). */
  dub?: boolean;
  dubs?: string[];
  subtitles?: string[];
  description?: string | null;
  duration?: number | null;
  releaseDate?: string | null;
  hasResource?: boolean;
  baseTitle?: string | null;
  /** Short-form television (provider type 7). */
  isShort?: boolean;
  /** `[Hindi]`, `[CAM]`… extracted from the raw title. */
  tags?: string[];
}

export interface HomeSection {
  section: string;
  items: CatalogueItem[];
}

export interface SeasonInfo {
  season: number;
  maxEp: number;
}

export interface StarInfo {
  name: string;
  character: string | null;
  avatarUrl: string | null;
}

export interface TitleDetail {
  subjectId: string;
  title: string;
  description: string | null;
  releaseDate: string | null;
  genre: string | null;
  country: string | null;
  rating: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  trailerUrl: string | null;
  detailPath: string;
  mediaType: "movie" | "series";
  seasons: SeasonInfo[];
  subtitlesAvailable: string[];
  cast: StarInfo[];
}

/**
 * A normalized, validated playback source. The shared normalization rules live
 * in services/provider/streams.ts — this type is a re-export so every consumer
 * (player, downloads, verification script, tests) shares one definition.
 */
export type { NormalizedSource as StreamSource } from "../services/provider/streams";
import type { NormalizedSource } from "../services/provider/streams";

export interface StreamResolution {
  subjectId: string;
  se: number;
  ep: number;
  sources: NormalizedSource[];
  hasResource: boolean;
  note: string | null;
}

export interface CaptionTrack {
  id: string;
  language: string;
  languageName: string;
  url: string;
}

/** Provider error taxonomy — user-facing classification without internals. */
export type ProviderErrorKind =
  | "unavailable"
  | "not_found"
  | "invalid_response"
  | "network"
  | "no_stream";

export class ProviderError extends Error {
  kind: ProviderErrorKind;
  constructor(kind: ProviderErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}


export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
