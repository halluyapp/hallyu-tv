/**
 * Minimal SRT parser for the subtitle overlay. Preserves timing; used because
 * side-loaded SRT tracks cannot be attached to a progressive MP4 natively —
 * they are rendered as a styled overlay synced to the player clock.
 */

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

function timeToMs(t: string): number {
  // "00:12:34,567"
  const m = t.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return 0;
  return Number(m[1]) * 3600_000 + Number(m[2]) * 60_000 + Number(m[3]) * 1000 + Number(m[4]);
}

export function parseSrt(content: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;
    const timingLine = lines.find((l) => l.includes("-->"));
    if (!timingLine) continue;
    const [startRaw, endRaw] = timingLine.split("-->");
    if (!startRaw || !endRaw) continue;
    const textLines = lines.filter((l) => l !== timingLine && !/^\d+$/.test(l.trim()));
    const text = textLines.join("\n").replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    cues.push({ startMs: timeToMs(startRaw), endMs: timeToMs(endRaw), text });
  }
  return cues;
}

export function cueAt(cues: Cue[], ms: number, offsetMs = 0): Cue | null {
  const t = ms + offsetMs;
  for (const c of cues) {
    if (t >= c.startMs && t <= c.endMs) return c;
  }
  return null;
}

/** Convert SRT cues to WebVTT (for native track support when the source supports it). */
export function srtToVtt(srt: string): string {
  const cues = parseSrt(srt)
    .map((c) => {
      const fmt = (ms: number) => {
        const h = Math.floor(ms / 3600_000);
        const m = Math.floor((ms % 3600_000) / 60_000);
        const s = Math.floor((ms % 60_000) / 1000);
        const r = ms % 1000;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
      };
      return `${fmt(c.startMs)} --> ${fmt(c.endMs)}\n${c.text}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${cues}`;
}
