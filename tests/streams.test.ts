import { describe, expect, test } from "bun:test";
import {
  classifyFullLength,
  downloadableSources,
  isDownloadableSource,
  normalizeSizeBytes,
  normalizeStreamResponse,
  pickRecoverySource,
  qualityOptions,
  selectableSources,
  selectDownloadSource,
  selectSource,
  streamEndpoint,
} from "../src/services/provider/streams";
import { classifyPlayerError, playerErrorMessage } from "../src/services/player/classify";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dir, "fixtures", name), "utf8"));
const MOVIE = fixture("stream-movie.json");
const EPISODE = fixture("stream-episode.json");

describe("normalizeStreamResponse", () => {
  test("parses the top-level movie shape (bytes-as-string sizes)", () => {
    const n = normalizeStreamResponse(MOVIE);
    expect(n.subjectId).toBe("3773468085374568272");
    expect(n.se).toBe(0);
    expect(n.ep).toBe(0);
    expect(n.hasResource).toBe(true);
    expect(n.sources).toHaveLength(3);
    expect(n.sources.map((s) => s.resolution)).toEqual(["1080p", "480p", "360p"]);
    const p360 = n.sources[2]!;
    expect(p360.sizeBytes).toBe(337_609_228);
    expect(p360.durationSeconds).toBe(7256);
    expect(p360.codec).toBe("h264");
  });

  test("labels Mobile Native previews and never selects them", () => {
    const n = normalizeStreamResponse(EPISODE);
    const preview = n.sources.find((s) => s.sourceLabel === "Mobile Native");
    expect(preview!.preview).toBe(true);
    expect(preview!.verifiedFullLength).toBe(false);
    expect(selectableSources(n.sources).some((s) => s.preview)).toBe(false);
  });

  test("accepts data-nested payloads and streams alias", () => {
    expect(normalizeStreamResponse({ code: 0, data: MOVIE }).sources).toHaveLength(3);
    expect(normalizeStreamResponse({ ...MOVIE, sources: undefined, streams: MOVIE.sources }).sources).toHaveLength(3);
  });

  test("explicit has_resource:false yields no sources even if arrays are present", () => {
    const n = normalizeStreamResponse({ ...MOVIE, has_resource: false });
    expect(n.hasResource).toBe(false);
    expect(n.sources).toHaveLength(0);
  });

  test("malformed optional fields never reject a valid HTTPS URL", () => {
    const n = normalizeStreamResponse({
      sources: [
        { url: "https://cdn.example.com/a.mp4" },
        { resolution: 480, format: null, url: "https://cdn.example.com/b.mp4", size: "12", duration: "x" },
        { url: "http://insecure.example.com/c.mp4" },
        { url: "https://" },
        { no_url: true },
        "garbage",
        null,
      ],
    });
    expect(n.sources).toHaveLength(2);
    const b = n.sources.find((s) => s.url.endsWith("/b.mp4"))!;
    expect(b.resolution).toBe("480");
    expect(b.sizeBytes).toBe(12 * 1024 * 1024);
  });

  test("explicit size_bytes and size_mb are not run through the ambiguous heuristic", () => {
    const n = normalizeStreamResponse({
      sources: [
        { url: "https://x.example/a.mp4", size_bytes: 1000 },
        { url: "https://x.example/b.mp4", size_mb: 1000 },
      ],
    });
    expect(n.sources.find((s) => s.url.endsWith("/a.mp4"))!.sizeBytes).toBe(1000);
    expect(n.sources.find((s) => s.url.endsWith("/b.mp4"))!.sizeBytes).toBe(1000 * 1024 * 1024);
  });

  test("deduplicates URLs and normalizes hls/dash manifests for playback only", () => {
    const n = normalizeStreamResponse({
      sources: [{ url: "https://x.example/a.mp4", resolution: "360p", duration: 2679 }],
      hls: ["https://x.example/a.m3u8", "https://x.example/a.m3u8"],
      dash: ["https://x.example/a.mpd"],
    });
    expect(n.sources).toHaveLength(3);
    expect(n.hls).toHaveLength(1);
    expect(downloadableSources(n.sources)).toHaveLength(1);
    expect(isDownloadableSource(n.sources.find((s) => s.format === "HLS")!)).toBe(false);
  });

  test("empty and malformed responses produce zero sources without throwing", () => {
    expect(normalizeStreamResponse(null).sources).toHaveLength(0);
    expect(normalizeStreamResponse("nope").sources).toHaveLength(0);
    expect(normalizeStreamResponse({}).sources).toHaveLength(0);
    expect(normalizeStreamResponse({ sources: "not-an-array" }).sources).toHaveLength(0);
  });

  test("numeric and numeric-string sizes/durations normalize", () => {
    expect(normalizeSizeBytes("337609228")).toBe(337_609_228);
    expect(normalizeSizeBytes(337609228)).toBe(337_609_228);
    expect(normalizeSizeBytes("322")).toBe(322 * 1024 * 1024);
    expect(normalizeSizeBytes("abc")).toBeNull();
    const n = normalizeStreamResponse({ sources: [{ url: "https://x.example/a.mp4", size: 1000, duration: "2679" }] });
    expect(n.sources[0]!.durationSeconds).toBe(2679);
  });
});

describe("full-length classification", () => {
  test("duration > 300s OR size > 50MB passes; both failing fails", () => {
    expect(classifyFullLength({ sourceLabel: null, durationSeconds: 7256, sizeBytes: 1_000_000 })).toBe(true);
    expect(classifyFullLength({ sourceLabel: null, durationSeconds: 61, sizeBytes: 60 * 1024 * 1024 })).toBe(true);
    expect(classifyFullLength({ sourceLabel: null, durationSeconds: 61, sizeBytes: 4 * 1024 * 1024 })).toBe(false);
  });

  test("unknown metadata is unverified, never silently discarded", () => {
    expect(classifyFullLength({ sourceLabel: null, durationSeconds: null, sizeBytes: null })).toBeNull();
  });

  test("labelled previews always fail", () => {
    expect(classifyFullLength({ sourceLabel: "Mobile Native", durationSeconds: 7256, sizeBytes: 1024 ** 3 })).toBe(false);
  });
});

