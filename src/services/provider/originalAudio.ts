/**
 * Original Audio Enforcement Engine for Moviebox / Zarhosting.
 *
 * Moviebox (`moviebox.ph`) publishes Hindi and regional dubs at 4 levels:
 * 1. Separate `[Hindi]` / `-hindi-` catalogue items in `/home` and `/search`
 * 2. Sibling `dubs` entries inside `/detail/{detail_path}`
 * 3. Multi-language stream entries inside `/stream/{subject_id}`
 * 4. Dual-audio MP4/HLS containers where Track 0 is `hi` (Hindi) and Track 1 is Original
 *
 * Pure TypeScript so adapter, stream selector, player, and Bun unit tests share
 * identical rules.
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

const BRACKETED_DUB_RE =
  /[\[(\{]\s*(?:in\s+)?(?:hindi|hin|tamil|tam|telugu|tel|malayalam|mal|kannada|kan|bengali|ben|marathi|punjabi|urdu|urd|tagalog|tgl|filipino|indonesian|indo|bahasa|malay|thai|vietnamese|viet|arabic|ara|russian|rus|french|fra|spanish|latino|portuguese|dublado|persian|farsi|turkish|khmer|burmese|sinhala)(?:\s*[-–/&,+\s]*\s*(?:dub|dubbed|audio|version|ver\.?|voice|eng|english|sub|hd))*\s*[\])\}]/gi;

const SUFFIX_DUB_RE =
  /(?:[-–—:|]\s*|\b(?:in)\s+)(?:hindi|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|urdu|tagalog|filipino)(?:\s+(?:dub|dubbed|audio|version|movie|series))?\s*$/i;

const EXPLICIT_PHRASE_DUB_RE =
  /\b(?:hindi|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|urdu|tagalog|filipino|arabic|russian|french|indonesian|thai|vietnamese|spanish|portuguese|persian|turkish)\s+(?:dub|dubbed|voice[\s-]*over|audio\s*track|audio)\b/i;

const DUAL_HINDI_RE = /\b(?:dual\s*audio[^\n]*hindi|hindi\s+dual\s*audio|hin[-/\s]+eng\s+dub(?:bed)?)\b/i;

const HINDI_TOKEN_RE =
  /(?:^|[^a-z0-9])(?:hindi|हिंदी|हिन्दी)(?:$|[^a-z0-9])|(?:^|[\s\[(\-_.:/])hin(?:$|[\s\])\-_.:/])/i;

const SLUG_DUB_TOKEN_RE =
  /-(hindi|tamil|telugu|malayalam|kannada|bengali|urdu|tagalog|filipino)(?:-(?:dub|dubbed|audio|version|movie))?(?:-[a-z0-9]{5,16})?$/i;

const SLUG_EXPLICIT_DUB_RE =
  /-(?:in-hindi|hindi-dub|hindi-dubbed|tamil-dub|tamil-dubbed|telugu-dub|telugu-dubbed|urdu-dub|urdu-dubbed|tagalog-dub|tagalog-dubbed|arabic-dub|russian-dub|french-dub|indonesian-dub)(?:-|$)/i;

const QUERY_DUB_REQUEST_RE =
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

const COUNTRY_LANGUAGE_MAP: ReadonlyArray<{ pattern: RegExp; codes: readonly string[] }> = [
  { pattern: /\b(?:south\s+korea|korea|kr|rok)\b/i, codes: ["ko", "kor", "korean", "한국어"] },
  { pattern: /\b(?:japan|jp|jpn)\b/i, codes: ["ja", "jpn", "japanese", "日本語"] },
  {
    pattern: /\b(?:china|mainland\s+china|hong\s+kong|taiwan|cn|hk|tw)\b/i,
    codes: ["zh", "zho", "chi", "cmn", "yue", "chinese", "mandarin", "cantonese", "中文", "国语", "粤语"],
  },
  { pattern: /\b(?:thailand|th|tha)\b/i, codes: ["th", "tha", "thai"] },
  {
    pattern: /\b(?:united\s+states|usa|u\.s\.a\.?|us|united\s+kingdom|uk|britain|england|canada|australia|new\s+zealand|ireland|nigeria|south\s+africa)\b/i,
    codes: ["en", "eng", "english"],
  },
  { pattern: /\b(?:spain|mexico|colombia|argentina|chile|peru)\b/i, codes: ["es", "spa", "spanish", "español"] },
  { pattern: /\b(?:france|belgium)\b/i, codes: ["fr", "fra", "fre", "french", "français"] },
  { pattern: /\b(?:germany|austria)\b/i, codes: ["de", "deu", "ger", "german", "deutsch"] },
  { pattern: /\b(?:italy)\b/i, codes: ["it", "ita", "italian", "italiano"] },
  { pattern: /\b(?:turkey|türkiye)\b/i, codes: ["tr", "tur", "turkish", "türkçe"] },
  { pattern: /\b(?:indonesia)\b/i, codes: ["id", "ind", "indonesian"] },
  { pattern: /\b(?:philippines)\b/i, codes: ["tl", "fil", "tagalog", "filipino", "en", "eng", "english"] },
  { pattern: /\b(?:india)\b/i, codes: ["hi", "hin", "hindi", "ta", "tam", "tamil", "te", "tel", "telugu", "ml", "kn", "bn", "en"] },
];

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  ko: "Korean",
  kor: "Korean",
  ja: "Japanese",
  jpn: "Japanese",
  zh: "Chinese",
  zho: "Chinese",
  chi: "Chinese",
  cmn: "Mandarin",
  yue: "Cantonese",
  en: "English",
  eng: "English",
  th: "Thai",
  tha: "Thai",
  es: "Spanish",
  spa: "Spanish",
  fr: "French",
  fra: "French",
  fre: "French",
  de: "German",
  deu: "German",
  ger: "German",
  it: "Italian",
  ita: "Italian",
  pt: "Portuguese",
  por: "Portuguese",
  tr: "Turkish",
  tur: "Turkish",
  ru: "Russian",
  rus: "Russian",
  ar: "Arabic",
  ara: "Arabic",
  id: "Indonesian",
  ind: "Indonesian",
  tl: "Tagalog",
  fil: "Filipino",
  vi: "Vietnamese",
  vie: "Vietnamese",
  hi: "Hindi",
  hin: "Hindi",
  ta: "Tamil",
  tam: "Tamil",
  te: "Telugu",
  tel: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  bn: "Bengali",
  ur: "Urdu",
  urd: "Urdu",
  und: "Original Audio",
};

/**
 * Strips `[Hindi]`, `(Hindi Dubbed)`, `- Hindi`, `[Dual Audio]`, etc. to recover
 * the clean canonical title.
 */
