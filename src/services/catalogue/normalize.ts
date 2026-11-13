import type { CatalogueItem, HomeSection } from "@/types/provider";
import { canonicalGenre, providerWorldFor, titleFromSectionLabel } from "./worlds";

/**
 * Provider → catalogue normalization.
 *
 * The Zarhosting feed is not uniform: `/home` items are lean (name, slug,
 * subject_id, badge, rating, year, genre, type), `/search` items carry country,
 * language, audio, dub flags and subtitles. Field names also drift per endpoint.
 * Everything is validated here so screens only ever see trustworthy items.
 */

export interface NormalizeReport {
  received: number;
  normalized: number;
  rejected: number;
  reasons: Record<string, number>;
  withGenre: number;
  withCountry: number;
  withRating: number;
  withYear: number;
  dubbed: number;
}

export function emptyReport(): NormalizeReport {
  return {
    received: 0,
    normalized: 0,
    rejected: 0,
    reasons: {},
    withGenre: 0,
    withCountry: 0,
    withRating: 0,
    withYear: 0,
    dubbed: 0,
  };
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function str(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

const BRACKET_RE = /\[([^\]]+)\]/g;

/** `[Hindi]`, `[CAM]`, `[HD]` in a provider title are metadata, not the title. */
export function tagsOf(name: string): string[] {
  const tags: string[] = [];
  for (const match of name.matchAll(BRACKET_RE)) {
    const tag = match[1]?.trim();
    if (tag) tags.push(tag);
  }
  return tags;
}

export function cleanTitle(name: string): string {
  const stripped = name.replace(BRACKET_RE, " ").replace(/\s+/g, " ").trim();
  return stripped.length > 0 ? stripped : name.trim();
}

/** Series detection covers the provider's numeric and string type variants. */
export function mediaTypeOf(raw: unknown, hasSeasons: boolean): "movie" | "series" {
  const value = raw;
  if (value === 2 || value === 7 || value === "2" || value === "7") return "series";
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (["series", "tv", "tvshow", "tv_show", "tv-series", "short", "shorts"].includes(lower)) return "series";
  }
  return hasSeasons ? "series" : "movie";
}

function genreOf(raw: unknown): string | null {
  if (Array.isArray(raw)) {
    const names = raw
      .map((g) => (typeof g === "string" ? g : asRecord(g)?.name))
      .map((g) => (typeof g === "string" ? canonicalGenre(g) : null))
      .filter((g): g is string => Boolean(g));
    return names.length > 0 ? Array.from(new Set(names)).join(",") : null;
  }
  const value = str(raw);
  if (!value) return null;
  const names = value
    .split(",")
    .map((g) => canonicalGenre(g))
    .filter((g): g is string => Boolean(g));
  return names.length > 0 ? Array.from(new Set(names)).join(",") : null;
}

function subtitlesOf(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tracks = raw.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  return tracks.length > 0 ? tracks : undefined;
}

/**
 * Normalize one provider item. Returns `null` for anything that cannot be
 * opened (no title, no subject id, no detail path) — those are the only fields
 * playback actually needs.
 */
