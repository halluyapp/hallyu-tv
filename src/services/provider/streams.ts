/**
 * Shared provider stream normalization + source selection. Pure TypeScript —
 * no React Native, no Expo, no file I/O — so the app, the verification script
 * and the unit tests all run the exact same rules (verified against live
 * Zarhosting/Moviebox responses on 2026-11-03).
 *
 * Live verified top-level shape:
 *   { subject_id, se, ep, has_resource, sources: [...], hls: [], dash: [],
 *     free_episodes, limited, note }
 * and `sources` entries:
 *   { resolution: "360p", format: "MP4", url: "https://…?sign=…&t=…",
 *     size: "337609228" (BYTES as a string), duration: 7256 (seconds), codec: "h264" }
 *
 * Signed URLs are never logged and never committed; fixtures strip tokens.
 */

export const FULL_LENGTH_MIN_DURATION_S = 300;
export const FULL_LENGTH_MIN_BYTES = 50 * 1024 * 1024;

export interface NormalizedSource {
  /** Validated HTTPS media URL. The only mandatory field. */
  url: string;
  /** Quality label as the provider reports it, e.g. "360p". */
  resolution: string | null;
  /** Numeric quality ("360p" → 360). null when unparseable. */
  qualityValue: number | null;
  /** Container/format label; defaults to "MP4" when the provider omits it. */
  format: string;
  codec: string | null;
  /** Canonical file size in BYTES (the provider reports bytes-as-strings). */
  sizeBytes: number | null;
  /** Duration in seconds. */
  durationSeconds: number | null;
  /** Provider source label (e.g. "Mobile Native" preview uploads). */
  sourceLabel: string | null;
  /** Labelled preview clips are never selectable. */
  preview: boolean;
  /**
   * Full-length verdict from real metadata: true when duration > 300 s OR
   * size > 50 MB; false only when BOTH checks fail; null when metadata is
   * absent (unverified — never silently discarded on a guess).
   */
  verifiedFullLength: boolean | null;
}

export interface NormalizedStreams {
  subjectId: string | null;
  se: number;
  ep: number;
  /** All usable HTTPS sources, best-first (MP4, then quality desc). */
  sources: NormalizedSource[];
  hasResource: boolean;
  note: string | null;
  hls: string[];
  dash: string[];
}

type Raw = Record<string, unknown>;

function asObject(v: unknown): Raw {
  return v !== null && typeof v === "object" ? (v as Raw) : {};
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Canonical byte size. Live responses report BYTES (as numbers or numeric
 * strings). Small values (< 50 000) are treated as megabytes, matching the
 * reference app's heuristic for its edge-normalized variants.
 */
export function normalizeSizeBytes(v: unknown): number | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  return n > 50_000 ? Math.round(n) : Math.round(n * 1024 * 1024);
}

export function normalizeDurationSeconds(v: unknown): number | null {
  const n = num(v);
  if (n === null || n < 0) return null;
  return Math.round(n);
}

export function qualityValue(label: string | null): number | null {
  if (!label) return null;
  const m = /^(\d{3,4})\s*p?$/i.exec(label.trim());
  return m ? Number(m[1]) : null;
}

const PREVIEW_LABELS = ["mobile native", "preview", "trailer", "sample", "clip"];

function looksLikePreview(label: string | null): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return PREVIEW_LABELS.some((p) => l.includes(p));
}

/**
 * Full-length rule (reference: lib/watchModel.ts in the Hallyu social app).
 * A source is a preview when its label says so, or when it is BOTH short
 * (≤ 300 s) and small (≤ 50 MB). Unknown metadata returns null (unverified).
 */
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

/** Valid progressive-MP4 candidates, best-first: MP4 before other formats, then quality descending. */
export function compareSources(a: NormalizedSource, b: NormalizedSource): number {
  const fa = a.format.toUpperCase() === "MP4" ? 0 : 1;
  const fb = b.format.toUpperCase() === "MP4" ? 0 : 1;
  if (fa !== fb) return fa - fb;
  return (b.qualityValue ?? 0) - (a.qualityValue ?? 0);
}

/**
 * One normalization for every response shape the provider has returned:
 * top-level, or nested under `data` (`raw.data`). Accepts `sources` or
 * `streams` arrays. Only valid HTTPS URLs survive; malformed optional
 * metadata never crashes and never rejects an otherwise-valid source.
 * Explicit `has_resource: false` yields an empty source list.
 */
