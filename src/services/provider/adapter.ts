import { providerFetch, PROVIDER_MEDIA_HEADERS } from "./client";
import { normalizeStreamResponse, selectableSources, streamEndpoint } from "./streams";
import { normalizeHomeSections, normalizeItems, type NormalizeReport } from "@/services/catalogue/normalize";
import {
  CaptionTrack,
  CatalogueItem,
  HomeSection,
  ProviderError,
  SeasonInfo,
  StarInfo,
  StreamResolution,
  TitleDetail,
  isNonEmptyString,
} from "@/types/provider";

/** Typed adapter for the Zarhosting public API. Responses are validated at runtime. */

function unwrap(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  if (typeof r.data === "object" && r.data !== null) return r.data as Record<string, unknown>;
  return r;
}

export interface HomeCatalogueResponse {
  sections: HomeSection[];
  report: NormalizeReport;
  rawSections: number;
  mergedSections: number;
}

/**
 * GET /home, fully normalized. Grouping and de-duplication happen in
 * `normalizeHomeSections`, so callers never see two rails with the same world
 * label (the provider ships `🔥Trending Now` and `🔥Trending now` separately).
 */
export async function fetchHomeCatalogue(signal?: AbortSignal): Promise<HomeCatalogueResponse> {
  const raw = await providerFetch("/home", { signal });
  const data = unwrap(raw);
  const rawSections = Array.isArray(data.sections)
    ? data.sections
    : Array.isArray((raw as Record<string, unknown>)?.sections)
      ? (raw as { sections: unknown[] }).sections
      : [];
  const { sections, report, mergedSections } = normalizeHomeSections(rawSections);
  return { sections, report, rawSections: rawSections.length, mergedSections };
}

export async function fetchHome(signal?: AbortSignal): Promise<HomeSection[]> {
  return (await fetchHomeCatalogue(signal)).sections;
}

export interface SearchPage {
  items: CatalogueItem[];
  page: number;
  totalPages: number;
  total: number;
  count: number;
  hasMore: boolean;
  report: NormalizeReport;
}

/**
 * GET /search — the provider's title index. It accepts `q`, `page` and
 * `per_page` only; genre/country/audio/sort parameters are ignored server-side.
 */
export async function searchCatalogue(
  query: string,
  page = 1,
  signal?: AbortSignal,
  perPage = 30,
): Promise<SearchPage> {
  const q = query.trim();
  if (q.length === 0) {
    return {
      items: [],
      page,
      totalPages: 1,
      total: 0,
      count: 0,
      hasMore: false,
      report: normalizeItems([]).report,
    };
  }
  const params = new URLSearchParams({ q, page: String(page), per_page: String(perPage) });
  const raw = await providerFetch(`/search?${params.toString()}`, { signal });
  const data = unwrap(raw);
  const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data.results) ? data.results : [];
  const { items, report } = normalizeItems(rawItems);
  const totalPages =
    typeof data.total_pages === "number"
      ? data.total_pages
      : typeof data.totalPages === "number"
        ? data.totalPages
        : 1;
  const total = typeof data.total === "number" ? data.total : items.length;
  return {
    items,
    page,
    totalPages,
    total,
    count: items.length,
    hasMore: typeof data.has_more === "boolean" ? data.has_more : page < totalPages,
    report,
  };
}

export async function fetchDetail(detailPath: string, signal?: AbortSignal): Promise<TitleDetail> {
  const raw = await providerFetch(`/detail/${encodeURIComponent(detailPath)}`, { signal });
  const data = unwrap(raw);
  const subject = (typeof data.subject === "object" && data.subject !== null ? data.subject : data) as Record<string, any>;
  if (!isNonEmptyString(subject.subjectId) || !isNonEmptyString(subject.title)) {
    throw new ProviderError("invalid_response", "Title data is incomplete.");
  }

  const resource = (typeof data.resource === "object" && data.resource !== null ? data.resource : {}) as Record<string, any>;
  const rawSeasons = Array.isArray(resource.seasons) ? resource.seasons : Array.isArray(subject.seasons) ? subject.seasons : [];
  const seasons: SeasonInfo[] = rawSeasons
    .map((s: any) => {
      const season = typeof s?.se === "number" ? s.se : typeof s?.season === "number" ? s.season : null;
      const maxEp = typeof s?.maxEp === "number" ? s.maxEp : typeof s?.episodeCount === "number" ? s.episodeCount : null;
      return season !== null && maxEp !== null && maxEp > 0 ? { season, maxEp } : null;
    })
    .filter((s): s is SeasonInfo => s !== null);

  const cast: StarInfo[] = Array.isArray(data.stars)
    ? data.stars
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
 * Resolve playable sources through the required Zarhosting endpoint:
 * GET /stream/{subject_id}?detail_path=&se=&ep=
 * Movies use se=0&ep=0; series pass the selected season/episode.
 */
export async function resolveStreams(
  subjectId: string,
  detailPath: string,
  se = 0,
  ep = 0,
  signal?: AbortSignal,
): Promise<StreamResolution> {
  if (!isNonEmptyString(subjectId) || !isNonEmptyString(detailPath)) {
    throw new ProviderError("invalid_response", "A subject id and detail path are required to resolve streams.");
  }
  if (!Number.isInteger(se) || se < 0 || !Number.isInteger(ep) || ep < 0) {
    throw new ProviderError("invalid_response", "Season and episode must be non-negative integers.");
  }
  const raw = await providerFetch(streamEndpoint(subjectId, detailPath, se, ep), {
    timeoutMs: 20_000,
    signal,
  });
  const n = normalizeStreamResponse(raw);
  if (selectableSources(n.sources).length === 0) {
    throw new ProviderError(
      "no_stream",
      n.note ?? (n.hasResource ? "No playable source was returned for this selection." : "No stream is available for this title right now."),
    );
  }
  return {
    subjectId: n.subjectId ?? subjectId,
    se,
    ep,
    sources: n.sources,
    hasResource: n.hasResource,
    note: n.note,
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
  const data = unwrap(raw);
  const list = Array.isArray(data.captions) ? data.captions : Array.isArray(data.subtitles) ? data.subtitles : [];
  const tracks: CaptionTrack[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    if (typeof c !== "object" || c === null) continue;
    const r = c as Record<string, unknown>;
    const url = typeof r.url === "string" ? r.url : typeof r.subtitleUrl === "string" ? r.subtitleUrl : null;
    if (!url || !/^https:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const language = isNonEmptyString(r.lan) ? r.lan : isNonEmptyString(r.language) ? r.language : "unknown";
    const languageName = isNonEmptyString(r.lanName) ? r.lanName : isNonEmptyString(r.languageName) ? r.languageName : language;
    tracks.push({
      id: isNonEmptyString(r.id) ? r.id : `${language}-${tracks.length}`,
      language,
      languageName,
      url,
    });
  }
  return tracks;
}

/** Fetch a caption file directly from the CDN with the media header profile. */
export async function fetchCaptionText(url: string, signal?: AbortSignal): Promise<string> {
  if (!/^https:\/\//i.test(url)) throw new ProviderError("invalid_response", "Invalid caption URL.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { headers: { ...PROVIDER_MEDIA_HEADERS }, signal: controller.signal });
    if (!res.ok) throw new ProviderError("unavailable", `Caption server responded with ${res.status}`);
    return await res.text();
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError("network", "Caption track could not be loaded.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
