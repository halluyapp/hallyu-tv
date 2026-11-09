/**
 * Zarhosting public API contract. Runtime validation is mandatory: provider
 * JSON is never trusted because of TypeScript types.
 */

export interface CatalogueItem {
  name: string;
  posterUrl: string | null;
  slug: string;
  subjectId: string;
  badge: string | null;
  rating: string | null;
  year: string | null;
  genre: string | null;
  mediaType: "movie" | "series";
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

export interface AudioVersionOption {
  subjectId: string;
  detailPath: string;
  label: string;
  lanCode: string | null;
  isOriginal: boolean;
  isHindi: boolean;
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
  audioVersions?: AudioVersionOption[];
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

export function parseCatalogueItem(raw: unknown): CatalogueItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = isNonEmptyString(r.name) ? r.name : isNonEmptyString(r.title) ? r.title : null;
  const slug = isNonEmptyString(r.slug) ? r.slug : isNonEmptyString(r.detail_path) ? r.detail_path : isNonEmptyString(r.detailPath) ? r.detailPath : null;
  const subjectId = isNonEmptyString(r.subject_id) ? r.subject_id : isNonEmptyString(r.subjectId) ? r.subjectId : null;
  if (!name || !slug || !subjectId) return null;
  const cover = typeof r.cover === "object" && r.cover !== null ? (r.cover as Record<string, unknown>) : null;
  const posterUrl = isNonEmptyString(r.poster_url) ? r.poster_url : isNonEmptyString(r.posterUrl) ? r.posterUrl : isNonEmptyString(cover?.url) ? cover!.url : null;
  const type = r.type ?? r.subjectType;
  const mediaType = type === "series" || type === "tv" || type === 2 ? "series" : "movie";
  const year = r.year ?? (isNonEmptyString(r.releaseDate) ? r.releaseDate.slice(0, 4) : null);
  return {
    name,
    posterUrl,
    slug,
    subjectId,
    badge: isNonEmptyString(r.badge) ? r.badge : null,
    rating: isNonEmptyString(r.rating) ? r.rating : isNonEmptyString(r.imdbRatingValue) ? r.imdbRatingValue : null,
    year: typeof year === "string" ? year : typeof year === "number" ? String(year) : null,
    genre: isNonEmptyString(r.genre) ? r.genre : null,
    mediaType,
  };
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
