/**
 * Verified provider contract (verified live 2026-11-03 — see
 * docs/provider-integration/zarhosting-moviebox.md). Runtime validation is
 * mandatory: provider JSON is never trusted because of TypeScript types.
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

export interface StreamSource {
  resolution: string;
  format: string;
  url: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
  codec: string | null;
}

export interface StreamResolution {
  subjectId: string;
  se: number;
  ep: number;
  sources: StreamSource[];
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

/** Safe catalog item shape returned by /home and /search. */
export interface RawItem {
  name?: unknown;
  poster_url?: unknown;
  slug?: unknown;
  subject_id?: unknown;
  badge?: unknown;
  rating?: unknown;
  year?: unknown;
  genre?: unknown;
  type?: unknown;
}

export function parseCatalogueItem(raw: unknown): CatalogueItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as RawItem;
  if (typeof r.name !== "string" || typeof r.slug !== "string" || typeof r.subject_id !== "string") {
    return null;
  }
  const mediaType = r.type === "series" || r.type === "tv" ? "series" : "movie";
  return {
    name: r.name,
    posterUrl: typeof r.poster_url === "string" ? r.poster_url : null,
    slug: r.slug,
    subjectId: r.subject_id,
    badge: typeof r.badge === "string" && r.badge ? r.badge : null,
    rating: typeof r.rating === "string" && r.rating ? r.rating : null,
    year: typeof r.year === "string" ? r.year : typeof r.year === "number" ? String(r.year) : null,
    genre: typeof r.genre === "string" ? r.genre : null,
    mediaType,
  };
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