describe("source selection", () => {
  test("default is verified full-length 360p, never the highest quality", () => {
    expect(selectSource(normalizeStreamResponse(EPISODE).sources, null)!.resolution).toBe("360p");
    expect(selectSource(normalizeStreamResponse(MOVIE).sources, null)!.resolution).toBe("360p");
  });

  test("falls back to the lowest verified full-length quality when 360p is absent", () => {
    const n = normalizeStreamResponse({ sources: [MOVIE.sources[2], { ...MOVIE.sources[1], resolution: "720p" }] });
    expect(selectSource(n.sources, null)!.resolution).toBe("720p");
  });

  test("an explicitly requested quality wins when selectable", () => {
    expect(selectSource(normalizeStreamResponse(MOVIE).sources, "1080p")!.resolution).toBe("1080p");
  });

  test("unverified sources remain selectable when nothing is verified", () => {
    const n = normalizeStreamResponse({
      sources: [{ url: "https://x.example/a.mp4" }, { url: "https://x.example/b.mp4", resolution: "360p" }],
    });
    expect(selectSource(n.sources, null)!.resolution).toBe("360p");
    expect(qualityOptions(n.sources)).toEqual(["360p"]);
  });

  test("all-preview or empty input selects nothing", () => {
    expect(selectSource([], null)).toBeNull();
    const n = normalizeStreamResponse({ sources: [{ source: "preview", url: "https://x.example/p.mp4", duration: 30, size: 1000 }] });
    expect(selectSource(n.sources, null)).toBeNull();
  });

  test("download selection rejects manifests and previews", () => {
    const n = normalizeStreamResponse({
      sources: [
        { url: "https://x.example/a.mp4", resolution: "360p", duration: 2679 },
        { url: "https://x.example/p.mp4", source: "preview", duration: 30 },
      ],
      hls: ["https://x.example/a.m3u8"],
    });
    expect(selectDownloadSource(n.sources, null)!.url).toBe("https://x.example/a.mp4");
    expect(selectDownloadSource(n.sources, "HLS")).toBeNull();
  });
});

describe("recovery picking", () => {
  const sources = normalizeStreamResponse(EPISODE).sources;

  test("retry prefers the same quality on a fresh URL", () => {
    const stale = sources.find((s) => s.resolution === "360p")!;
    const fresh360 = { ...stale, url: "https://bcdnxw.hakunaymatata.com/bt/fresh-signature.mp4" };
    expect(pickRecoverySource([...sources, fresh360], new Set([stale.url]), "360p")!.url).toBe(fresh360.url);
  });

  test("when the same quality cannot be refreshed, the default rule is used", () => {
    const stale = sources.find((s) => s.resolution === "360p")!;
    expect(pickRecoverySource(sources, new Set([stale.url]), "360p")!.resolution).toBe("480p");
  });

  test("null once every selectable URL has been tried", () => {
    const all = new Set(selectableSources(sources).map((s) => s.url));
    expect(pickRecoverySource(sources, all, "360p")).toBeNull();
  });
});

describe("stream endpoint params", () => {
  test("movies pass se=0&ep=0", () => {
    expect(streamEndpoint("377", "verity-eNHDBJtwKu4", 0, 0)).toBe("/stream/377?detail_path=verity-eNHDBJtwKu4&se=0&ep=0");
  });

  test("series pass the actual selected season and episode", () => {
    expect(streamEndpoint("478", "dead-end-job-oAmYsY887H5", 1, 3)).toBe("/stream/478?detail_path=dead-end-job-oAmYsY887H5&se=1&ep=3");
  });

  test("detail paths with unsafe characters are encoded", () => {
    expect(streamEndpoint("1", "a b/c", 0, 0)).toBe("/stream/1?detail_path=a%20b%2Fc&se=0&ep=0");
  });
});

describe("player error classification", () => {
  test("expired or rejected media URLs", () => {
    expect(classifyPlayerError("HTTP 403 Forbidden")).toBe("expired");
    expect(classifyPlayerError("stream link expired")).toBe("expired");
  });

  test("HTTP/CDN failures and rate limiting", () => {
    expect(classifyPlayerError("Server responded 429")).toBe("cdn");
    expect(classifyPlayerError("426 Forbidden")).toBe("cdn");
  });

  test("network interruption", () => {
    expect(classifyPlayerError("Unable to resolve host")).toBe("network");
    expect(classifyPlayerError("Network request failed")).toBe("network");
  });

  test("decoder and format failures stay distinct", () => {
    expect(classifyPlayerError("Video could not be decoded: CodecNotSupported")).toBe("decoder");
    expect(classifyPlayerError("Empty or invalid media response")).toBe("format");
  });

  test("buffering timeout and unknown", () => {
    expect(classifyPlayerError("Buffering stalled")).toBe("buffering_timeout");
    expect(classifyPlayerError("")).toBe("unknown");
    expect(classifyPlayerError(undefined)).toBe("unknown");
  });

  test("every kind maps to a non-empty, signed-URL-free message", () => {
    for (const kind of ["expired", "cdn", "network", "format", "decoder", "empty_response", "buffering_timeout", "unknown"] as const) {
      const msg = playerErrorMessage(kind);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg.includes("sign=")).toBe(false);
    }
  });
});
