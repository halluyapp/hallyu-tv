import type { AudioVersionOption } from "@/types/provider";

/**
 * Original Audio Enforcement & Live Audio Switcher Engine for Moviebox / Zarhosting.
 *
 * Key Moviebox (`moviebox.ph`) rules:
 * 1. NEVER filter `/home` or `/search` items by `item.badge` — Moviebox puts
 *    multi-language availability badges (e.g. "Hindi", "Indonesian", "Sub | Dub")
 *    on top trending Original shows! Filtering by `badge` wipes out Home rails.
 * 2. Only hide explicit `[Hindi]` / `(Hindi)` / `-hindi-` duplicate clone cards
 *    on browse/search when clean items remain (never emptying any Home section).
 * 3. Moviebox delivers audio languages in TWO ways:
 *    - Separate sibling `subjectId` + `detailPath` entries (in `dubs` or `/search`)
 *    - Multi-audio MP4/HLS containers (`player.availableAudioTracks`)
 *    This module powers automatic Original Audio selection AND live in-player
 *    switching across both!
 */

export interface DubSibling {
  subjectId: string;
  detailPath: string;
  lanCode: string | null;
  lanName: string | null;
  type: number | null;
  isOriginalFlag: boolean;
}

export interface MinimalAudioTrack {
  id: string;
  language?: string | null;
  label?: string | null;
}

const BRACKETED_LANG_RE =
  /[\[(\{]\s*(?:in\s+)?(hindi|hin|tamil|tam|telugu|tel|malayalam|mal|kannada|kan|bengali|ben|marathi|punjabi|urdu|urd|tagalog|tgl|filipino|indonesian|indo|bahasa|malay|thai|vietnamese|viet|arabic|ara|russian|rus|french|fra|spanish|latino|portuguese|dublado|persian|farsi|turkish|english|eng|korean|kor|japanese|jpn|chinese|mandarin)(?:\s*[-–/&,+\s]*\s*(?:dub|dubbed|audio|version|ver\.?|voice|sub|hd))*\s*[\])\}]/i;

const BRACKETED_LANG_STRIP_RE =
  /[\[(\{]\s*(?:in\s+)?(?:hindi|hin|tamil|tam|telugu|tel|malayalam|mal|kannada|kan|bengali|ben|marathi|punjabi|urdu|urd|tagalog|tgl|filipino|indonesian|indo|bahasa|malay|thai|vietnamese|viet|arabic|ara|russian|rus|french|fra|spanish|latino|portuguese|dublado|persian|farsi|turkish|english|eng|korean|kor|japanese|jpn|chinese|mandarin)(?:\s*[-–/&,+\s]*\s*(?:dub|dubbed|audio|version|ver\.?|voice|eng|english|sub|hd))*\s*[\])\}]/gi;

const SUFFIX_DUB_RE =
  /(?:[-–—:|]\s*|\b(?:in)\s+)(hindi|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|urdu|tagalog|filipino)(?:\s+(?:dub|dubbed|audio|version|movie|series))?\s*$/i;

const EXPLICIT_PHRASE_DUB_RE =
  /\b(hindi|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|urdu|tagalog|filipino|arabic|russian|french|indonesian|spanish|portuguese|persian|turkish)\s+(?:dub|dubbed|voice[\s-]*over|audio\s*track)\b/i;

const DUAL_HINDI_RE = /\b(?:dual\s*audio[^\n]*hindi|hindi\s+dual\s*audio|hin[-/\s]+eng\s+dub(?:bed)?)\b/i;

const HINDI_TOKEN_RE =
  /(?:^|[^a-z0-9])(?:hindi|हिंदी|हिन्दी)(?:$|[^a-z0-9])|(?:^|[\s\[(\-_.:/])hin(?:$|[\s\])\-_.:/])/i;

const SLUG_LANG_TOKEN_RE =
  /-(hindi|tamil|telugu|malayalam|kannada|bengali|urdu|tagalog|filipino|indonesian|arabic|russian|french|spanish|portuguese|thai|turkish|english)(?:-(?:dub|dubbed|audio|version|movie))?(?:-[a-z0-9]{5,16})?$/i;

