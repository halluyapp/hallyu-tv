import type { CatalogueItem } from "@/types/provider";

/**
 * Content worlds — the vocabulary shared by Home, Explore and TV Explore.
 *
 * The provider publishes its own curated sections (Trending, Cinema, Bollywood,
 * Hollywood, Anime…). Those labels are the only genuine *ranking* we get, so we
 * normalise them into canonical worlds instead of inventing shelves. Everything
 * else (K-Drama, C-Drama, Hollywood originals, genres) is derived from metadata
 * that actually exists on a catalogue item — country, language, genre, dub.
 *
 * This module is pure TypeScript: no react-native imports, fully unit-testable.
 */

export interface ProviderWorld {
  key: string;
  title: string;
  match: RegExp;
}

/**
 * Order matters: the first match wins. "Top Anime Series" must resolve to the
 * anime world, not to the generic top-series world.
 */
export const PROVIDER_WORLDS: ProviderWorld[] = [
  { key: "featured", title: "Featured", match: /\bbanner\b|\bfeatured\b/i },
  { key: "trending", title: "Trending Now", match: /trending/i },
  { key: "shorts", title: "Hot Shorts", match: /hot\s*short/i },
  { key: "anime", title: "Anime", match: /anime/i },
  { key: "cinema", title: "Cinema", match: /cinema/i },
  { key: "bollywood", title: "Bollywood", match: /bollywood/i },
  { key: "south-indian", title: "South Indian", match: /south\s*indian/i },
  { key: "hollywood", title: "Hollywood", match: /hollywood/i },
  { key: "top-series", title: "Top Series", match: /top\s*series/i },
  { key: "asian-dramas", title: "Asian Dramas", match: /asian\s*dramas?/i },
  { key: "indian-dramas", title: "Indian Dramas", match: /indian\s*dramas?/i },
  { key: "western-tv", title: "Western TV", match: /western/i },
];

/** Genres that must never build a curated shelf or a browse world. */
const BLOCKED_GENRE_WORDS = new Set(["erotic", "hot", "adult", "hentai", "ecchi", "xxx", "porn", "nsfw", "18+"]);

const BLOCKED_TEXT_RE = /\b(hentai|ecchi|erotic|erotica|porn|xxx|nsfw|uncensored|softcore|gravure|bride of the goblin|goblin no suana)\b/i;

/** Display casing for genres the provider writes in lower case. */
const GENRE_CASING: Record<string, string> = {
  "sci-fi": "Sci-Fi",
  scifi: "Sci-Fi",
  "slice of life": "Slice of Life",
  "tv movie": "TV Movie",
  "film-noir": "Film-Noir",
  "reality-tv": "Reality TV",
  "talk-show": "Talk Show",
  "game-show": "Game Show",
  "mini-series": "Mini-Series",
};

const TURKISH = "Turkish";
const CHINESE = "Chinese";
const JAPANESE = "Japanese";

/** Countries that count as "Hollywood" (English-language western industry). */
const WESTERN_COUNTRIES = new Set([
  "united states",
  "usa",
  "us",
  "united kingdom",
  "uk",
  "great britain",
  "canada",
  "australia",
  "new zealand",
  "ireland",
]);

/** Countries that count as Asian drama territory. */
const ASIAN_DRAMA_COUNTRIES = new Set([
  "korea",
  "south korea",
  "china",
  "taiwan",
  "hong kong",
  "japan",
  "thailand",
  "philippines",
  "vietnam",
  "indonesia",
  "malaysia",
  "singapore",
]);

/** Indian regional languages that place a title outside Bollywood proper. */
const SOUTH_INDIAN_LANGUAGES = new Set(["tamil", "telugu", "malayalam", "kannada"]);

/** Languages that indicate a dubbed release when they appear in a badge. */
const DUB_LANGUAGES = new Set(["hindi", "punjabi", "tamil", "telugu", "malayalam", "kannada", "bengali", "urdu"]);

/** Emoji are stripped from provider labels; they are decoration, not data. */
function stripDecoration(input: string): string {
  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    const emoji =
      (cp >= 0x1f000 && cp <= 0x1faff) ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2b00 && cp <= 0x2bff) ||
      cp === 0xfe0f ||
      cp === 0x200d;
    if (!emoji) out += ch;
  }
  return out.replace(/[\s_\-]+/g, " ").trim();
}

/** A provider section label → canonical world (or a cleaned title fallback). */
export function providerWorldFor(label: string): ProviderWorld | null {
  for (const world of PROVIDER_WORLDS) {
    if (world.match.test(label)) return world;
  }
  return null;
}

