import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  cleanTitle,
  normalizeCatalogueItem,
  normalizeHomeSections,
  normalizeItems,
  tagsOf,
} from "../src/services/catalogue/normalize";
import {
  applyFilters,
  appendUnique,
  canonicalGenre,
  isAnimeItem,
  isBlockedItem,
  isChinese,
  isDubbedItem,
  isKorean,
  isOriginalAudio,
  matchesWorld,
  paginate,
  providerWorldFor,
  sortByRating,
} from "../src/services/catalogue/worlds";
import { buildSnapshot } from "../src/services/catalogue/index";
import { PROVIDER_BASE_URL } from "../src/services/provider/client";
import { searchCatalogue } from "../src/services/provider/adapter";
import type { CatalogueItem, HomeSection } from "../src/types/provider";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A `/home` item, exactly as the live provider returns it. */
function homeRaw(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Love [Hindi]",
    poster_url: "https://cdn.example.com/love.jpg",
    slug: "love-hindi-ex58XnwT1m5",
    subject_id: "1001",
    badge: "Hindi",
    rating: "7.0",
    year: "2026",
    genre: "Drama,Romance",
    type: "tv",
    ...over,
  };
}

/** A `/search` item, with the richer metadata that endpoint returns. */
function searchRaw(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...homeRaw(),
    name: "Love",
    base_title: "Love",
    description: null,
    country: "Korea",
    duration: 5400,
    release_date: "2021-01-23",
    has_resource: true,
    language: null,
    audio: "Original",
    dub: false,
    dubs: [],
    sub: true,
    subtitles: ["English"],
    ...over,
  };
}

function item(over: Record<string, unknown> = {}): CatalogueItem {
  const normalized = normalizeCatalogueItem(searchRaw(over));
  if (!normalized) throw new Error("fixture failed to normalize");
  return normalized;
}

describe("catalogue normalization", () => {
  test("reads field aliases from every provider shape", () => {
    const normalized = normalizeCatalogueItem({
      title: "Squid Game",
      detail_path: "squid-game-abc",
      subjectId: "42",
      posterUrl: "https://p/x.jpg",
      type: "series",
      genre: "drama, thriller",
      year: 2021,
      imdbRatingValue: "8.0",
      countryName: "Korea",
      dub: false,
      release_date: "2021-09-17",
    });
    expect(normalized).not.toBeNull();
    expect(normalized?.name).toBe("Squid Game");
    expect(normalized?.displayName).toBe("Squid Game");
    expect(normalized?.country).toBe("Korea");
    expect(normalized?.genre).toBe("Drama,Thriller");
    expect(normalized?.year).toBe("2021");
    expect(normalized?.mediaType).toBe("series");
    expect(normalized?.dub).toBe(false);
  });

  test("title metadata tags become display data, not part of the name", () => {
    const normalized = normalizeCatalogueItem(homeRaw({ name: "Ramayana [Hindi][CAM]" }));
    expect(normalized?.name).toBe("Ramayana [Hindi][CAM]");
    expect(normalized?.displayName).toBe("Ramayana");
    expect(normalized?.tags).toEqual(["Hindi", "CAM"]);
    expect(tagsOf("Love [Hindi]")).toEqual(["Hindi"]);
    expect(cleanTitle("  Plain   Title  ")).toBe("Plain Title");
  });

  test("classifies movies and series without guessing from collections", () => {
    expect(normalizeCatalogueItem(homeRaw({ type: "tv" }))?.mediaType).toBe("series");
    expect(normalizeCatalogueItem(homeRaw({ type: 2 }))?.mediaType).toBe("series");
    expect(normalizeCatalogueItem(homeRaw({ type: "movie" }))?.mediaType).toBe("movie");
    const short = normalizeCatalogueItem(homeRaw({ type: 7 }));
    expect(short?.mediaType).toBe("series");
    expect(short?.isShort).toBe(true);
    // Unknown type with no seasons is a movie — never assumed to be a series.
    expect(normalizeCatalogueItem(homeRaw({ type: undefined }))?.mediaType).toBe("movie");
    expect(normalizeCatalogueItem(homeRaw({ type: undefined, slug: "s", subject_id: "1" }))?.mediaType).toBe("movie");
  });

  test("normalizes genre arrays and drops adult genres", () => {
    const normalized = normalizeCatalogueItem(homeRaw({ genre: ["action", "Sci-Fi"] }));
    expect(normalized?.genre).toBe("Action,Sci-Fi");
    expect(canonicalGenre("drama")).toBe("Drama");
    expect(canonicalGenre("sci-fi")).toBe("Sci-Fi");
    expect(canonicalGenre("erotic")).toBeNull();
    const adult = normalizeCatalogueItem(homeRaw({ genre: "Erotic,Hot" }));
    expect(adult?.genre).toBeNull();
    expect(isBlockedItem({ ...item(), genre: "Drama,Erotic" })).toBe(true);
  });

  test("rejects items that cannot be opened and reports why", () => {
    const { items, report } = normalizeItems([
      homeRaw(),
      { name: "No id" },
      { subject_id: "1", slug: "x" },
      null,
      "nope",
    ]);
    expect(items).toHaveLength(1);
    expect(report.received).toBe(5);
    expect(report.normalized).toBe(1);
    expect(report.rejected).toBe(4);
    expect(report.reasons.missing_subject_id).toBe(1);
    expect(report.reasons.missing_title).toBe(1);
    expect(report.reasons.not_an_object).toBe(2);
  });
});