const QUERY_HINDI_OR_DUB_REQUEST_RE =
  /\b(?:hindi|tamil|telugu|malayalam|kannada|bengali|urdu|tagalog|filipino|dub|dubbed|dual\s*audio)\b/i;

const DUB_LANG_CODES = new Set([
  "hi",
  "hin",
  "hindi",
  "ta",
  "tam",
  "tamil",
  "te",
  "tel",
  "telugu",
  "ml",
  "mal",
  "malayalam",
  "kn",
  "kan",
  "kannada",
  "bn",
  "ben",
  "bengali",
  "ur",
  "urd",
  "urdu",
  "mr",
  "mar",
  "marathi",
  "pa",
  "pan",
  "punjabi",
]);

const COUNTRY_LANGUAGE_MAP: ReadonlyArray<{ pattern: RegExp; codes: readonly string[]; display: string }> = [
  { pattern: /\b(?:south\s+korea|korea|kr|rok)\b/i, codes: ["ko", "kor", "korean", "한국어"], display: "Korean" },
  { pattern: /\b(?:japan|jp|jpn)\b/i, codes: ["ja", "jpn", "japanese", "日本語"], display: "Japanese" },
  {
    pattern: /\b(?:china|mainland\s+china|hong\s+kong|taiwan|cn|hk|tw)\b/i,
    codes: ["zh", "zho", "chi", "cmn", "yue", "chinese", "mandarin", "cantonese", "中文", "国语", "粤语"],
    display: "Chinese",
  },
  { pattern: /\b(?:thailand|th|tha)\b/i, codes: ["th", "tha", "thai"], display: "Thai" },
  {
    pattern:
      /\b(?:united\s+states|usa|u\.s\.a\.?|us|united\s+kingdom|uk|britain|england|canada|australia|new\s+zealand|ireland|nigeria|south\s+africa)\b/i,
    codes: ["en", "eng", "english"],
    display: "English",
  },
  { pattern: /\b(?:spain|mexico|colombia|argentina|chile|peru)\b/i, codes: ["es", "spa", "spanish", "español"], display: "Spanish" },
  { pattern: /\b(?:france|belgium)\b/i, codes: ["fr", "fra", "fre", "french", "français"], display: "French" },
  { pattern: /\b(?:germany|austria)\b/i, codes: ["de", "deu", "ger", "german", "deutsch"], display: "German" },
  { pattern: /\b(?:italy)\b/i, codes: ["it", "ita", "italian", "italiano"], display: "Italian" },
  { pattern: /\b(?:turkey|türkiye)\b/i, codes: ["tr", "tur", "turkish", "türkçe"], display: "Turkish" },
  { pattern: /\b(?:indonesia)\b/i, codes: ["id", "ind", "indonesian"], display: "Indonesian" },
  { pattern: /\b(?:philippines)\b/i, codes: ["tl", "fil", "tagalog", "filipino", "en", "eng", "english"], display: "Filipino" },
  {
    pattern: /\b(?:india)\b/i,
    codes: ["hi", "hin", "hindi", "ta", "tam", "tamil", "te", "tel", "telugu", "ml", "kn", "bn", "en"],
    display: "Indian Original",
  },
];

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  ko: "Korean",
  kor: "Korean",
  korean: "Korean",
  ja: "Japanese",
  jpn: "Japanese",
  japanese: "Japanese",
  zh: "Chinese",
  zho: "Chinese",
  chi: "Chinese",
  cmn: "Mandarin",
  yue: "Cantonese",
  chinese: "Chinese",
  mandarin: "Mandarin",
  en: "English",
  eng: "English",
  english: "English",
  th: "Thai",
  tha: "Thai",
  thai: "Thai",
  es: "Spanish",
  spa: "Spanish",
  spanish: "Spanish",
  fr: "French",
  fra: "French",
  fre: "French",
  french: "French",
  de: "German",
  deu: "German",
  ger: "German",
  it: "Italian",
  ita: "Italian",
  pt: "Portuguese",
  por: "Portuguese",
  tr: "Turkish",
  tur: "Turkish",
  turkish: "Turkish",
  ru: "Russian",
  rus: "Russian",
  russian: "Russian",
  ar: "Arabic",
  ara: "Arabic",
  arabic: "Arabic",
  id: "Indonesian",
  ind: "Indonesian",
  indonesian: "Indonesian",
  tl: "Tagalog",
  tgl: "Tagalog",
  tagalog: "Tagalog",
  fil: "Filipino",
  filipino: "Filipino",
  vi: "Vietnamese",
  vie: "Vietnamese",
  hi: "Hindi",
  hin: "Hindi",
  hindi: "Hindi",
  ta: "Tamil",
  tam: "Tamil",
  tamil: "Tamil",
  te: "Telugu",
  tel: "Telugu",
  telugu: "Telugu",
  ml: "Malayalam",
  mal: "Malayalam",
  malayalam: "Malayalam",
  kn: "Kannada",
  kan: "Kannada",
  kannada: "Kannada",
  bn: "Bengali",
  ben: "Bengali",
  bengali: "Bengali",
  ur: "Urdu",
  urd: "Urdu",
  urdu: "Urdu",
  und: "Original Audio",
};

