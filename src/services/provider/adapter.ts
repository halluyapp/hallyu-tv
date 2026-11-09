import { providerFetch, PROVIDER_MEDIA_HEADERS } from "./client";
import {
  buildAudioVersionOptions,
  cleanBaseTitle,
  type DubSibling,
  filterOriginalCatalogueItems,
  isDubbedMetadata,
  normalizeTitleKey,
  parseDubSiblings,
  pickOriginalDubSibling,
} from "./originalAudio";
import { normalizeStreamResponse, selectableSources, streamEndpoint } from "./streams";
import {
  type AudioVersionOption,
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

    const items = section.items.map(parseCatalogueItem).filter((i): i is CatalogueItem => i !== null);
    const seen = new Set<string>();
    const unique = items.filter((i) => (seen.has(i.subjectId) ? false : (seen.add(i.subjectId), true)));
    if (unique.length === 0) continue;

    // Gently hide explicit [Hindi] / -hindi- duplicate cards while NEVER emptying any Home section!
    const cleaned = filterOriginalCatalogueItems(unique);
    seenLabels.add(label);
    sections.push({ section: label, items: cleaned.length > 0 ? cleaned : unique });
  }
  return sections;
}

export interface SearchPage {
  items: CatalogueItem[];
  page: number;
  totalPages: number;
}

async function searchRawCatalogue(query: string, page = 1, signal?: AbortSignal): Promise<SearchPage> {
  const raw = await providerFetch(`/search?q=${encodeURIComponent(query)}&page=${page}`, { signal });
  const data = unwrap(raw);
  const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data.results) ? data.results : [];
  const items = rawItems.map(parseCatalogueItem).filter((i): i is CatalogueItem => i !== null);
  const seen = new Set<string>();
  const unique = items.filter((i) => (seen.has(i.subjectId) ? false : (seen.add(i.subjectId), true)));
  const totalPages =
    typeof data.total_pages === "number"
      ? data.total_pages
      : typeof data.totalPages === "number"
        ? data.totalPages
        : 1;
  return { items: unique, page, totalPages };
}

export async function searchCatalogue(query: string, page = 1, signal?: AbortSignal): Promise<SearchPage> {
  const rawPage = await searchRawCatalogue(query, page, signal);
  const filtered = filterOriginalCatalogueItems(rawPage.items, { query });
  return { items: filtered, page: rawPage.page, totalPages: rawPage.totalPages };
}

