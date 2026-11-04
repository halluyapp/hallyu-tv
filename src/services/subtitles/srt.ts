/**
 * Side-loaded subtitle parsing for the native player overlay. Supports SRT
 * and WebVTT text tracks; cues are sorted and looked up by binary search.
 */

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

function timeToMs(t: string): number | null {
  const m = t.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  const ms = Number((m[4] ?? "0").padEnd(3, "0"));
  if (min > 59 || s > 59) return null;
  return h * 3600_000 + min * 60_000 + s * 1000 + ms;
}

function cleanText(lines: string[]): string {
  return lines
    .join("\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseBlocks(content: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;
    const timingIndex = lines.findIndex((l) => l.includes("-->"));
    if (timingIndex < 0) continue;
    const timingLine = lines[timingIndex]!;
    const [startRaw, endRawWithSettings] = timingLine.split("-->");
    const endRaw = endRawWithSettings?.trim().split(/\s+/)[0];
    if (!startRaw || !endRaw) continue;
    const startMs = timeToMs(startRaw);
    const endMs = timeToMs(endRaw);
    if (startMs === null || endMs === null || endMs <= startMs) continue;
    const text = cleanText(lines.slice(timingIndex + 1));
    if (!text) continue;
    cues.push({ startMs, endMs, text });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}

export function parseSrt(content: string): Cue[] {
  return parseBlocks(content);
}

export function parseVtt(content: string): Cue[] {
  return parseBlocks(content.replace(/^WEBVTT[^\n]*\n/i, ""));
}

/** Auto-detect WebVTT vs SRT. */
export function parseSubtitles(content: string): Cue[] {
  return /^\uFEFF?WEBVTT/i.test(content.trimStart()) ? parseVtt(content) : parseSrt(content);
}

/**
 * Active cue at playback time. `offsetMs` is a subtitle delay: positive values
 * delay subtitles (show cues later), negative values advance them.
 */
export function cueAt(cues: Cue[], ms: number, offsetMs = 0): Cue | null {
  const t = ms - offsetMs;
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid]!;
    if (t < c.startMs) hi = mid - 1;
    else if (t > c.endMs) lo = mid + 1;
    else return c;
  }
  return null;
}

export function srtToVtt(srt: string): string {
  const fmt = (ms: number) => {
    const h = Math.floor(ms / 3600_000);
    const m = Math.floor((ms % 3600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    const r = ms % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
  };
  const cues = parseSrt(srt)
    .map((c) => `${fmt(c.startMs)} --> ${fmt(c.endMs)}\n${c.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${cues}`;
}
