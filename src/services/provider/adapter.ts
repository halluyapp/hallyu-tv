import { providerFetch } from "./client";
import {
  CatalogueItem,
  CaptionTrack,
  HomeSection,
  ProviderError,
  SeasonInfo,
  StarInfo,
  StreamResolution,
  TitleDetail,
  isNonEmptyString,
  parseCatalogueItem,
} from "@/types/provider";

/** Typed provider adapter. Every response is validated at runtime. */

export async function fetchHome(signal?: AbortSignal): Promise<HomeSection[]> {
  const raw = await providerFetch("/home", { signal });
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as Record<string, unknown>).sections)) {
    throw new ProviderError("invalid_response", "Unexpected home response.");
  }
  const sections: HomeSection[] = [];
  for (const s of (raw as { sections: unknown[] }).sections) {
    if (typeof s !== "object" || s === null) continue;
    const section = s as Record<string, unknown>;
    if (!isNonEmptyString(section.section) || !Array.isArray(section.items)) continue;
    const items = section.items.map(parseCatalogueItem).filter((i): i is CatalogueItem => i !== null);
    if (items.length === 0) continue;
    // De-duplicate within a section; skip duplicated section labels later in the list.
    const seen = new Set<string>();
    const unique = items.filter((i) => (seen.has(i.subjectId) ? false : (seen.add(i.subjectId), true)));
    if (unique.length === 0) continue;
    sections.push({ section: section.section, items: unique });
  }
  return sections;
}

export interface SearchPage {
  items: CatalogueItem[];
  page: number;
  totalPages: number;
}

export async function searchCatalogue(query: string, page = 1, signal?: AbortSignal): Promise<SearchPage> {
  const raw = await providerFetch(
    `/search?q=${encodeURIComponent(query)}&page=${page}`,
    { signal },
  );
  if (typeof raw !== "object" || raw === null) throw new ProviderError("invalid_response", "Unexpected search response.");
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.items)
    ? r.items.map(parseCatalogueItem).filter((i): i is CatalogueItem => i !== null)
    : [];
  const totalPages = typeof r.total_pages === "number" ? r.total_pages : 1;
  return { items, page, totalPages };
}

export async function fetchDetail(detailPath: string, signal?: AbortSignal): Promise<TitleDetail> {
  const raw = await providerFetch(`/detail/${encodeURIComponent(detailPath)}`, { signal });
  if (typeof raw !== "object" || raw === null) throw new ProviderError("invalid_response", "Unexpected detail response.");
  const data = (raw as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) throw new ProviderError("not_found", "This title could not be found.");
  const d = data as Record<string, unknown>;
  const subject = d.subject as Record<string, any> | undefined;
  if (!subject || !isNonEmptyString(subject.subjectId) || !isNonEmptyString(subject.title)) {
    throw new ProviderError("invalid_response", "Title data is incomplete.");
  }

  const resource = (d.resource ?? {}) as Record<string, any>;
  const seasons: SeasonInfo[] = Array.isArray(resource.seasons)
    ? resource.seasons
        .map((s: any) =>
          typeof s?.se === "number" && typeof s?.maxEp === "number"
            ? { season: s.se, maxEp: s.maxEp }
            : null,
        )
        .filter((s): s is SeasonInfo => s !== null)
    : [];

  const cast: StarInfo[] = Array.isArray(d.stars)
    ? d.stars
        .map((s: any) =>
          isNonEmptyString(s?.name)
            ? { name: s.name, character: isNonEmptyString(s.character) ? s.character : null, avatarUrl: isNonEmptyString(s.avatarUrl) ? s.avatarUrl : null }
            : null,
        )
        .filter((s): s is StarInfo => s !== null)
    : [];

  const mediaType = seasons.length > 0 || subject.subjectType === 2 ? "series" : "movie";
  const trailerUrl = subject.trailer?.videoAddress?.url;

  return {
    subjectId: subject.subjectId,
    title: subject.title,
    description: isNonEmptyString(subject.description) ? subject.description : null,
    releaseDate: isNonEmptyString(subject.releaseDate) ? subject.releaseDate : null,
    genre: isNonEmptyString(subject.genre) ? subject.genre : null,
    country: isNonEmptyString(subject.countryName) ? subject.countryName : null,
    rating: isNonEmptyString(subject.imdbRatingValue) ? subject.imdbRatingValue : null,
    posterUrl: isNonEmptyString(subject.cover?.url) ? subject.cover.url : null,
    backdropUrl: isNonEmptyString(subject.trailer?.cover?.url) ? subject.trailer.cover.url : null,
    trailerUrl: isNonEmptyString(trailerUrl) ? trailerUrl : null,
    detailPath: isNonEmptyString(subject.detailPath) ? subject.detailPath : detailPath,
    mediaType,
    seasons,
    subtitlesAvailable: isNonEmptyString(subject.subtitles)
      ? subject.subtitles.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [],
    cast,
  };
}

