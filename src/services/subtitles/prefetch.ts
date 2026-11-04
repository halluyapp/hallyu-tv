import { fetchCaptions, fetchCaptionText } from "@/services/provider/adapter";
import { parseSubtitles } from "./srt";
import { pickPreferredTrack, saveCues, subtitleKey } from "./cache";

/**
 * When a title is downloaded, its subtitles should come with it. Fetch the
 * provider's caption list, parse the preferred track and store the cues, so an
 * offline playback has captions on the first night without a network.
 */

const inFlight = new Set<string>();

export async function prefetchSubtitles(
  subjectId: string,
  detailPath: string,
  season?: number | null,
  episode?: number | null,
): Promise<void> {
  if (!detailPath) return;
  const key = subtitleKey(subjectId, season, episode);
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const tracks = await fetchCaptions(subjectId, detailPath, season ?? undefined, episode ?? undefined);
    const track = pickPreferredTrack(tracks);
    if (!track) return;
    const body = await fetchCaptionText(track.url);
    const cues = parseSubtitles(body);
    await saveCues(key, cues);
  } catch {
    // Offline or no captions: the player still fetches them on demand.
  } finally {
    inFlight.delete(key);
  }
}