/**
 * Strips `[Hindi]`, `(Hindi Dubbed)`, `- Hindi`, `[Dual Audio]`, etc. to recover
 * the clean canonical title.
 */
export function cleanBaseTitle(rawTitle: string | null | undefined): string {
  if (!rawTitle) return "";
  return rawTitle
    .replace(BRACKETED_LANG_STRIP_RE, " ")
    .replace(/[\[(\{]\s*(?:english|eng)\s+dub(?:bed)?\s*[\])\}]/gi, " ")
    .replace(/[\[(\{]\s*dual\s*audio\s*[\])\}]/gi, " ")
    .replace(EXPLICIT_PHRASE_DUB_RE, " ")
    .replace(DUAL_HINDI_RE, " ")
    .replace(SUFFIX_DUB_RE, " ")
    .replace(/\s*[-–—:|]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeTitleKey(rawTitle: string | null | undefined): string {
  return cleanBaseTitle(rawTitle)
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]+/g, "");
}

/** True when the user explicitly typed "hindi", "tamil", "dubbed", etc. in Search. */
export function queryExplicitlyRequestsDub(query: string | null | undefined): boolean {
  if (!query) return false;
  return QUERY_HINDI_OR_DUB_REQUEST_RE.test(query.trim());
}

export function inferOriginalLanguageCodes(country: string | null | undefined): readonly string[] {
  if (!country) return [];
  for (const entry of COUNTRY_LANGUAGE_MAP) {
    if (entry.pattern.test(country)) return entry.codes;
  }
  return [];
}

export function inferOriginalLanguageDisplay(country: string | null | undefined): string | null {
  if (!country) return null;
  for (const entry of COUNTRY_LANGUAGE_MAP) {
    if (entry.pattern.test(country)) return entry.display;
  }
  return null;
}

export function isIndianOrigin(country: string | null | undefined): boolean {
  return Boolean(country && /\bindia\b/i.test(country));
}

/**
 * Extracts explicit dub language name from a title or slug (e.g. `"Hindi"`, `"Tamil"`, `"English"`),
 * or `null` if the title/slug has no dub tag (i.e. it is the Original Audio release).
 */