describe("home section organization", () => {
  test("merges provider sections that differ only by case or emoji", () => {
    const { sections, report, mergedSections } = normalizeHomeSections([
      { section: "🔥Trending Now", items: [homeRaw({ subject_id: "1", slug: "a-1" }), homeRaw({ subject_id: "2", slug: "b-2" })] },
      { section: "🔥Trending now", items: [homeRaw({ subject_id: "2", slug: "b-2" }), homeRaw({ subject_id: "3", slug: "c-3" })] },
      { section: "Top Anime Series", items: [homeRaw({ subject_id: "4", slug: "d-4", genre: "Anime,Action" })] },
      { section: "Empty", items: [] },
      { section: "Broken", items: [{ foo: "bar" }] },
    ]);
    expect(sections.map((section) => section.section)).toEqual(["Trending Now", "Anime"]);
    expect(sections[0]?.items.map((entry) => entry.subjectId)).toEqual(["1", "2", "3"]);
    expect(mergedSections).toBe(1);
    expect(report.rejected).toBe(1);
  });

  test("keeps unknown labels but cleans them for display", () => {
    const { sections } = normalizeHomeSections([
      { section: "✨_new arrivals_✨", items: [homeRaw()] },
    ]);
    expect(sections[0]?.section).toBe("New arrivals");
  });
});