export function cleanBaseTitle(rawTitle: string | null | undefined): string {
  if (!rawTitle) return "";
  return rawTitle
    .replace(BRACKETED_DUB_RE, " ")
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
  return QUERY_DUB_REQUEST_RE.test(query.trim());
}

export function inferOriginalLanguageCodes(country: string | null | undefined): readonly string[] {
  if (!country) return [];
  for (const entry of COUNTRY_LANGUAGE_MAP) {
    if (entry.pattern.test(country)) return entry.codes;
  }
  return [];
}

export function isIndianOrigin(country: string | null | undefined): boolean {
  return Boolean(country && /\bindia\b/i.test(country));
}

/**
 * Detects whether metadata (title, slug, badge, language label/code) marks an
 * item or stream as a Hindi dub.
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

  // Title has explicit `[Hindi]`, `(Hindi)`, `- Hindi`, `In Hindi`, `Hindi Dubbed`, `Dual Audio Hindi`
  if (title) {
    if (/[\[(\{][^\])}]*\b(?:hindi|hin)\b[^\])}]*[\])\}]/i.test(title)) return true;
    if (/\bhindi\s+(?:dub|dubbed|audio|version|voice)\b/i.test(title)) return true;
    if (/(?:[-–—:|]\s*|\bin\s+)hindi(?:\s+(?:dub|dubbed|movie|series))?\s*$/i.test(title)) return true;
    if (DUAL_HINDI_RE.test(title)) return true;
  }

  if (slug) {
    if (/-(?:in-hindi|hindi-dub|hindi-dubbed)(?:-|$)/i.test(slug)) return true;
    const slugMatch = /-(hindi)(?:-[a-z0-9]{5,16})?$/i.exec(slug);
    if (slugMatch) {
      // Only treat `-hindi-<id>` as a dub if "hindi" isn't genuinely part of the clean title (e.g. "Hindi Medium")
      const base = cleanBaseTitle(title).toLowerCase();
      if (!base || !base.includes("hindi")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detects whether metadata marks an item or stream as ANY non-original dub
 * (Hindi, Tamil, Telugu, Urdu, Tagalog, Arabic, Russian, French dub, etc.).
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

  if (badge) {
    if (BRACKETED_DUB_RE.test(`[${badge}]`) || /\bdub(?:bed)?\b/i.test(badge)) {
      BRACKETED_DUB_RE.lastIndex = 0;
      return true;
    }
    BRACKETED_DUB_RE.lastIndex = 0;
  }

  if (title) {
    BRACKETED_DUB_RE.lastIndex = 0;
    if (BRACKETED_DUB_RE.test(title)) {
      BRACKETED_DUB_RE.lastIndex = 0;
      return true;
    }
    BRACKETED_DUB_RE.lastIndex = 0;
    if (EXPLICIT_PHRASE_DUB_RE.test(title) || SUFFIX_DUB_RE.test(title)) return true;
  }

  if (slug) {
    if (SLUG_EXPLICIT_DUB_RE.test(slug)) return true;
    const m = SLUG_DUB_TOKEN_RE.exec(slug);
    if (m && m[1]) {
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
 * Filters out Hindi & regional dub clones from catalogue lists (`/home`, `/search`,
 * `categories`) unless the user's query explicitly asked for a dub, while
 * deduplicating clean original titles.
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
      !isDubbedMetadata({
        title: item.name,
        slug: item.slug,
        badge: item.badge ?? null,
      }),
  );

  // Safety net: if a narrow niche search returned ONLY a dubbed item, keep non-Hindi items first;
  // for Hindi dubs, strip them whenever at least one clean original exists or in browse feeds.
  const pool = nonDubbed;
  const seenKeys = new Set<string>();
  const out: T[] = [];

  for (const item of pool) {
    const titleKey = normalizeTitleKey(item.name);
    const dedupeKey = titleKey ? `${item.mediaType}:${titleKey}:${item.year ?? ""}` : item.subjectId;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    out.push(item);
  }

  return out;
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

function matchesLanguageTokens(
  codes: readonly string[],
  lanCode: string | null | undefined,
  lanName: string | null | undefined,
): boolean {
  if (codes.length === 0) return false;
  const codeNorm = (lanCode ?? "").trim().toLowerCase();
  const baseCode = codeNorm.split(/[-_]/)[0] ?? "";
  const nameNorm = (lanName ?? "").trim().toLowerCase();

  return codes.some((tok) => {
    const t = tok.toLowerCase();
    return (
      codeNorm === t ||
      baseCode === t ||
      (nameNorm.length > 0 && (nameNorm === t || nameNorm.includes(t)))
    );
  });
}

/**
 * Given the current `/detail` subject and its `dubs` sibling list, returns the
 * canonical **Original Audio** sibling whenever the current subject is a Hindi
 * or regional dub. Returns `null` if the current subject is already Original.
 */
