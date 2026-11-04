import { describe, expect, test } from "bun:test";
import { pickPreferredTrack, subtitleKey } from "../src/services/subtitles/cache";
import type { CaptionTrack } from "../src/types/provider";

function track(id: string, languageName: string, language = ""): CaptionTrack {
  return { id, languageName, language, url: `https://example.test/${id}.srt` };
}

describe("automatic subtitle selection", () => {
  test("prefers an English track when several are offered", () => {
    const picked = pickPreferredTrack([track("1", "Spanish", "es"), track("2", "English", "en")]);
    expect(picked?.id).toBe("2");
  });

  test("matches a bare language code", () => {
    expect(pickPreferredTrack([track("1", "Korean", "ko"), track("2", "English", "eng")])?.id).toBe("2");
  });

  test("falls back to the first track when English is missing", () => {
    expect(pickPreferredTrack([track("1", "Korean", "ko"), track("2", "Japanese", "ja")])?.id).toBe("1");
  });

  test("returns null for an empty list", () => {
    expect(pickPreferredTrack([])).toBeNull();
  });
});

describe("subtitle cache keys", () => {
  test("movies key on the subject alone", () => {
    expect(subtitleKey("123")).toBe("hallyu.cues.v1.123");
  });

  test("episodes key on subject, season and episode", () => {
    expect(subtitleKey("123", 2, 7)).toBe("hallyu.cues.v1.123.s2.e7");
  });
});
