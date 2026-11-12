import { describe, expect, test } from "bun:test";
import {
  pickAdaptiveSource,
  qualityNumber,
  recentStalls,
  shouldDownshift,
} from "../src/services/player/playbackPolicy";
import type { NormalizedSource } from "../src/services/provider/streams";

function source(resolution: string): NormalizedSource {
  return {
    url: `https://cdn.example/${resolution}.mp4`,
    resolution,
    qualityValue: qualityNumber(resolution),
    format: "MP4",
    codec: null,
    sizeBytes: null,
    durationSeconds: 6000,
    sourceLabel: null,
    preview: false,
    verifiedFullLength: true,
  };
}

const ladder = [source("1080p"), source("720p"), source("480p"), source("360p")];

describe("quality labels", () => {
  test("reads a resolution from common labels", () => {
    expect(qualityNumber("1080p")).toBe(1080);
    expect(qualityNumber("720")).toBe(720);
    expect(qualityNumber("Auto")).toBeNull();
    expect(qualityNumber(null)).toBeNull();
  });
});

describe("stall evidence", () => {
  test("counts only stalls inside the window", () => {
    const now = 1_000_000;
    expect(recentStalls([now - 1_000, now - 500_000], now)).toBe(1);
    expect(shouldDownshift([now - 1_000], now)).toBe(false);
    expect(shouldDownshift([now - 1_000, now - 20_000], now)).toBe(true);
    expect(shouldDownshift([now - 100_000, now - 200_000], now)).toBe(false);
  });
});

describe("adaptive ladder", () => {
  test("steps down one rung from the current quality", () => {
    expect(pickAdaptiveSource(ladder, "1080p", 1)?.resolution).toBe("720p");
    expect(pickAdaptiveSource(ladder, "720p", 1)?.resolution).toBe("480p");
  });

  test("never drops below 360p while a higher rung exists", () => {
    expect(pickAdaptiveSource(ladder, "720p", 3)?.resolution).toBe("360p");
    expect(pickAdaptiveSource(ladder, "480p", 2)?.resolution).toBe("360p");
  });

  test("falls back to the top of the ladder without a current resolution", () => {
    expect(pickAdaptiveSource(ladder, null, 1)?.resolution).toBe("720p");
    expect(pickAdaptiveSource([], "1080p", 1)).toBeNull();
    expect(pickAdaptiveSource([source("unknown")], "1080p", 1)).toBeNull();
  });
});