export function pickOriginalDubSibling(opts: {
  currentSubjectId: string;
  currentTitle: string;
  currentSlug: string;
  country: string | null;
  dubs: readonly DubSibling[];
}): DubSibling | null {
  const { currentSubjectId, currentTitle, currentSlug, country, dubs } = opts;
  if (dubs.length === 0) return null;

  const expectedCodes = inferOriginalLanguageCodes(country);
  const selfEntry = dubs.find((d) => d.subjectId === currentSubjectId) ?? null;

  // If self is explicitly flagged Original (and title/slug isn't tagged Hindi dub), keep current!
  if (
    selfEntry?.isOriginalFlag &&
    !isDubbedMetadata({
      title: currentTitle,
      slug: currentSlug,
      lanCode: selfEntry.lanCode,
      lanName: selfEntry.lanName,
      country,
    })
  ) {
    return null;
  }

  const selfLooksDubbed =
    isDubbedMetadata({
      title: currentTitle,
      slug: currentSlug,
      lanCode: selfEntry?.lanCode ?? null,
      lanName: selfEntry?.lanName ?? null,
      country,
    }) ||
    Boolean(
      selfEntry &&
        !selfEntry.isOriginalFlag &&
        dubs.some((d) => d.subjectId !== currentSubjectId && d.isOriginalFlag),
    ) ||
    Boolean(
      selfEntry &&
        expectedCodes.length > 0 &&
        !matchesLanguageTokens(expectedCodes, selfEntry.lanCode, selfEntry.lanName) &&
        dubs.some((d) => matchesLanguageTokens(expectedCodes, d.lanCode, d.lanName)),
    );

  if (!selfLooksDubbed) return null;

  const others = dubs.filter((d) => d.subjectId !== currentSubjectId);
  if (others.length === 0) return null;

  // 1. Explicit Original Audio sibling (`type === 0` or `lanName` includes "Original")
  const explicitOriginal = others.find(
    (d) =>
      d.isOriginalFlag &&
      !isHindiDubMetadata({
        slug: d.detailPath,
        lanCode: d.lanCode,
        lanName: d.lanName,
        country,
      }),
  );
  if (explicitOriginal) return explicitOriginal;

  // 2. Sibling matching the movie/drama's origin country language (ko, ja, zh, en, etc.)
  if (expectedCodes.length > 0) {
    const nativeMatch = others.find((d) => matchesLanguageTokens(expectedCodes, d.lanCode, d.lanName));
    if (nativeMatch) return nativeMatch;
  }

  // 3. Any clean non-Hindi, non-dubbed sibling (preferring ko/ja/zh/en)
  const cleanOthers = others.filter(
    (d) =>
      !isDubbedMetadata({
        slug: d.detailPath,
        lanCode: d.lanCode,
        lanName: d.lanName,
        country,
      }),
  );
  const preferredGlobal = cleanOthers.find((d) =>
    matchesLanguageTokens(["ko", "ja", "zh", "en"], d.lanCode, d.lanName),
  );
  return preferredGlobal ?? cleanOthers[0] ?? null;
}

