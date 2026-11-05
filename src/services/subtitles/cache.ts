import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CaptionTrack } from "@/types/provider";
import type { Cue } from "./srt";

/**
 * Bounded LRU subtitle cue cache so subtitles survive offline playback without
 * allowing unbounded AsyncStorage bloat on low-storage phones or TV sticks.
 */

const PREFIX = "hallyu.cues.v1.";
const INDEX_KEY = "hallyu.cues.index.v1";
export const MAX_CACHED_SUBTITLE_TRACKS = 30;

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
    await AsyncStorage.setItem(key, JSON.stringify(cues));
    const rawIndex = await AsyncStorage.getItem(INDEX_KEY);
    const parsedIndex: string[] = rawIndex ? JSON.parse(rawIndex) : [];
    const list = Array.isArray(parsedIndex) ? parsedIndex.filter((k) => typeof k === "string" && k !== key) : [];
    const updated = [key, ...list];
    const evicted = updated.slice(MAX_CACHED_SUBTITLE_TRACKS);
    const kept = updated.slice(0, MAX_CACHED_SUBTITLE_TRACKS);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(kept));
    if (evicted.length > 0) {
      await AsyncStorage.multiRemove(evicted);
    }
  } catch {
    // A full disk should never break playback.
  }
}

export async function loadCues(key: string): Promise<Cue[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const cues = parsed.filter(isCue);
    return cues.length > 0 ? cues : null;
  } catch {
    return null;
  }
}

export async function clearCachedSubtitles(): Promise<void> {
  try {
    const rawIndex = await AsyncStorage.getItem(INDEX_KEY);
    const parsedIndex: string[] = rawIndex ? JSON.parse(rawIndex) : [];
    if (Array.isArray(parsedIndex) && parsedIndex.length > 0) {
      await AsyncStorage.multiRemove(parsedIndex);
    }
    await AsyncStorage.removeItem(INDEX_KEY);
  } catch {}
}

const LANGUAGE_PREFERENCES = ["english", "en", "eng"];

/** Pick the track a viewer most likely wants: preferred language first, otherwise the first track. */
export function pickPreferredTrack(tracks: CaptionTrack[], preferred: string[] = LANGUAGE_PREFERENCES): CaptionTrack | null {
  if (tracks.length === 0) return null;
  if (preferred.length === 0) return null;
  const wanted = preferred.map((p) => p.toLowerCase());
  const match = tracks.find((track) => {
    const name = `${track.languageName ?? ""} ${track.language ?? ""}`.toLowerCase();
    return wanted.some((word) => name.includes(word));
  });
  return match ?? tracks[0] ?? null;
}
