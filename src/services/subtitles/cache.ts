import { webStorage } from "@/services/storage/webStorage";
import type { CaptionTrack } from "@/types/provider";
import type { Cue } from "./srt";

/**
 * Subtitles are fetched automatically, so they should also survive the trip:
 * the parsed cue list is cached per episode and replayed when the network is
 * gone or the provider fails to serve the track again.
 */

const PREFIX = "hallyu.cues.v1.";

export function subtitleKey(subjectId: string, season?: number | null, episode?: number | null): string {
  const s = season ? `.s${season}` : "";
  const e = episode ? `.e${episode}` : "";
  return `${PREFIX}${subjectId}${s}${e}`;
}

function isCue(value: unknown): value is Cue {
  if (!value || typeof value !== "object") return false;
  const cue = value as Record<string, unknown>;
  return (
    typeof cue.startMs === "number" &&
    typeof cue.endMs === "number" &&
    typeof cue.text === "string" &&
    Number.isFinite(cue.startMs) &&
    Number.isFinite(cue.endMs)
  );
}

export async function saveCues(key: string, cues: Cue[]): Promise<void> {
  if (cues.length === 0) return;
  try {
    await webStorage.setItem(key, JSON.stringify(cues));
  } catch {
    // A full disk should never break playback.
  }
}

export async function loadCues(key: string): Promise<Cue[] | null> {
  try {
    const raw = await webStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const cues = parsed.filter(isCue);
    return cues.length > 0 ? cues : null;
  } catch {
    return null;
  }
}

const LANGUAGE_PREFERENCES = ["english", "en", "eng"];

/** Pick the track a viewer most likely wants: English first, otherwise the first track. */
export function pickPreferredTrack(tracks: CaptionTrack[], preferred: string[] = LANGUAGE_PREFERENCES): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const wanted = preferred.map((p) => p.toLowerCase());
  const match = tracks.find((track) => {
    const name = `${track.languageName ?? ""} ${track.language ?? ""}`.toLowerCase();
    return wanted.some((word) => name.includes(word));
  });
  return match ?? tracks[0] ?? null;
}