describe("content worlds and classification", () => {
  test("provider labels map to canonical worlds", () => {
    expect(providerWorldFor("🔥Trending Now")?.key).toBe("trending");
    expect(providerWorldFor("Top Anime Series")?.key).toBe("anime");
    expect(providerWorldFor("🔥Hot Short TV")?.key).toBe("shorts");
    expect(providerWorldFor("Best Asian Dramas")?.key).toBe("asian-dramas");
    expect(providerWorldFor("Bollywood")?.key).toBe("bollywood");
    expect(providerWorldFor("Something Else")).toBeNull();
  });

  test("country, anime and dub metadata drive classification", () => {
    expect(isKorean(item({ country: "Korea" }))).toBe(true);
    expect(isChinese(item({ country: "China" }))).toBe(true);
    expect(isAnimeItem(item({ country: "Japan", genre: "Animation" }))).toBe(true);
    expect(isAnimeItem(item({ country: "Japan", genre: "Drama" }))).toBe(false);
    expect(isAnimeItem(item({ country: "Korea", genre: "Anime" }))).toBe(true);
    expect(isDubbedItem(item({ badge: "Hindi", dub: true }))).toBe(true);
    expect(isOriginalAudio(item({ badge: "", dub: false, slug: "love-abc" }))).toBe(true);
    expect(isDubbedItem(item({ name: "Ramayana [Hindi]", badge: "", dub: false }))).toBe(true);
  });

  test("K-Drama is a series world, not a keyword search", () => {
    const koreanMovie = item({ country: "Korea", type: "movie" });
    const koreanSeries = item({ country: "Korea", type: "tv" });
    expect(matchesWorld(koreanMovie, "kdrama")).toBe(false);
    expect(matchesWorld(koreanSeries, "kdrama")).toBe(true);
    expect(matchesWorld(item({ country: "Korea" }), "movies")).toBe(false);
  });

  test("section membership keeps provider worlds intact", () => {
    const bollywood = item({ country: "India", type: "movie", language: "Hindi" });
    const membership = { [bollywood.subjectId]: ["bollywood"] };
    expect(matchesWorld(bollywood, "bollywood", membership)).toBe(true);
    expect(matchesWorld(item({ country: "France", slug: "f-1", subject_id: "9" }), "bollywood", {})).toBe(false);
  });

  test("combined filters intersect instead of replacing each other", () => {
    const romance = item({ subject_id: "a", country: "Korea", genre: "Romance,Drama", type: "tv" });
    const action = item({ subject_id: "b", country: "Korea", genre: "Action", type: "tv" });
    const chinese = item({ subject_id: "c", country: "China", genre: "Romance", type: "tv" });
    const filtered = applyFilters([romance, action, chinese], { world: "kdrama", genre: "Romance", type: "series" });
    expect(filtered.map((entry) => entry.subjectId)).toEqual(["a"]);
  });

  test("pagination and duplicate prevention are stable", () => {
    const items = Array.from({ length: 45 }, (_, index) =>
      item({ subject_id: `id-${index}`, slug: `slug-${index}` }),
    );
    const first = paginate(items, 1, 20);
    expect(first.items).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    const last = paginate(items, 3, 20);
    expect(last.items).toHaveLength(5);
    expect(last.hasMore).toBe(false);
    expect(appendUnique(items.slice(0, 3), items.slice(0, 5))).toHaveLength(5);
  });
});