export function normalizeCatalogueItem(raw: unknown): CatalogueItem | null {
  const r = asRecord(raw);
  if (!r) return null;

  const name = str(r.name) ?? str(r.title) ?? str(r.base_title) ?? str(r.baseTitle);
  const subjectId = str(r.subject_id) ?? str(r.subjectId) ?? str(r.id);
  const slug = str(r.slug) ?? str(r.detail_path) ?? str(r.detailPath) ?? str(r.detail_url);
  if (!name || !subjectId || !slug) return null;

  const cover = asRecord(r.cover);
  const posterUrl =
    str(r.poster_url) ??
    str(r.posterUrl) ??
    str(r.poster) ??
    (cover ? str(cover.url) : null) ??
    str(r.image);

  const releaseDate = str(r.release_date) ?? str(r.releaseDate);
  const yearRaw = str(r.year) ?? str(r.release_year);
  const year = yearRaw ?? (releaseDate ? releaseDate.slice(0, 4) : null);

  const seasons = Array.isArray(r.seasons) ? r.seasons.length : 0;
  const mediaType = mediaTypeOf(r.type ?? r.subjectType, seasons > 0);

  const tags = tagsOf(name);
  const badge = str(r.badge);
  const language = str(r.language);
  const dubFlag = bool(r.dub) ?? bool(r.dubbed);

  const rawGenres = r.genre ?? r.genres;
  const rawGenreStr = Array.isArray(rawGenres)
    ? rawGenres.map((g) => (typeof g === "string" ? g : str(asRecord(g)?.name) ?? "")).join(",")
    : str(rawGenres) ?? "";
  if (/\b(erotic|hentai|ecchi|adult|xxx|porn|nsfw|18\+|uncensored|bride of the goblin|goblin no suana)\b/i.test(`${name} ${rawGenreStr}`)) {
    return null;
  }

  return {
    name,
    displayName: cleanTitle(name),
    posterUrl,
    slug,
    subjectId,
    badge,
    rating: str(r.rating) ?? str(r.imdbRatingValue) ?? str(r.imdb_rating),
    year,
    genre: genreOf(r.genre ?? r.genres),
    mediaType,
    country: str(r.country) ?? str(r.countryName) ?? str(r.country_name),
    language,
    audio: str(r.audio),
    dub: dubFlag ?? undefined,
    dubs: Array.isArray(r.dubs) ? r.dubs.filter((d): d is string => typeof d === "string") : undefined,
    subtitles: subtitlesOf(r.subtitles),
    description: str(r.description) ?? str(r.synopsis),
    duration: typeof r.duration === "number" ? r.duration : null,
    releaseDate,
    hasResource: bool(r.has_resource) ?? bool(r.hasResource) ?? undefined,
    baseTitle: str(r.base_title) ?? str(r.baseTitle),
    isShort: r.type === 7 || r.type === "7" || undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

function reasonFor(raw: unknown): string {
  const r = asRecord(raw);
  if (!r) return "not_an_object";
  if (!(str(r.name) ?? str(r.title) ?? str(r.base_title) ?? str(r.baseTitle))) return "missing_title";
  if (!(str(r.subject_id) ?? str(r.subjectId) ?? str(r.id))) return "missing_subject_id";
  if (!(str(r.slug) ?? str(r.detail_path) ?? str(r.detailPath) ?? str(r.detail_url))) return "missing_detail_path";
  return "unknown";
}

function account(report: NormalizeReport, item: CatalogueItem): void {
  report.normalized += 1;
  if (item.genre) report.withGenre += 1;
  if (item.country) report.withCountry += 1;
  if (item.rating) report.withRating += 1;
  if (item.year) report.withYear += 1;
  if (item.dub === true || (item.badge && /hindi|punjabi|tamil|telugu/i.test(item.badge))) report.dubbed += 1;
}

export function normalizeItems(rawItems: unknown[]): { items: CatalogueItem[]; report: NormalizeReport } {
  const report = emptyReport();
  const items: CatalogueItem[] = [];
  for (const raw of rawItems) {
    report.received += 1;
    const item = normalizeCatalogueItem(raw);
    if (!item) {
      report.rejected += 1;
      bump(report.reasons, reasonFor(raw));
      continue;
    }
    items.push(item);
    account(report, item);
  }
  return { items, report };
}

export interface NormalizedHome {
  sections: HomeSection[];
  report: NormalizeReport;
  rawSections: number;
  mergedSections: number;
}

function mergeReport(target: NormalizeReport, source: NormalizeReport): void {
  target.received += source.received;
  target.normalized += source.normalized;
  target.rejected += source.rejected;
  target.withGenre += source.withGenre;
  target.withCountry += source.withCountry;
  target.withRating += source.withRating;
  target.withYear += source.withYear;
  target.dubbed += source.dubbed;
  for (const [reason, count] of Object.entries(source.reasons)) {
    target.reasons[reason] = (target.reasons[reason] ?? 0) + count;
  }
}

/**
 * Normalize the `/home` section list.
 *
 * Sections are merged by canonical world, so `🔥Trending Now` and
 * `🔥Trending now` become one rail with the union of their items instead of two
 * near-identical rails. Empty sections are dropped, never rendered.
 */
export function normalizeHomeSections(rawSections: unknown[]): NormalizedHome {
  const report = emptyReport();
  const byKey = new Map<string, HomeSection>();
  const seenItems = new Map<string, Set<string>>();
  let mergedSections = 0;

  for (const raw of rawSections) {
    const section = asRecord(raw);
    if (!section) continue;
    const label = str(section.section) ?? str(section.title) ?? str(section.name);
    const rawItems = Array.isArray(section.items) ? section.items : [];
    if (!label) {
      report.rejected += rawItems.length;
      bump(report.reasons, "missing_section_label");
      continue;
    }
    if (rawItems.length === 0) continue;

    const world = providerWorldFor(label);
    const key = world?.key ?? label.trim().toLowerCase();
    const title = titleFromSectionLabel(label);
    const { items, report: sectionReport } = normalizeItems(rawItems);
    mergeReport(report, sectionReport);

    const existing = byKey.get(key);
    const seen = seenItems.get(key) ?? new Set<string>();
    if (existing) mergedSections += 1;

    const deduped = items.filter((item) => {
      if (seen.has(item.subjectId)) return false;
      seen.add(item.subjectId);
      return true;
    });

    if (existing) {
      existing.items.push(...deduped);
    } else {
      byKey.set(key, { section: title, items: deduped });
      seenItems.set(key, seen);
    }
  }

  // Drop sections that ended up with no usable items after merging.
  const sections = Array.from(byKey.values()).filter((section) => section.items.length > 0);
  return { sections, report, rawSections: Array.isArray(rawSections) ? rawSections.length : 0, mergedSections };
}