/**
 * Resolve playback streams. Movies use se=0/ep=0; series pass real numbers.
 * `detail_path` is REQUIRED by the provider contract (verified 2026-11-03).
 */
export async function resolveStreams(
  subjectId: string,
  detailPath: string,
  se = 0,
  ep = 0,
  signal?: AbortSignal,
): Promise<StreamResolution> {
  const qs = `detail_path=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`;
  const raw = await providerFetch(`/stream/${encodeURIComponent(subjectId)}?${qs}`, {
    timeoutMs: 20_000,
    signal,
  });
  if (typeof raw !== "object" || raw === null) throw new ProviderError("invalid_response", "Stream response was unreadable.");
  const r = raw as Record<string, any>;
  if (r.has_resource !== true || !Array.isArray(r.sources)) {
    throw new ProviderError("no_stream", isNonEmptyString(r.note) ? r.note : "No stream is available for this title right now.");
  }
  const sources = r.sources
    .filter(
      (s: any): s is Record<string, any> =>
        typeof s === "object" && s !== null && isNonEmptyString(s.url) && isNonEmptyString(s.resolution),
    )
    .map((s: any) => ({
      resolution: s.resolution,
      format: isNonEmptyString(s.format) ? s.format : "MP4",
      url: s.url,
      sizeBytes: typeof s.size === "string" && /^\d+$/.test(s.size) ? Number(s.size) : null,
      durationSeconds: typeof s.duration === "number" ? s.duration : null,
      codec: isNonEmptyString(s.codec) ? s.codec : null,
    }));
  return {
    subjectId: isNonEmptyString(r.subject_id) ? r.subject_id : subjectId,
    se: typeof r.se === "number" ? r.se : se,
    ep: typeof r.ep === "number" ? r.ep : ep,
    sources,
    hasResource: sources.length > 0,
    note: isNonEmptyString(r.note) ? r.note : null,
  };
}

export async function fetchCaptions(
  subjectId: string,
  detailPath: string,
  se = 0,
  ep = 0,
  signal?: AbortSignal,
): Promise<CaptionTrack[]> {
  const qs = `detail_path=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`;
  const raw = await providerFetch(`/stream/${encodeURIComponent(subjectId)}/captions?${qs}`, { signal });
  if (typeof raw !== "object" || raw === null) return [];
  const r = raw as Record<string, any>;
  if (!Array.isArray(r.captions)) return [];
  return r.captions
    .filter((c: any): c is Record<string, any> => typeof c === "object" && c !== null && isNonEmptyString(c.url))
    .map((c: any) => ({
      id: isNonEmptyString(c.id) ? c.id : `${c.lan ?? "track"}`,
      language: isNonEmptyString(c.lan) ? c.lan : "unknown",
      languageName: isNonEmptyString(c.lanName) ? c.lanName : c.lan ?? "Unknown",
      url: c.url,
    }));
}