describe("catalogue snapshot", () => {
  const sections: HomeSection[] = [
    {
      section: "Featured",
      items: [item({ subject_id: "f1", slug: "f1", badge: "Hindi", dub: true, country: "India" })],
    },
    {
      section: "Trending Now",
      items: [
        item({ subject_id: "t1", slug: "t1", badge: "Hindi", dub: true, country: "India", rating: "9.0" }),
        item({ subject_id: "t2", slug: "t2", badge: "Hindi", dub: true, country: "India" }),
      ],
    },
    {
      section: "Bollywood",
      items: [
        item({ subject_id: "b1", slug: "b1", badge: "Hindi", dub: true, country: "India", type: "movie" }),
        item({ subject_id: "b2", slug: "b2", badge: "Hindi", dub: true, country: "India", type: "movie" }),
        item({ subject_id: "b3", slug: "b3", badge: "Hindi", dub: true, country: "India", type: "movie" }),
      ],
    },
    {
      section: "Anime",
      items: [item({ subject_id: "a1", slug: "a1", country: "Japan", genre: "Anime,Action", badge: "", dub: false })],
    },
  ];

  const harvest: CatalogueItem[] = [
    item({ subject_id: "k1", slug: "k1", country: "Korea", genre: "Romance,Drama", type: "tv", badge: "", dub: false }),
    item({ subject_id: "k2", slug: "k2", country: "Korea", genre: "Thriller", type: "tv", badge: "", dub: false }),
    item({ subject_id: "k3", slug: "k3", country: "Korea", genre: "Drama", type: "tv", badge: "", dub: false }),
    item({ subject_id: "c1", slug: "c1", country: "China", genre: "Drama", type: "tv", badge: "", dub: false }),
    item({ subject_id: "c2", slug: "c2", country: "China", genre: "Romance", type: "tv", badge: "", dub: false }),
    item({ subject_id: "c3", slug: "c3", country: "China", genre: "Romance", type: "tv", badge: "", dub: false }),
  ];

  test("builds only non-empty shelves and dedupes inside each shelf", () => {
    const snapshot = buildSnapshot({ sections, harvest, at: 1 });
    expect(snapshot.shelves.length).toBeGreaterThan(0);
    for (const shelf of snapshot.shelves) {
      expect(shelf.items.length).toBeGreaterThan(0);
      expect(new Set(shelf.items.map((entry) => entry.subjectId)).size).toBe(shelf.items.length);
    }
    const titles = snapshot.shelves.map((shelf) => shelf.title);
    expect(titles).toContain("Trending Now");
    expect(titles).toContain("K-Drama");
    expect(titles).toContain("C-Drama");
    expect(titles).toContain("Bollywood");
  });

  test("trending preserves provider ranking order", () => {
    const snapshot = buildSnapshot({ sections, harvest, at: 1 });
    const trending = snapshot.shelves.find((shelf) => shelf.key === "trending");
    expect(trending?.items[0]?.subjectId).toBe("t1");
  });

  test("K-Drama only contains metadata-verified Korean series", () => {
    const snapshot = buildSnapshot({ sections, harvest, at: 1 });
    const kdrama = snapshot.shelves.find((shelf) => shelf.title === "K-Drama");
    expect(kdrama?.items.map((entry) => entry.subjectId)).toEqual(["k1", "k2", "k3"]);
  });

  test("dub-only provider worlds are labelled honestly", () => {
    const snapshot = buildSnapshot({ sections, harvest, at: 1 });
    const bollywood = snapshot.shelves.find((shelf) => shelf.key === "section-bollywood");
    expect(bollywood?.subtitle).toBe("Hindi dub");
    const kdrama = snapshot.shelves.find((shelf) => shelf.title === "K-Drama");
    expect(kdrama?.subtitle).toBeNull();
    // A derived world and a provider section with the same name must not both render.
    const titles = snapshot.shelves.map((shelf) => shelf.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
  });

  test("hero prefers original-language titles over the dub banner", () => {
    const snapshot = buildSnapshot({ sections, harvest, at: 1 });
    expect(snapshot.hero[0]?.subjectId.startsWith("k") || snapshot.hero[0]?.subjectId === "c1").toBe(true);
  });

  test("reports metadata coverage and classification counts", () => {
    const snapshot = buildSnapshot({ sections, harvest, at: 1 });
    expect(snapshot.stats.items).toBe(snapshot.index.length);
    expect(snapshot.stats.withCountry).toBeGreaterThan(0);
    expect(snapshot.stats.withGenre).toBeGreaterThan(0);
    expect(snapshot.stats.dubbed).toBeGreaterThan(0);
    expect(snapshot.genres).toContain("Drama");
  });

  test("genre shelves only appear when the catalogue supports them", () => {
    const few = buildSnapshot({ sections: [{ section: "Cinema", items: [item({ genre: "Horror" })] }], at: 1 });
    expect(few.shelves.some((shelf) => shelf.title === "Horror")).toBe(false);

    const many: CatalogueItem[] = Array.from({ length: 6 }, (_, index) =>
      item({ subject_id: `h-${index}`, slug: `h-${index}`, genre: "Horror" }),
    );
    const plenty = buildSnapshot({ sections: [{ section: "Cinema", items: many }], at: 1 });
    expect(plenty.shelves.some((shelf) => shelf.title === "Horror")).toBe(true);
  });

  test("search results are rated, not ordered by provider luck", () => {
    const snapshot = buildSnapshot({
      sections: [
        {
          section: "Trending Now",
          items: [
            item({ subject_id: "low", slug: "low", rating: "5.0" }),
            item({ subject_id: "high", slug: "high", rating: "9.4" }),
          ],
        },
      ],
      at: 1,
    });
    expect(sortByRating(snapshot.index)[0]?.subjectId).toBe("high");
  });
});

describe("provider search contract", () => {
  test("builds the verified query with page and per_page", async () => {
    const fetchMock = mock(async () =>
      jsonResponse({
        query: "love",
        page: 2,
        per_page: 60,
        count: 1,
        total: 785,
        total_pages: 14,
        has_more: true,
        items: [searchRaw()],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const page = await searchCatalogue("love", 2, undefined, 60);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PROVIDER_BASE_URL}/search?q=love&page=2&per_page=60`);
    expect(page.totalPages).toBe(14);
    expect(page.total).toBe(785);
    expect(page.hasMore).toBe(true);
    expect(page.items[0]?.country).toBe("Korea");
  });

  test("an empty query never hits the network", async () => {
    const fetchMock = mock(async () => jsonResponse({ items: [] }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const page = await searchCatalogue("   ", 1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(page.items).toHaveLength(0);
    expect(page.hasMore).toBe(false);
  });
});