export function detectTitleOrSlugDubLanguage(
  title: string | null | undefined,
  slug: string | null | undefined,
): string | null {
  const t = title?.trim() ?? "";
  const s = slug?.trim() ?? "";

  if (t) {
    const bracketMatch = BRACKETED_LANG_RE.exec(t);
    if (bracketMatch?.[1]) {
      const key = bracketMatch[1].toLowerCase();
      return LANGUAGE_DISPLAY_NAMES[key] ?? bracketMatch[1];
    }
    const phraseMatch = EXPLICIT_PHRASE_DUB_RE.exec(t);
    if (phraseMatch?.[1]) {
      const key = phraseMatch[1].toLowerCase();
      return LANGUAGE_DISPLAY_NAMES[key] ?? phraseMatch[1];
    }
    const suffixMatch = SUFFIX_DUB_RE.exec(t);
    if (suffixMatch?.[1]) {
      const key = suffixMatch[1].toLowerCase();
      return LANGUAGE_DISPLAY_NAMES[key] ?? suffixMatch[1];
    }
    if (DUAL_HINDI_RE.test(t)) return "Hindi";
  }

  if (s) {
    if (/-(?:in-hindi|hindi-dub|hindi-dubbed)(?:-|$)/i.test(s)) return "Hindi";
    const slugMatch = SLUG_LANG_TOKEN_RE.exec(s);
    if (slugMatch?.[1]) {
      const token = slugMatch[1].toLowerCase();
      const base = cleanBaseTitle(t).toLowerCase();
      if (!base || !base.includes(token)) {
        return LANGUAGE_DISPLAY_NAMES[token] ?? slugMatch[1];
      }
    }
  }

  return null;
}

/**
 * Detects whether metadata marks an item or stream as a Hindi dub.
 * NOTE: Catalogue filtering NEVER passes `item.badge` here because Moviebox
 * puts multi-audio availability badges on Original shows too.
 */