function isTrackHindiOrDub(track: MinimalAudioTrack, country?: string | null): boolean {
  const code = (track.language ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  const label = (track.label ?? "").trim();
  if (/\boriginal\b/i.test(label) && !HINDI_TOKEN_RE.test(label)) return false;

  if (!isIndianOrigin(country)) {
    if (DUB_LANG_CODES.has(code)) return true;
    if (HINDI_TOKEN_RE.test(label)) return true;
  }
  if (/\bdub(?:bed)?\b/i.test(label)) return true;
  return false;
}

/**
 * Chooses the Original Audio track from ExoPlayer's `availableAudioTracks`
 * so dual-audio MP4/HLS containers never play Track 0 Hindi by accident.
 */
export function pickOriginalAudioTrack<T extends MinimalAudioTrack>(
  tracks: readonly T[],
  country?: string | null,
): T | null {
  if (tracks.length === 0) return null;
  if (tracks.length === 1) return tracks[0] ?? null;

  const expectedCodes = inferOriginalLanguageCodes(country);

  // 1. Track explicitly marked "Original" (and not Hindi)
  const explicitOriginal = tracks.find(
    (t) => Boolean(t.label && /\boriginal\b/i.test(t.label)) && !isTrackHindiOrDub(t, country),
  );
  if (explicitOriginal) return explicitOriginal;

  // 2. Track matching the title's country of origin (Korean for KR, Japanese for JP, English for US/UK, etc.)
  if (expectedCodes.length > 0) {
    const countryMatch = tracks.find(
      (t) => matchesLanguageTokens(expectedCodes, t.language, t.label) && !isTrackHindiOrDub(t, country),
    );
    if (countryMatch) return countryMatch;
  }

  // 3. Filter out Hindi & dubbed tracks, preferring ko / ja / zh / en / und
  const nonDubTracks = tracks.filter((t) => !isTrackHindiOrDub(t, country));
  if (nonDubTracks.length > 0) {
    const primaryMatch = nonDubTracks.find((t) =>
      matchesLanguageTokens(
        ["ko", "kor", "korean", "ja", "jpn", "japanese", "zh", "zho", "chi", "chinese", "en", "eng", "english"],
        t.language,
        t.label,
      ),
    );
    return primaryMatch ?? nonDubTracks[0] ?? null;
  }

  return tracks[0] ?? null;
}

/** Formats raw ExoPlayer audio track metadata into a clear cinema label. */
export function formatAudioTrackLabel(
  track: MinimalAudioTrack,
  index: number,
  country?: string | null,
): string {
  const rawLabel = (track.label ?? "").trim();
  const rawCode = (track.language ?? "").trim().toLowerCase();
  const baseCode = rawCode.split(/[-_]/)[0] ?? "";
  const friendlyLang = LANGUAGE_DISPLAY_NAMES[rawCode] ?? LANGUAGE_DISPLAY_NAMES[baseCode] ?? null;

  const expectedCodes = inferOriginalLanguageCodes(country);
  const isNativeOriginal =
    Boolean(rawLabel && /\boriginal\b/i.test(rawLabel)) ||
    (expectedCodes.length > 0 && matchesLanguageTokens(expectedCodes, rawCode, rawLabel));

  let base =
    rawLabel && !/^track\s*\d+$/i.test(rawLabel) && rawLabel.toLowerCase() !== rawCode
      ? friendlyLang && !rawLabel.toLowerCase().includes(friendlyLang.toLowerCase())
        ? `${friendlyLang} · ${rawLabel}`
        : rawLabel
      : friendlyLang ?? (rawCode ? rawCode.toUpperCase() : `Audio Track ${index + 1}`);

  if (isNativeOriginal && !/\boriginal\b/i.test(base)) {
    base = `${base} (Original)`;
  } else if (isTrackHindiOrDub(track, country) && !/\bdub\b/i.test(base)) {
    base = `${base} (Dub)`;
  }

  return base;
}
