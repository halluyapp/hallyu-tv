import { isDubbedMetadata, isHindiDubMetadata } from "./originalAudio";

/**
 * Shared Zarhosting stream normalization + Original-Audio-first selection.
 * Pure TypeScript so the app, verification script and unit tests run identical rules.
 *
 * Accepted response shapes:
 *   { subject_id, se, ep, has_resource, sources|streams: [...], hls, dash, note }
 * optionally nested under `data`. Source entries may report size as bytes
 * (`size`, `size_bytes`) or megabytes (`size_mb`), duration in seconds, and
 * optional audio/dub language metadata (`audio`, `lang`, `lan`, `lanName`, `dub`).
 */

export const FULL_LENGTH_MIN_DURATION_S = 300;
export const FULL_LENGTH_MIN_BYTES = 50 * 1024 * 1024;

export interface NormalizedSource {
  url: string;
  resolution: string | null;
  qualityValue: number | null;
  format: string;
  codec: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  sourceLabel: string | null;
  audioLanguage: string | null;
  isDubbed: boolean;
  isHindiDub: boolean;
  preview: boolean;
  verifiedFullLength: boolean | null;
}

export interface NormalizedStreams {
  subjectId: string | null;
  se: number;
  ep: number;
  sources: NormalizedSource[];
  hasResource: boolean;
  note: string | null;
  hls: string[];
  dash: string[];
}

type Raw = Record<string, unknown>;

function asObject(v: unknown): Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#]|$)/i.test(v.trim());
}

/**
 * Canonical byte size. `unit` disambiguates explicit provider fields:
 *  - "bytes": value is already bytes
 *  - "mb": value is megabytes
 *  - "auto": legacy heuristic for ambiguous `size` (small numbers are MB)
 */
export function normalizeSizeBytes(v: unknown, unit: "auto" | "bytes" | "mb" = "auto"): number | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  if (unit === "bytes") return Math.round(n);
  if (unit === "mb") return Math.round(n * 1024 * 1024);
  return n > 50_000 ? Math.round(n) : Math.round(n * 1024 * 1024);
}

export function normalizeDurationSeconds(v: unknown): number | null {
  const n = num(v);
  if (n === null || n < 0) return null;
  return Math.round(n);
}

export function qualityValue(label: string | null): number | null {
  if (!label) return null;
  const m = /(\d{3,4})\s*p?/i.exec(label.trim());
  return m ? Number(m[1]) : null;
}

const PREVIEW_LABELS = ["mobile native", "preview", "trailer", "sample", "clip"];

function looksLikePreview(...labels: (string | null)[]): boolean {
  return labels.some((label) => {
    if (!label) return false;
    const l = label.toLowerCase();
    return PREVIEW_LABELS.some((p) => l.includes(p));
  });
}

export function classifyFullLength(s: {
  sourceLabel: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
}): boolean | null {
  if (looksLikePreview(s.sourceLabel)) return false;
  const longEnough = s.durationSeconds !== null && s.durationSeconds > FULL_LENGTH_MIN_DURATION_S;
  const bigEnough = s.sizeBytes !== null && s.sizeBytes > FULL_LENGTH_MIN_BYTES;
  if (s.durationSeconds === null && s.sizeBytes === null) return null;
  return longEnough || bigEnough;
}