export function normalizeStreamResponse(raw: unknown): NormalizedStreams {
  const top = asObject(raw);
  // Some deployments nest the payload one level down under `data`.
  const body = Array.isArray(top.sources) || Array.isArray(top.streams) || "has_resource" in top ? top : asObject(top.data);

  const hasResource = body.has_resource !== false;
  const rawList = Array.isArray(body.sources)
    ? body.sources
    : Array.isArray(body.streams)
      ? body.streams
      : [];

  const sources: NormalizedSource[] = [];
  for (const entry of rawList) {
    const s = asObject(entry);
    const url = str(s.url) ?? str(s.playback_url) ?? str(s.file) ?? null;
    // Only HTTPS media URLs are playable/downloadable; everything else is dropped.
    if (!url || !url.startsWith("https://")) continue;

    const resolution = str(s.resolution) ?? str(s.quality) ?? str(s.label);
    const sizeBytes = normalizeSizeBytes(s.size ?? s.size_bytes ?? s.size_mb);
    const durationSeconds = normalizeDurationSeconds(s.duration ?? s.duration_sec);
    const format = str(s.format) ?? (/\.(mp4)(\?|$)/i.test(url) ? "MP4" : null) ?? "MP4";
    sources.push({
      url,
      resolution,
      qualityValue: num(s.quality_value) ?? qualityValue(resolution),
      format,
      codec: str(s.codec),
      sizeBytes,
      durationSeconds,
      sourceLabel: str(s.source),
      preview: looksLikePreview(str(s.source)),
      verifiedFullLength: classifyFullLength({
        sourceLabel: str(s.source),
        durationSeconds,
        sizeBytes,
      }),
    });
  }
  sources.sort(compareSources);

  const hls = Array.isArray(body.hls) ? body.hls.filter((u): u is string => typeof u === "string" && u.startsWith("https://")) : [];
  const dash = Array.isArray(body.dash) ? body.dash.filter((u): u is string => typeof u === "string" && u.startsWith("https://")) : [];

  return {
    subjectId: str(body.subject_id) ?? str(body.subjectId),
    se: num(body.se) ?? num(body.season) ?? 0,
    ep: num(body.ep) ?? num(body.episode) ?? 0,
    sources,
    hasResource,
    note: str(body.note),
    hls,
    dash,
  };
}

/** Verified full-length MP4 sources, best-first. Unverified sources are appended after them. */
export function selectableSources(sources: NormalizedSource[]): NormalizedSource[] {
  const full = sources.filter((s) => !s.preview && s.verifiedFullLength === true);
  const unverified = sources.filter((s) => !s.preview && s.verifiedFullLength === null);
  return [...full, ...unverified];
}

/** Distinct quality labels among selectable sources, best-first. */
export function qualityOptions(sources: NormalizedSource[]): string[] {
  return [...new Set(selectableSources(sources).map((s) => s.resolution).filter((q): q is string => q !== null))];
}

/**
 * The source to play or download. Order of preference:
 *  1. an explicitly requested quality among selectable sources,
 *  2. a verified full-length 360p source (mandatory data-conscious default),
 *  3. the lowest verified full-length quality,
 *  4. if every source is unverified, 360p by label, else the last (lowest) candidate —
 *     real evidence (URL/label) rather than a silent discard.
 */
export function selectSource(sources: NormalizedSource[], requested?: string | null): NormalizedSource | null {
  const selectable = selectableSources(sources);
  if (selectable.length === 0) return null;

  if (requested) {
    const match = selectable.find((s) => s.resolution === requested);
    if (match) return match;
  }
  const verified = selectable.filter((s) => s.verifiedFullLength === true);
  const pool = verified.length > 0 ? verified : selectable;

  const p360 = pool.find((s) => s.resolution === "360p");
  if (p360) return p360;
  // compareSources sorts best-first, so the LAST entry of the pool is the lowest quality.
  return pool[pool.length - 1] ?? null;
}

/**
 * Bounded-recovery picker: the same quality on a DIFFERENT (fresh) URL first,
 * then the default-quality rule (360p, else lowest verified full-length) among
 * the untried sources. null when every selectable URL was tried.
 */
export function pickRecoverySource(
  sources: NormalizedSource[],
  triedUrls: ReadonlySet<string>,
  currentResolution: string | null,
): NormalizedSource | null {
  const candidates = selectableSources(sources).filter((s) => !triedUrls.has(s.url));
  return candidates.find((s) => s.resolution === currentResolution) ?? selectSource(candidates, null);
}

/** The stream endpoint path for a resolve — movies MUST pass se=0&ep=0, series the real numbers. */
export function streamEndpoint(subjectId: string, detailPath: string, se: number, ep: number): string {
  return `/stream/${encodeURIComponent(subjectId)}?detail_path=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`;
}