async function fetchDetailInternal(
  detailPath: string,
  signal?: AbortSignal,
  allowOriginalRedirect = true,
  inheritedDubs: readonly DubSibling[] = [],
  inheritedSearchSiblings: readonly CatalogueItem[] = [],
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

  const localDubs = parseDubSiblings(subject, data, resource);
  const mergedDubs =
    inheritedDubs.length > 0
      ? [
          ...localDubs,
          ...inheritedDubs.filter((d) => !localDubs.some((ld) => ld.subjectId === d.subjectId)),
        ]
      : localDubs;
  let searchSiblings: readonly CatalogueItem[] = inheritedSearchSiblings;

  // Canonicalize Hindi / regional dubbed subjects to their Original Audio release!
  if (allowOriginalRedirect) {
    const originalSibling = pickOriginalDubSibling({
      currentSubjectId: subject.subjectId,
      currentTitle: subject.title,
      currentSlug: resolvedSlug,
      country,
      dubs: mergedDubs,
    });

    if (originalSibling && originalSibling.detailPath !== resolvedSlug) {
      try {
        return await fetchDetailInternal(
          originalSibling.detailPath,
          signal,
          false,
          mergedDubs,
          searchSiblings,
        );
      } catch {
        // Continue to clean-title fallback or current detail
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
          const searchRes = await searchRawCatalogue(baseTitle, 1, signal);
          const matchingSiblings = searchRes.items.filter(
            (item) =>
              item.mediaType === wantedMediaType &&
              normalizeTitleKey(item.name) === wantedKey &&
              (!wantedYear || !item.year || item.year === wantedYear),
          );
          searchSiblings =
            matchingSiblings.length > 0
              ? matchingSiblings
              : searchRes.items.filter(
                  (item) =>
                    item.mediaType === wantedMediaType && normalizeTitleKey(item.name) === wantedKey,
                );

          const cleanMatch = searchSiblings.find(
            (item) =>
              item.subjectId !== subject.subjectId &&
              !isDubbedMetadata({ title: item.name, slug: item.slug, country }),
          );
          if (cleanMatch) {
            return await fetchDetailInternal(
              cleanMatch.slug,
              signal,
              false,
              mergedDubs,
              searchSiblings,
            );
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

  const audioVersions = buildAudioVersionOptions({
    currentSubjectId: subject.subjectId,
    currentDetailPath: resolvedSlug,
    currentTitle: subject.title,
    country,
    dubs: mergedDubs,
    searchSiblings,
  });

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
    audioVersions,
  };
}

export async function fetchDetail(detailPath: string, signal?: AbortSignal): Promise<TitleDetail> {
  return fetchDetailInternal(detailPath, signal, true);
}

/**
 * Discovers all available Language / Audio Versions (`Original Audio`, `English`,
 * `Korean`, `Japanese`, `Hindi Dub`, etc.) for a title by combining `/detail` `dubs`
 * with clean-title sibling lookup on `/search`. Powers the live in-player Audio Switcher!
 */
export async function fetchAudioVersions(
  params: {
    subjectId: string;
    detailPath: string;
    title: string;
    mediaType: "movie" | "series";
    country?: string | null;
    existingVersions?: readonly AudioVersionOption[];
  },
  signal?: AbortSignal,
): Promise<AudioVersionOption[]> {
  const { subjectId, detailPath, title, mediaType } = params;
  let country = params.country ?? null;
  let dubs: DubSibling[] = [];

  try {
    const raw = await providerFetch(`/detail/${encodeURIComponent(detailPath)}`, { signal });
    const data = unwrap(raw);
    const subject = (
      typeof data.subject === "object" && data.subject !== null ? data.subject : data
    ) as Record<string, any>;
    const resource = (
      typeof data.resource === "object" && data.resource !== null ? data.resource : {}
    ) as Record<string, any>;
    if (!country && isNonEmptyString(subject?.countryName)) {
      country = subject.countryName;
    }
    dubs = parseDubSiblings(subject, data, resource);
  } catch {
    // Non-fatal: continue with clean-title sibling lookup
  }

  let searchSiblings: CatalogueItem[] = [];
  const baseTitle = cleanBaseTitle(title);
  const wantedKey = normalizeTitleKey(baseTitle);
  if (baseTitle.length >= 2 && wantedKey.length >= 2) {
    try {
      const searchRes = await searchRawCatalogue(baseTitle, 1, signal);
      searchSiblings = searchRes.items.filter(
        (item) => item.mediaType === mediaType && normalizeTitleKey(item.name) === wantedKey,
      );
    } catch {
      // Non-fatal
    }
  }

  const built = buildAudioVersionOptions({
    currentSubjectId: subjectId,
    currentDetailPath: detailPath,
    currentTitle: title,
    country,
    dubs,
    searchSiblings,
  });

  if (params.existingVersions && params.existingVersions.length > 0) {
    const merged = [...built];
    for (const prev of params.existingVersions) {
      if (!merged.some((m) => m.subjectId === prev.subjectId)) {
        merged.push(prev);
      }
    }
    return merged;
  }

  return built;
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
 * if `detailPath` is a Hindi/regional dub slug (e.g. `attack-on-titan-hindi-...`),
 * automatically canonicalizes to the Original Audio `subjectId` + `detailPath`
 * before requesting `/stream`!
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
    const language = typeof r.lan === "string" ? r.lan : typeof r.language === "string" ? r.language : "und";
    const languageName =
      typeof r.lanName === "string"
        ? r.lanName
        : typeof r.language_name === "string"
          ? r.language_name
          : language.toUpperCase();
    const id = typeof r.id === "string" || typeof r.id === "number" ? String(r.id) : `${language}_${tracks.length}`;
    tracks.push({ id, language, languageName, url });
  }
  return tracks;
}

export async function fetchCaptionText(url: string, signal?: AbortSignal): Promise<string> {
  if (!/^https:\/\//i.test(url)) throw new ProviderError("invalid_response", "Invalid caption URL.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, {
      headers: PROVIDER_MEDIA_HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) throw new ProviderError("unavailable", "Caption track unavailable.");
    return await res.text();
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError("network", "Could not download subtitles.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