/** A section label → display title, with emoji and separators removed. */
export function titleFromSectionLabel(label: string): string {
  const world = providerWorldFor(label);
  if (world) return world.title;
  const clean = stripDecoration(label);
  if (!clean) return "More to explore";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function genresOf(item: CatalogueItem): string[] {
  if (!item.genre) return [];
  return item.genre
    .split(",")
    .map((g) => canonicalGenre(g))
    .filter((g): g is string => Boolean(g));
}

export function canonicalGenre(raw: string): string | null {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  if (BLOCKED_GENRE_WORDS.has(lower)) return null;
  const known = GENRE_CASING[lower];
  if (known) return known;
  // Provider casing is inconsistent ("drama" / "Drama"); normalise to Title Case.
  return lower
    .split(" ")
    .map((word) => (word.length <= 3 && word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** True when a title is adult-only and must stay out of curated shelves. */
export function isBlockedItem(item: CatalogueItem): boolean {
  if (BLOCKED_TEXT_RE.test(`${item.name} ${item.genre ?? ""} ${item.description ?? ""}`)) {
    return true;
  }
  if (!item.genre) return false;
  return item.genre
    .split(",")
    .map((g) => g.trim().toLowerCase())
    .some((g) => BLOCKED_GENRE_WORDS.has(g));
}

function countryOf(item: CatalogueItem): string {
  return (item.country ?? "").trim().toLowerCase();
}

function languageOf(item: CatalogueItem): string {
  const language = (item.language ?? "").trim().toLowerCase();
  if (language) return language;
  return (item.audio ?? "").trim().toLowerCase();
}

export function isKorean(item: CatalogueItem): boolean {
  const country = countryOf(item);
  return country === "korea" || country === "south korea" || country === "kr" || languageOf(item) === "korean";
}

export function isChinese(item: CatalogueItem): boolean {
  const country = countryOf(item);
  return (
    country === "china" ||
    country === "cn" ||
    country === "taiwan" ||
    country === "hong kong" ||
    languageOf(item) === CHINESE
  );
}

export function isJapanese(item: CatalogueItem): boolean {
  return countryOf(item) === "japan" || languageOf(item) === JAPANESE;
}

export function isAnimeItem(item: CatalogueItem): boolean {
  const genres = genresOf(item).map((g) => g.toLowerCase());
  if (genres.includes("anime")) return true;
  // Japanese animation, but not Japanese live-action drama.
  return isJapanese(item) && genres.some((g) => g === "animation" || g === "animated");
}

export function isHollywoodItem(item: CatalogueItem): boolean {
  return WESTERN_COUNTRIES.has(countryOf(item));
}

export function isIndianItem(item: CatalogueItem): boolean {
  const country = countryOf(item);
  return country === "india" || country === "in";
}

export function isSouthIndianItem(item: CatalogueItem): boolean {
  return isIndianItem(item) && SOUTH_INDIAN_LANGUAGES.has(languageOf(item));
}

export function isAsianDramaItem(item: CatalogueItem): boolean {
  return ASIAN_DRAMA_COUNTRIES.has(countryOf(item));
}

/** Dubbed when the provider says so, the badge/language says so, or tags do. */
export function isDubbedItem(item: CatalogueItem): boolean {
  if (item.dub === true) return true;
  const language = languageOf(item);
  if (language === TURKISH) return false;
  const badge = (item.badge ?? "").trim().toLowerCase();
  if (badge && DUB_LANGUAGES.has(badge)) return true;
  const tags = (item.tags ?? []).map((t) => t.trim().toLowerCase());
  if (tags.some((t) => DUB_LANGUAGES.has(t))) return true;
  if ((item.dubs ?? []).length > 0) return true;
  // The provider marks dub releases in the slug ("…-hindi-…").
  return /-hindi(-|$)/i.test(item.slug);
}

/** True when the release is not a dub (the original audio track). */
export function isOriginalAudio(item: CatalogueItem): boolean {
  return !isDubbedItem(item);
}

export type WorldKey =
  | "all"
  | "trending"
  | "kdrama"
  | "cdrama"
  | "anime"
  | "hollywood"
  | "bollywood"
  | "south-indian"
  | "indian-dramas"
  | "asian-dramas"
  | "western-tv"
  | "cinema"
  | "shorts"
  | "top-series"
  | "dubbed"
  | "movies"
  | "series";

export interface WorldOption {
  key: WorldKey;
  label: string;
}

/** The browse worlds offered by Explore, in editorial order. */
export const BROWSE_WORLDS: WorldOption[] = [
  { key: "all", label: "All" },
  { key: "kdrama", label: "K-Drama" },
  { key: "cdrama", label: "C-Drama" },
  { key: "anime", label: "Anime" },
  { key: "hollywood", label: "Hollywood" },
  { key: "bollywood", label: "Bollywood" },
  { key: "south-indian", label: "South Indian" },
  { key: "indian-dramas", label: "Indian Drama" },
  { key: "asian-dramas", label: "Asian Drama" },
  { key: "western-tv", label: "Western TV" },
  { key: "cinema", label: "Cinema" },
  { key: "top-series", label: "Top Series" },
  { key: "shorts", label: "Shorts" },
  { key: "movies", label: "Movies" },
  { key: "series", label: "Series" },
  { key: "dubbed", label: "Hindi Dub" },
];

/** Genre worlds are always filtered to what the live catalogue actually has. */
export const GENRE_SHELF_ORDER = [
  "Action",
  "Romance",
  "Thriller",
  "Drama",
  "Comedy",
  "Fantasy",
  "Adventure",
  "Mystery",
  "Sci-Fi",
  "Horror",
  "History",
  "Crime",
  "Family",
  "Animation",
];

export interface CatalogueFilters {
  world?: WorldKey;
  genre?: string | null;
  type?: "all" | "movie" | "series";
}

/** Section membership lets a provider world keep its editorial identity. */
export type WorldMembership = Record<string, string[]>;

export function matchesWorld(item: CatalogueItem, world: WorldKey, membership?: WorldMembership): boolean {
  if (world === "all") return true;
  const inSection = membership?.[item.subjectId]?.includes(world) ?? false;
  if (inSection) return true;

  switch (world) {
    case "movies":
      return item.mediaType === "movie";
    case "series":
      return item.mediaType === "series";
    case "kdrama":
      return isKorean(item) && item.mediaType === "series";
    case "cdrama":
      return isChinese(item) && item.mediaType === "series";
    case "anime":
      return isAnimeItem(item);
    case "hollywood":
      return isHollywoodItem(item);
    case "bollywood":
      return isIndianItem(item) && !isSouthIndianItem(item);
    case "south-indian":
      return isSouthIndianItem(item);
    case "indian-dramas":
      return isIndianItem(item) && item.mediaType === "series";
    case "asian-dramas":
      return isAsianDramaItem(item) && item.mediaType === "series";
    case "western-tv":
      return isHollywoodItem(item) && item.mediaType === "series";
    case "cinema":
      return item.mediaType === "movie";
    case "shorts":
      return item.isShort === true;
    case "top-series":
      return item.mediaType === "series";
    case "dubbed":
      return isDubbedItem(item);
    case "trending":
      return false;
    default:
      return false;
  }
}

export function matchesGenre(item: CatalogueItem, genre: string | null | undefined): boolean {
  if (!genre) return true;
  const wanted = genre.toLowerCase();
  return genresOf(item).some((g) => g.toLowerCase() === wanted);
}

export function matchesType(item: CatalogueItem, type: CatalogueFilters["type"]): boolean {
  if (!type || type === "all") return true;
  return item.mediaType === type;
}

/** Deduplicate by subject id, keeping the first occurrence. */
export function uniqueItems(items: CatalogueItem[]): CatalogueItem[] {
  const seen = new Set<string>();
  const out: CatalogueItem[] = [];
  for (const item of items) {
    if (seen.has(item.subjectId)) continue;
    seen.add(item.subjectId);
    out.push(item);
  }
  return out;
}

function numericRating(item: CatalogueItem): number {
  const n = Number(item.rating);
  return Number.isFinite(n) ? n : 0;
}

function numericYear(item: CatalogueItem): number {
  const n = Number(item.year);
  return Number.isFinite(n) ? n : 0;
}

/** Highest rated first; ties broken by newest year, then title. */
export function sortByRating(items: CatalogueItem[]): CatalogueItem[] {
  return [...items].sort(
    (a, b) => numericRating(b) - numericRating(a) || numericYear(b) - numericYear(a) || a.name.localeCompare(b.name),
  );
}

/** Newest first; ties broken by rating. */
export function sortByYear(items: CatalogueItem[]): CatalogueItem[] {
  return [...items].sort((a, b) => numericYear(b) - numericYear(a) || numericRating(b) - numericRating(a));
}

export function applyFilters(
  items: CatalogueItem[],
  filters: CatalogueFilters,
  membership?: WorldMembership,
): CatalogueItem[] {
  return items.filter(
    (item) =>
      matchesWorld(item, filters.world ?? "all", membership) &&
      matchesGenre(item, filters.genre) &&
      matchesType(item, filters.type),
  );
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/** Local (client-side) pagination, used by browse lists. */
export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.floor(pageSize));
  const start = (safePage - 1) * safeSize;
  const slice = items.slice(start, start + safeSize);
  return {
    items: slice,
    page: safePage,
    pageSize: safeSize,
    total: items.length,
    hasMore: start + slice.length < items.length,
  };
}

/** Append a page while dropping items already shown (duplicate prevention). */
export function appendUnique(existing: CatalogueItem[], incoming: CatalogueItem[]): CatalogueItem[] {
  return uniqueItems([...existing, ...incoming]);
}