export function isHindiDubMetadata(meta: {
  title?: string | null;
  slug?: string | null;
  badge?: string | null;
  lanCode?: string | null;
  lanName?: string | null;
  country?: string | null;
}): boolean {
  const title = meta.title?.trim() ?? "";
  const slug = meta.slug?.trim() ?? "";
  const badge = meta.badge?.trim() ?? "";
  const lanCode = meta.lanCode?.trim().toLowerCase() ?? "";
  const lanName = meta.lanName?.trim() ?? "";

  if (badge && HINDI_TOKEN_RE.test(badge)) return true;
  if (lanName && HINDI_TOKEN_RE.test(lanName) && !isIndianOrigin(meta.country)) return true;
  if ((lanCode === "hi" || lanCode === "hin" || lanCode === "hindi") && !isIndianOrigin(meta.country)) {
    return true;
  }

  if (title) {
    if (/[\[(\{][^\])}]*\b(?:hindi|hin)\b[^\])}]*[\])\}]/i.test(title)) return true;
    if (/\bhindi\s+(?:dub|dubbed|audio|version|voice)\b/i.test(title)) return true;
    if (/(?:[-–—:|]\s*|\bin\s+)hindi(?:\s+(?:dub|dubbed|movie|series))?\s*$/i.test(title)) return true;
    if (DUAL_HINDI_RE.test(title)) return true;
  }

  if (slug) {
    if (/-(?:in-hindi|hindi-dub|hindi-dubbed)(?:-|$)/i.test(slug)) return true;
    const slugMatch = /-(hindi)(?:-(?:dub|dubbed|audio|version|movie))?(?:-[a-z0-9]{5,16})?$/i.exec(slug);
    if (slugMatch) {
      const base = cleanBaseTitle(title).toLowerCase();
      if (!base || !base.includes("hindi")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detects whether stream/detail metadata marks an entry as a regional dub
 * (Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Urdu, Tagalog).
 */
export function isDubbedMetadata(meta: {
  title?: string | null;
  slug?: string | null;
  badge?: string | null;
  lanCode?: string | null;
  lanName?: string | null;
  country?: string | null;
}): boolean {
  if (isHindiDubMetadata(meta)) return true;

  const title = meta.title?.trim() ?? "";
  const slug = meta.slug?.trim() ?? "";
  const badge = meta.badge?.trim() ?? "";
  const lanCode = meta.lanCode?.trim().toLowerCase() ?? "";
  const lanName = meta.lanName?.trim() ?? "";

  if (lanName && /\boriginal\b/i.test(lanName)) return false;

  if (badge && /\b(?:tamil|telugu|malayalam|kannada|bengali|urdu|tagalog)\s*(?:dub|dubbed)?\b/i.test(badge)) {
    return true;
  }

  if (title) {
    if (
      /[\[(\{]\s*(?:in\s+)?(?:tamil|tam|telugu|tel|malayalam|mal|kannada|kan|bengali|ben|urdu|urd|tagalog|tgl|filipino)(?:\s*[-–/&,+\s]*\s*(?:dub|dubbed|audio|version))*\s*[\])\}]/i.test(
        title,
      )
    ) {
      return true;
    }
    if (SUFFIX_DUB_RE.test(title) || EXPLICIT_PHRASE_DUB_RE.test(title)) return true;
  }

  if (slug) {
    if (/-(?:tamil-dub|tamil-dubbed|telugu-dub|telugu-dubbed|urdu-dub|urdu-dubbed|tagalog-dub|tagalog-dubbed)(?:-|$)/i.test(slug)) {
      return true;
    }
    const m = /-(tamil|telugu|malayalam|kannada|bengali|urdu|tagalog|filipino)(?:-(?:dub|dubbed|audio|version|movie))?(?:-[a-z0-9]{5,16})?$/i.exec(
      slug,
    );
    if (m?.[1]) {
      const token = m[1].toLowerCase();
      const base = cleanBaseTitle(title).toLowerCase();
      if (!base || !base.includes(token)) {
        return true;
      }
    }
  }

  if (lanCode && DUB_LANG_CODES.has(lanCode) && !isIndianOrigin(meta.country)) {
    return true;
  }
  if (lanName && /\bdub(?:bed)?\b/i.test(lanName)) {
    return true;
  }

  return false;
}

/**
 * Safe, surgical catalogue filter for `/home` and `/search`:
 * - NEVER inspects `item.badge` (which on Moviebox lists available languages on
 *   Original shows and would falsely strip top Home rails!).
 * - ONLY removes explicit `[Hindi]` / `(Hindi)` / `-hindi-` / South-Asian dub
 *   clone cards based on `item.name` and `item.slug`.
 * - NEVER empties a section or result list: if every item in a rail happened to
 *   have a dub slug, keeps them all intact so Home sections never disappear
 *   (and `fetchDetail` / Player Audio Switcher switches them to Original Audio!).
 */
export function filterOriginalCatalogueItems<
  T extends {
    subjectId: string;
    name: string;
    slug: string;
    badge?: string | null;
    mediaType: "movie" | "series";
    year?: string | null;
  },
>(items: readonly T[], opts?: { query?: string | null }): T[] {
  if (items.length === 0) return [];
  if (queryExplicitlyRequestsDub(opts?.query)) {
    return [...items];
  }

  const nonDubbed = items.filter(
    (item) =>
      !isHindiDubMetadata({
        title: item.name,
        slug: item.slug,
      }) &&
      !isDubbedMetadata({
        title: item.name,
        slug: item.slug,
      }),
  );

  // Never wipe out a Home section or search page if all returned items had dub slugs!
  if (nonDubbed.length === 0) {
    return [...items];
  }

  return nonDubbed;
}

function strField(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/**
 * Extracts sibling language versions from Moviebox's `dubs` array in `/detail`.
 */
export function parseDubSiblings(...containers: unknown[]): DubSibling[] {
  const out: DubSibling[] = [];
  const seen = new Set<string>();

  for (const c of containers) {
    if (!c || typeof c !== "object") continue;
    const obj = c as Record<string, unknown>;
    const list = Array.isArray(obj.dubs)
      ? obj.dubs
      : Array.isArray(obj.dubList)
        ? obj.dubList
        : Array.isArray(obj.languages)
          ? obj.languages
          : null;
    if (!list) continue;

    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const d = raw as Record<string, unknown>;
      const subjectId = strField(d, "subjectId", "subject_id", "id");
      const detailPath = strField(d, "detailPath", "detail_path", "slug");
      if (!subjectId || !detailPath || seen.has(subjectId)) continue;
      seen.add(subjectId);

      const lanCode = strField(d, "lanCode", "lan_code", "lan", "language", "lang")?.toLowerCase() ?? null;
      const lanName = strField(d, "lanName", "lan_name", "languageName", "name", "title", "label");
      const typeVal = typeof d.type === "number" ? d.type : typeof d.dubType === "number" ? d.dubType : null;
      const isOriginalFlag =
        d.isOriginal === true ||
        d.original === true ||
        typeVal === 0 ||
        Boolean(lanName && /\boriginal\b/i.test(lanName));

      out.push({
        subjectId,
        detailPath,
        lanCode,
        lanName,
        type: typeVal,
        isOriginalFlag,
      });
    }
  }

  return out;
}

function siblingMatchesLanguage(sib: DubSibling, codes: readonly string[]): boolean {
  if (codes.length === 0) return false;
  const code = sib.lanCode?.toLowerCase() ?? "";
  const name = sib.lanName?.toLowerCase() ?? "";
  return codes.some((wanted) => {
    const w = wanted.toLowerCase();
    return code === w || code.startsWith(`${w}-`) || name === w || name.includes(w);
  });
}

function isHindiOrRegionalSibling(sib: DubSibling, country: string | null | undefined): boolean {
  return isDubbedMetadata({
    slug: sib.detailPath,
    lanCode: sib.lanCode,
    lanName: sib.lanName,
    country,
  });
}

/**
 * Given the current `/detail` subject and its `dubs` list, returns the Original
 * Audio sibling when the current subject is a Hindi/regional dub (or `null` if
 * the current subject is already the Original Audio release).
 */
export function pickOriginalDubSibling(params: {
  currentSubjectId: string;
  currentTitle: string;
  currentSlug: string;
  country?: string | null;
  dubs: readonly DubSibling[];
}): DubSibling | null {
  const { currentSubjectId, currentTitle, currentSlug, country, dubs } = params;
  if (dubs.length === 0) return null;

  const selfInDubs = dubs.find((d) => d.subjectId === currentSubjectId || d.detailPath === currentSlug);
  const originCodes = inferOriginalLanguageCodes(country);

  if (selfInDubs) {
    if (selfInDubs.isOriginalFlag) return null;
    if (originCodes.length > 0 && siblingMatchesLanguage(selfInDubs, originCodes) && !isHindiOrRegionalSibling(selfInDubs, country)) {
      return null;
    }
  }

  const currentLooksDubbed =
    isDubbedMetadata({
      title: currentTitle,
      slug: currentSlug,
      lanCode: selfInDubs?.lanCode,
      lanName: selfInDubs?.lanName,
      country,
    }) || Boolean(selfInDubs && selfInDubs.type !== null && selfInDubs.type > 0 && !selfInDubs.isOriginalFlag);

  if (!currentLooksDubbed) return null;

  const explicitOriginal = dubs.find(
    (d) => d.isOriginalFlag && !isHindiOrRegionalSibling(d, country),
  );
  if (explicitOriginal && explicitOriginal.subjectId !== currentSubjectId) {
    return explicitOriginal;
  }

  if (originCodes.length > 0) {
    const countryMatched = dubs.find(
      (d) => siblingMatchesLanguage(d, originCodes) && !isHindiOrRegionalSibling(d, country),
    );
    if (countryMatched && countryMatched.subjectId !== currentSubjectId) {
      return countryMatched;
    }
  }

  const cleanSlugSibling = dubs.find(
    (d) =>
      !isHindiOrRegionalSibling(d, country) &&
      !isDubbedMetadata({ slug: d.detailPath, lanCode: d.lanCode, lanName: d.lanName, country }),
  );
  if (cleanSlugSibling && cleanSlugSibling.subjectId !== currentSubjectId) {
    return cleanSlugSibling;
  }

  return null;
}

/**
 * Builds sorted, human-friendly `AudioVersionOption[]` from Moviebox `dubs` siblings
 * and/or sibling catalogue items discovered via clean-title search so the viewer
 * can ALWAYS switch between Original Audio and any dubbed versions!
 */
export function buildAudioVersionOptions(params: {
  currentSubjectId: string;
  currentDetailPath: string;
  currentTitle: string;
  country?: string | null;
  dubs?: readonly DubSibling[];
  searchSiblings?: ReadonlyArray<{
    subjectId: string;
    slug: string;
    name: string;
  }>;
}): AudioVersionOption[] {
  const { currentSubjectId, currentDetailPath, currentTitle, country, dubs = [], searchSiblings = [] } = params;
  const originLangDisplay = inferOriginalLanguageDisplay(country);
  const originCodes = inferOriginalLanguageCodes(country);
  const byId = new Map<string, AudioVersionOption>();

  const formatOriginalLabel = (explicitLang?: string | null) => {
    const clean = explicitLang && !/\boriginal\b/i.test(explicitLang) ? explicitLang : originLangDisplay;
    return clean ? `Original Audio (${clean})` : "Original Audio";
  };

  for (const d of dubs) {
    const code = d.lanCode?.toLowerCase() ?? null;
    const mappedName =
      (code ? LANGUAGE_DISPLAY_NAMES[code] : null) ??
      (d.lanName && !/\boriginal\b/i.test(d.lanName) ? d.lanName : null);
    const isHindi = isHindiDubMetadata({
      slug: d.detailPath,
      lanCode: d.lanCode,
      lanName: d.lanName,
      country,
    });
    const isOrig =
      !isHindi &&
      (d.isOriginalFlag ||
        (originCodes.length > 0 && siblingMatchesLanguage(d, originCodes)) ||
        !detectTitleOrSlugDubLanguage(d.lanName, d.detailPath));

    const label = isOrig
      ? formatOriginalLabel(mappedName)
      : mappedName
        ? /\bdub/i.test(mappedName)
          ? mappedName
          : `${mappedName} Dub`
        : "Alternate Audio";

    byId.set(d.subjectId, {
      subjectId: d.subjectId,
      detailPath: d.detailPath,
      label,
      lanCode: code,
      isOriginal: isOrig,
      isHindi,
    });
  }

  for (const item of searchSiblings) {
    if (byId.has(item.subjectId)) continue;
    const detectedLang = detectTitleOrSlugDubLanguage(item.name, item.slug);
    const isHindi = isHindiDubMetadata({ title: item.name, slug: item.slug, country });
    const isOrig = !isHindi && !detectedLang;
    const label = isOrig
      ? formatOriginalLabel(null)
      : `${detectedLang ?? "Alternate"} Dub`;

    byId.set(item.subjectId, {
      subjectId: item.subjectId,
      detailPath: item.slug,
      label,
      lanCode: detectedLang ? detectedLang.toLowerCase().slice(0, 2) : null,
      isOriginal: isOrig,
      isHindi,
    });
  }

  // Ensure the currently loaded subject is always represented
  if (currentSubjectId && currentDetailPath && !byId.has(currentSubjectId)) {
    const detectedLang = detectTitleOrSlugDubLanguage(currentTitle, currentDetailPath);
    const isHindi = isHindiDubMetadata({ title: currentTitle, slug: currentDetailPath, country });
    const isOrig = !isHindi && !detectedLang;
    byId.set(currentSubjectId, {
      subjectId: currentSubjectId,
      detailPath: currentDetailPath,
      label: isOrig ? formatOriginalLabel(null) : `${detectedLang ?? "Hindi"} Dub`,
      lanCode: isHindi ? "hi" : null,
      isOriginal: isOrig,
      isHindi,
    });
  }

  const list = [...byId.values()];
  list.sort((a, b) => {
    if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
    if (a.isHindi !== b.isHindi) return a.isHindi ? 1 : -1;
    return a.label.localeCompare(b.label);
  });

  // Disambiguate if multiple entries share the exact same label
  const labelCounts = new Map<string, number>();
  for (const opt of list) {
    labelCounts.set(opt.label, (labelCounts.get(opt.label) ?? 0) + 1);
  }
  const seenIdx = new Map<string, number>();
  return list.map((opt) => {
    if ((labelCounts.get(opt.label) ?? 0) <= 1) return opt;
    const idx = (seenIdx.get(opt.label) ?? 0) + 1;
    seenIdx.set(opt.label, idx);
    return idx === 1 ? opt : { ...opt, label: `${opt.label} #${idx}` };
  });
}

function normalizeTrackTokens(track: MinimalAudioTrack): {
  code: string;
  label: string;
  combined: string;
} {
  const code = (track.language ?? "").trim().toLowerCase();
  const label = (track.label ?? "").trim().toLowerCase();
  return { code, label, combined: `${code} ${label}`.trim() };
}

function isTrackHindiOrRegionalDub(track: MinimalAudioTrack, country?: string | null): boolean {
  if (isIndianOrigin(country)) return false;
  const { code, label, combined } = normalizeTrackTokens(track);
  if (!combined) return false;
  const baseCode = code.split(/[-_]/)[0] ?? "";
  if (DUB_LANG_CODES.has(code) || DUB_LANG_CODES.has(baseCode)) return true;
  if (/\b(?:hindi|tamil|telugu|malayalam|kannada|bengali|urdu|marathi|punjabi)\b/i.test(combined)) {
    return true;
  }
  if (/\bdub(?:bed)?\b/i.test(label) && !/\boriginal\b/i.test(label)) {
    return true;
  }
  return false;
}

/**
 * Chooses the best Original Audio track when an MP4 or HLS stream contains
 * multiple audio tracks (e.g. Track 0 = Hindi `hi`, Track 1 = Korean `ko` / Japanese `ja` / English `en`).
 */
export function pickOriginalAudioTrack<T extends MinimalAudioTrack>(
  tracks: readonly T[],
  country?: string | null,
): T | null {
  if (tracks.length <= 1) return tracks[0] ?? null;

  const originCodes = inferOriginalLanguageCodes(country);

  const explicitOrig = tracks.find((t) => {
    const { label } = normalizeTrackTokens(t);
    return /\boriginal\b/i.test(label) && !isTrackHindiOrRegionalDub(t, country);
  });
  if (explicitOrig) return explicitOrig;

  if (originCodes.length > 0) {
    const originMatch = tracks.find((t) => {
      if (isTrackHindiOrRegionalDub(t, country)) return false;
      const { code, label } = normalizeTrackTokens(t);
      const baseCode = code.split(/[-_]/)[0] ?? "";
      return originCodes.some((wanted) => {
        const w = wanted.toLowerCase();
        return code === w || baseCode === w || label === w || label.includes(w);
      });
    });
    if (originMatch) return originMatch;
  }

  const nonDubTrack = tracks.find((t) => !isTrackHindiOrRegionalDub(t, country));
  if (nonDubTrack) return nonDubTrack;

  return tracks[0] ?? null;
}

/** Formats raw ExoPlayer audio track metadata into a clear cinema label. */
export function formatAudioTrackLabel(
  track: MinimalAudioTrack,
  index: number,
  country?: string | null,
): string {
  const rawLabel = track.label?.trim() ?? "";
  const rawLang = track.language?.trim() ?? "";
  const baseCode = rawLang.toLowerCase().split(/[-_]/)[0] ?? "";
  const mappedName =
    LANGUAGE_DISPLAY_NAMES[rawLang.toLowerCase()] ??
    LANGUAGE_DISPLAY_NAMES[baseCode] ??
    null;

  const originCodes = inferOriginalLanguageCodes(country);
  const isOriginMatch =
    originCodes.length > 0 &&
    originCodes.some((c) => c === rawLang.toLowerCase() || c === baseCode);
  const isDub = isTrackHindiOrRegionalDub(track, country);

  let base =
    rawLabel && rawLabel.toLowerCase() !== "unknown" && rawLabel.toLowerCase() !== "und"
      ? rawLabel
      : mappedName ?? (rawLang ? rawLang.toUpperCase() : `Audio Track ${index + 1}`);

  if (mappedName && base.toLowerCase() === rawLang.toLowerCase()) {
    base = mappedName;
  }

  if (isOriginMatch && !/\boriginal\b/i.test(base)) {
    return `${base} (Original)`;
  }
  if (isDub && !/\bdub\b/i.test(base)) {
    return `${base} (Dub)`;
  }
  return base;
}