function detectFormat(rawFormat: string | null, url: string): string {
  if (rawFormat) return rawFormat.toUpperCase();
  if (/\.m3u8(?:[?#]|$)/i.test(url)) return "HLS";
  if (/\.mpd(?:[?#]|$)/i.test(url)) return "DASH";
  return "MP4";
}

function audioPenalty(s: NormalizedSource): number {
  if (s.isHindiDub) return 2;
  if (s.isDubbed) return 1;
  return 0;
}

/** Original audio first, then MP4 before other formats, then quality descending. */
export function compareSources(a: NormalizedSource, b: NormalizedSource): number {
  const ap = audioPenalty(a);
  const bp = audioPenalty(b);
  if (ap !== bp) return ap - bp;
  const fa = a.format.toUpperCase() === "MP4" ? 0 : 1;
  const fb = b.format.toUpperCase() === "MP4" ? 0 : 1;
  if (fa !== fb) return fa - fb;
  return (b.qualityValue ?? 0) - (a.qualityValue ?? 0);
}

function detectUrlHindiHint(url: string): boolean {
  try {
    const parsed = new URL(url);
    const combined = `${parsed.pathname}${parsed.search}`.toLowerCase();
    return /(?:^|[\/_\-.=&?])(?:hindi|hin[-_]dub|audio=hi|lang=hi|lan=hi)(?:$|[\/_\-.=&?])/i.test(combined);
  } catch {
    return false;
  }
}

function normalizeEntry(entry: unknown): NormalizedSource | null {
  const s = asObject(entry);
  const url = str(s.url) ?? str(s.playback_url) ?? str(s.file);
  if (!url || !isHttpsUrl(url)) return null;

  const rawResolution = str(s.resolution) ?? str(s.resolutions) ?? str(s.quality) ?? str(s.label);
  const sizeBytes =
    s.size_bytes !== undefined
      ? normalizeSizeBytes(s.size_bytes, "bytes")
      : s.size_mb !== undefined
        ? normalizeSizeBytes(s.size_mb, "mb")
        : normalizeSizeBytes(s.size, "auto");
  const durationSeconds = normalizeDurationSeconds(s.duration ?? s.duration_sec);
  const sourceLabel = str(s.source) ?? str(s.source_label);
  const audioCode =
    str(s.audio_lang) ??
    str(s.audioLang) ??
    str(s.lan) ??
    str(s.lanCode) ??
    str(s.lang) ??
    str(s.language);
  const audioName =
    str(s.audio) ??
    str(s.lanName) ??
    str(s.lan_name) ??
    str(s.dub) ??
    str(s.track_name) ??
    str(s.track) ??
    str(s.title) ??
    str(s.name);

  const combinedMeta = [sourceLabel, rawResolution, audioName].filter(Boolean).join(" ");
  const explicitlyOriginal =
    Boolean(combinedMeta && /\boriginal\b/i.test(combinedMeta)) ||
    Boolean(audioCode && /^orig/i.test(audioCode));

  const isHindiDub =
    !explicitlyOriginal &&
    (detectUrlHindiHint(url) ||
      isHindiDubMetadata({
        title: combinedMeta ? `[${combinedMeta}]` : null,
        badge: sourceLabel,
        lanCode: audioCode,
        lanName: audioName ?? rawResolution,
      }));

  const isDubbed =
    !explicitlyOriginal &&
    (isHindiDub ||
      s.is_dub === true ||
      s.isDub === true ||
      isDubbedMetadata({
        title: combinedMeta ? `[${combinedMeta}]` : null,
        badge: sourceLabel,
        lanCode: audioCode,
        lanName: audioName,
      }));

  // Normalize e.g. "1080p (Hindi)" -> "1080p" when resolution carries a quality number + language tag
  const qv = num(s.quality_value) ?? qualityValue(rawResolution);
  const resolution =
    rawResolution && qv !== null && /[a-z]{3,}/i.test(rawResolution.replace(/\d+\s*p/i, ""))
      ? `${qv}p`
      : rawResolution;

  const preview = looksLikePreview(sourceLabel, rawResolution);
  const format = detectFormat(str(s.format), url);

  return {
    url,
    resolution,
    qualityValue: qv,
    format,
    codec: str(s.codec) ?? str(s.codecName),
    sizeBytes,
    durationSeconds,
    sourceLabel,
    audioLanguage: audioName ?? audioCode ?? null,
    isDubbed,
    isHindiDub,
    preview,
    verifiedFullLength: classifyFullLength({ sourceLabel, durationSeconds, sizeBytes }),
  };
}

function manifestSource(url: string, format: "HLS" | "DASH"): NormalizedSource {
  const isHindi = detectUrlHindiHint(url);
  return {
    url,
    resolution: null,
    qualityValue: null,
    format,
    codec: null,
    sizeBytes: null,
    durationSeconds: null,
    sourceLabel: format,
    audioLanguage: null,
    isDubbed: isHindi,
    isHindiDub: isHindi,
    preview: false,
    verifiedFullLength: null,
  };
}

export function normalizeStreamResponse(raw: unknown): NormalizedStreams {
  const top = asObject(raw);
  const body =
    Array.isArray(top.sources) || Array.isArray(top.streams) || "has_resource" in top
      ? top
      : asObject(top.data);

  const hasResource = body.has_resource !== false;
  const note = str(body.note);
  const hls = Array.isArray(body.hls) ? [...new Set(body.hls.filter(isHttpsUrl))] : [];
  const dash = Array.isArray(body.dash) ? [...new Set(body.dash.filter(isHttpsUrl))] : [];

  if (!hasResource) {
    return {
      subjectId: str(body.subject_id) ?? str(body.subjectId),
      se: num(body.se) ?? num(body.season) ?? 0,
      ep: num(body.ep) ?? num(body.episode) ?? 0,
      sources: [],
      hasResource,
      note,
      hls,
      dash,
    };
  }

  const rawList = Array.isArray(body.sources)
    ? body.sources
    : Array.isArray(body.streams)
      ? body.streams
      : [];
  const sources: NormalizedSource[] = [];
  const seen = new Set<string>();
  for (const entry of rawList) {
    const normalized = normalizeEntry(entry);
    if (!normalized || seen.has(normalized.url)) continue;
    seen.add(normalized.url);
    sources.push(normalized);
  }
  for (const url of hls) {
    if (seen.has(url)) continue;
    seen.add(url);
    sources.push(manifestSource(url, "HLS"));
  }
  for (const url of dash) {
    if (seen.has(url)) continue;
    seen.add(url);
    sources.push(manifestSource(url, "DASH"));
  }
  sources.sort(compareSources);

  return {
    subjectId: str(body.subject_id) ?? str(body.subjectId),
    se: num(body.se) ?? num(body.season) ?? 0,
    ep: num(body.ep) ?? num(body.episode) ?? 0,
    sources,
    hasResource,
    note,
    hls,
    dash,
  };
}

/**
 * Full-length Original Audio candidates first, then unverified Original Audio;
 * Hindi / dubbed sources are completely excluded whenever ANY Original/undubbed
 * source exists! Previews are never offered.
 */
export function selectableSources(sources: NormalizedSource[]): NormalizedSource[] {
  const full = sources.filter((s) => !s.preview && s.verifiedFullLength === true);
  const unverified = sources.filter((s) => !s.preview && s.verifiedFullLength === null);
  const allValid = [...full, ...unverified];

  const originals = allValid.filter((s) => !s.isHindiDub && !s.isDubbed);
  if (originals.length > 0) return originals;

  const nonHindi = allValid.filter((s) => !s.isHindiDub);
  if (nonHindi.length > 0) return nonHindi;

  return allValid;
}

/** Progressive MP4 only — manifests cannot be saved as offline video files. */
export function isDownloadableSource(s: NormalizedSource): boolean {
  return s.format.toUpperCase() === "MP4" && !/\.(m3u8|mpd)(?:[?#]|$)/i.test(s.url);
}

export function downloadableSources(sources: NormalizedSource[]): NormalizedSource[] {
  return selectableSources(sources).filter(isDownloadableSource);
}

export function qualityOptions(sources: NormalizedSource[]): string[] {
  return [
    ...new Set(
      selectableSources(sources)
        .map((s) => s.resolution)
        .filter((q): q is string => q !== null),
    ),
  ];
}

function pickFrom(pool: NormalizedSource[], requested?: string | null): NormalizedSource | null {
  if (pool.length === 0) return null;
  if (requested) {
    const match = pool.find((s) => s.resolution === requested);
    if (match) return match;
  }
  const verified = pool.filter((s) => s.verifiedFullLength === true);
  const target = verified.length > 0 ? verified : pool;
  const p360 = target.find((s) => qualityValue(s.resolution) === 360);
  if (p360) return p360;
  // compareSources sorts best-first, so the last entry is the lowest quality.
  return target[target.length - 1] ?? null;
}

/** Data-conscious default: requested quality, else verified 360p, else lowest (always Original Audio first). */
export function selectSource(sources: NormalizedSource[], requested?: string | null): NormalizedSource | null {
  return pickFrom(selectableSources(sources), requested);
}

/**
 * Platform- & viewer-preference-aware Original Audio source picker:
 * - Explicit resolution ("1080p" | "720p" | "480p" | "360p"): picks exact match or closest <= rung.
 * - "auto" on TV (`isTv === true`): prefers highest verified full-length HD (1080p -> 720p -> 480p -> best).
 * - "auto" on Mobile (`isTv === false`): uses data-conscious verified 360p default.
 */
export function selectPreferredSource(
  sources: NormalizedSource[],
  preference: "auto" | "1080p" | "720p" | "480p" | "360p" = "auto",
  isTv = false,
): NormalizedSource | null {
  const pool = selectableSources(sources);
  if (pool.length === 0) return null;
  const verified = pool.filter((s) => s.verifiedFullLength === true);
  const target = verified.length > 0 ? verified : pool;

  if (preference !== "auto") {
    const exact = pool.find((s) => s.resolution === preference);
    if (exact) return exact;
    const wantedNum = qualityValue(preference) ?? 0;
    const sortedDesc = [...target].sort((a, b) => (b.qualityValue ?? 0) - (a.qualityValue ?? 0));
    const lowerOrEqual = sortedDesc.find(
      (s) => (s.qualityValue ?? 0) > 0 && (s.qualityValue ?? 0) <= wantedNum,
    );
    if (lowerOrEqual) return lowerOrEqual;
    return sortedDesc[sortedDesc.length - 1] ?? null;
  }

  if (isTv) {
    const sortedDesc = [...target].sort((a, b) => {
      const mp4A = a.format.toUpperCase() === "MP4" ? 0 : 1;
      const mp4B = b.format.toUpperCase() === "MP4" ? 0 : 1;
      if (mp4A !== mp4B) return mp4A - mp4B;
      return (b.qualityValue ?? 0) - (a.qualityValue ?? 0);
    });
    const hd = sortedDesc.find((s) => (s.qualityValue ?? 0) >= 720 && (s.qualityValue ?? 0) <= 1080);
    return hd ?? sortedDesc[0] ?? null;
  }

  return selectSource(sources, null);
}

/** Downloads require progressive MP4 (Original Audio prioritized). */
export function selectDownloadSource(sources: NormalizedSource[], requested?: string | null): NormalizedSource | null {
  const candidates = downloadableSources(sources);
  if (requested) return candidates.find((s) => s.resolution === requested) ?? null;
  return pickFrom(candidates, null);
}

/** Fresh-link recovery: same quality on an untried Original Audio URL first, then default rule. */
export function pickRecoverySource(
  sources: NormalizedSource[],
  triedUrls: ReadonlySet<string>,
  currentResolution: string | null,
): NormalizedSource | null {
  const candidates = selectableSources(sources).filter((s) => !triedUrls.has(s.url));
  if (currentResolution) {
    const sameQuality = candidates.find((s) => s.resolution === currentResolution);
    if (sameQuality) return sameQuality;
  }
  return selectSource(candidates, null);
}

/** Stream resolver path. Movies use se=0&ep=0; series pass real numbers. */
export function streamEndpoint(subjectId: string, detailPath: string, se: number, ep: number): string {
  return `/stream/${encodeURIComponent(subjectId)}?detail_path=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`;
}
