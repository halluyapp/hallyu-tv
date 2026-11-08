import { providerFetch, PROVIDER_MEDIA_HEADERS } from "./client";
import {
  cleanBaseTitle,
  filterOriginalCatalogueItems,
  isDubbedMetadata,
  normalizeTitleKey,
  parseDubSiblings,
  pickOriginalDubSibling,
} from "./originalAudio";
import { normalizeStreamResponse, selectableSources, streamEndpoint } from "./streams";
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
  parseCatalogueItem,
} from "@/types/provider";

/** Typed adapter for the Zarhosting public API. Responses are validated at runtime. */

function unwrap(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  if (typeof r.data === "object" && r.data !== null) return r.data as Record<string, unknown>;
  return r;
}

export async function fetchHome(signal?: AbortSignal): Promise<HomeSection[]> {
  const raw = await providerFetch("/home", { signal });
  const data = unwrap(raw);
  const rawSections = Array.isArray(data.sections)
    ? data.sections
    : Array.isArray((raw as Record<string, unknown>)?.sections)
      ? (raw as { sections: unknown[] }).sections
      : [];
  const sections: HomeSection[] = [];
  const seenLabels = new Set<string>();
  for (const s of rawSections) {
    if (typeof s !== "object" || s === null) continue;
    const section = s as Record<string, unknown>;
    const label = isNonEmptyString(section.section)
      ? section.section
      : isNonEmptyString(section.title)
        ? section.title
        : null;
    if (!label || !Array.isArray(section.items) || seenLabels.has(label)) continue;
    // Skip entire Hindi/regional dub-only rails if Moviebox ever injects one
    if (/\bhindi\s+dub|\bdubbed\s+in\s+hindi/i.test(label)) continue;

    const items = section.items.map(parseCatalogueItem).filter((i): i is CatalogueItem => i !== null);
    const seen = new Set<string>();
    const unique = items.filter((i) => (seen.has(i.subjectId) ? false : (seen.add(i.subjectId), true)));
    const originalsOnly = filterOriginalCatalogueItems(unique);
    if (originalsOnly.length === 0) continue;
    seenLabels.add(label);
    sections.push({ section: label, items: originalsOnly });
  }
  return sections;
}

export interface SearchPage {
  items: CatalogueItem[];
  page: number;
  totalPages: number;
}

export async function searchCatalogue(query: string, page = 1, signal?: AbortSignal): Promise<SearchPage> {
  const raw = await providerFetch(`/search?q=${encodeURIComponent(query)}&page=${page}`, { signal });
  const data = unwrap(raw);
  const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data.results) ? data.results : [];
  const items = rawItems.map(parseCatalogueItem).filter((i): i is CatalogueItem => i !== null);
  const seen = new Set<string>();
  const unique = items.filter((i) => (seen.has(i.subjectId) ? false : (seen.add(i.subjectId), true)));
  const filtered = filterOriginalCatalogueItems(unique, { query });
  const totalPages =
    typeof data.total_pages === "number"
      ? data.total_pages
      : typeof data.totalPages === "number"
        ? data.totalPages
        : 1;
  return { items: filtered, page, totalPages };
}

async function fetchDetailInternal(
  detailPath: string,
  signal?: AbortSignal,
  allowOriginalRedirect = true,
): Promise<TitleDetail> {
  const raw = await providerFetch(`/detail/${encodeURIComponent(detailPath)}`, { signal });
  const data = unwrap(raw);
  const subject = (
    typeof data.subject === "object" && data.subject !== null ? data.subject : data
  ) as Record<string, any>;
  if (!isNonEmptyString(subject.subjectId) || !isNonEmptyString(subject.title)) {
    throw new ProviderError("invalid_response", "Title data is incomplete.");
  }

  const resource = (
    typeof data.resource === "object" && data.resource !== null ? data.resource : {}
  ) as Record<string, any>;
  const resolvedSlug = isNonEmptyString(subject.detailPath) ? subject.detailPath : detailPath;
  const country = isNonEmptyString(subject.countryName) ? subject.countryName : null;

  // Canonicalize Hindi / regional dubbed subjects to their Original Audio release!
  if (allowOriginalRedirect) {
    const dubs = parseDubSiblings(subject, data, resource);
    const originalSibling = pickOriginalDubSibling({
      currentSubjectId: subject.subjectId,
      currentTitle: subject.title,
      currentSlug: resolvedSlug,
      country,
      dubs,
    });

    if (originalSibling && originalSibling.detailPath !== resolvedSlug) {
      try {
        return await fetchDetailInternal(originalSibling.detailPath, signal, false);
      } catch {
        // If sibling lookup fails, continue to clean-title fallback or current detail
      }
    }

    if (
      isDubbedMetadata({
        title: subject.title,
        slug: resolvedSlug,
        country,
      })
    ) {
      const baseTitle = cleanBaseTitle(subject.title);
      const wantedKey = normalizeTitleKey(baseTitle);
      const rawSeasonsCheck = Array.isArray(resource.seasons)
        ? resource.seasons
        : Array.isArray(subject.seasons)
          ? subject.seasons
          : [];
      const wantedMediaType = rawSeasonsCheck.length > 0 || subject.subjectType === 2 ? "series" : "movie";
      const wantedYear = isNonEmptyString(subject.releaseDate) ? subject.releaseDate.slice(0, 4) : null;

      if (baseTitle.length >= 2 && wantedKey.length >= 2) {
        try {
          const searchRes = await searchCatalogue(baseTitle, 1, signal);
          const cleanMatch =
            searchRes.items.find(
              (item) =>
                item.subjectId !== subject.subjectId &&
                item.mediaType === wantedMediaType &&
                normalizeTitleKey(item.name) === wantedKey &&
                (!wantedYear || !item.year || item.year === wantedYear),
            ) ??
            searchRes.items.find(
              (item) =>
                item.subjectId !== subject.subjectId &&
                item.mediaType === wantedMediaType &&
                normalizeTitleKey(item.name) === wantedKey,
            );
          if (cleanMatch) {
            return await fetchDetailInternal(cleanMatch.slug, signal, false);
          }
        } catch {
          // Non-fatal fallback
        }
      }
    }
  }

  const rawSeasons = Array.isArray(resource.seasons)
    ? resource.seasons
    : Array.isArray(subject.seasons)
      ? subject.seasons
      : [];
  const seasons: SeasonInfo[] = rawSeasons
    .map((s: any) => {
      const season = typeof s?.se === "number" ? s.se : typeof s?.season === "number" ? s.season : null;
      const maxEp =
        typeof s?.maxEp === "number" ? s.maxEp : typeof s?.episodeCount === "number" ? s.episodeCount : null;
      return season !== null && maxEp !== null && maxEp > 0 ? { season, maxEp } : null;
    })
    .filter((s): s is SeasonInfo => s !== null);

  const cast: StarInfo[] = Array.isArray(data.stars)
    ? data.stars
        .map((s: any) =>
          isNonEmptyString(s?.name)
            ? {
                name: s.name,
                character: isNonEmptyString(s.character) ? s.character : null,
                avatarUrl: isNonEmptyString(s.avatarUrl) ? s.avatarUrl : null,
              }
            : null,
        )
        .filter((s): s is StarInfo => s !== null)
    : [];

  const mediaType = seasons.length > 0 || subject.subjectType === 2 ? "series" : "movie";
  const trailerUrl = subject.trailer?.videoAddress?.url;

  return {
    subjectId: subject.subjectId,
    title: cleanBaseTitle(subject.title) || subject.title,
    description: isNonEmptyString(subject.description) ? subject.description : null,
    releaseDate: isNonEmptyString(subject.releaseDate) ? subject.releaseDate : null,
    genre: isNonEmptyString(subject.genre) ? subject.genre : null,
    country,
    rating: isNonEmptyString(subject.imdbRatingValue) ? subject.imdbRatingValue : null,
    posterUrl: isNonEmptyString(subject.cover?.url) ? subject.cover.url : null,
    backdropUrl: isNonEmptyString(subject.trailer?.cover?.url) ? subject.trailer.cover.url : null,
    trailerUrl: isNonEmptyString(trailerUrl) ? trailerUrl : null,
    detailPath: resolvedSlug,
    mediaType,
    seasons,
    subtitlesAvailable: isNonEmptyString(subject.subtitles)
      ? subject.subtitles
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [],
    cast,
  };
}

export async function fetchDetail(detailPath: string, signal?: AbortSignal): Promise<TitleDetail> {
  return fetchDetailInternal(detailPath, signal, true);
}

/**
 * Resolve playable sources through the required Zarhosting endpoint:
 * GET /stream/{subject_id}?detail_path=&se=&ep=
 * Movies use se=0&ep=0; series pass the selected season/episode.
 * If `detailPath` is a dubbed slug (e.g. from older local history), automatically
 * resolves the Original Audio sibling before requesting streams!
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
      n.note ??
        (n.hasResource
          ? "No playable source was returned for this selection."
          : "No stream is available for this title right now."),
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

/**
 * Original-Audio-enforced stream resolver used by Player, Prefetcher & Downloader:
 * if `detailPath` is a Hindi/regional dub slug (e.g. `attack-on-titan-hindi-...`
 * from older local history or 0ms instant launch), automatically canonicalizes
 * to the Original Audio `subjectId` + `detailPath` before requesting `/stream`!
 */
export async function resolveOriginalStreams(
  subjectId: string,
  detailPath: string,
  se = 0,
  ep = 0,
  signal?: AbortSignal,
): Promise<StreamResolution> {
  let targetSubjectId = subjectId;
  let targetDetailPath = detailPath;
  if (isDubbedMetadata({ slug: detailPath })) {
    try {
      const canonical = await fetchDetail(detailPath, signal);
      targetSubjectId = canonical.subjectId;
      targetDetailPath = canonical.detailPath;
    } catch {
      // Fallback to provided identifiers if detail lookup fails
    }
  }
  return resolveStreams(targetSubjectId, targetDetailPath, se, ep, signal);
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
    const languageName = isNonEmptyString(r.lanName)
      ? r.lanName
      : isNonEmptyString(r.languageName)
        ? r.languageName
        : language;
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
