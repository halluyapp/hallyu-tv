import { describe, expect, test } from "bun:test";
import { MEDIA_PROXY_BASE, proxyUri, transportChain } from "../src/services/provider/transport";
import type { StreamSource } from "../src/types/provider";

const source: StreamSource = {
  url: "https://cdn.example.net/signed/file.mp4",
  resolution: "480p",
  qualityValue: 480,
  format: "MP4",
  codec: null,
  sizeBytes: 1234,
  durationSeconds: 60,
  sourceLabel: null,
  preview: false,
  verifiedFullLength: true,
};

const ctx = { subjectId: "3773468085374568272", detailPath: "verity-eNHDBJtwKu4", season: 0, episode: 0 };

describe("media transport", () => {
  test("proxyUri keeps the proxy base and carries the re-resolve params", () => {
    const uri = proxyUri(source, ctx);
    expect(uri.startsWith(MEDIA_PROXY_BASE)).toBe(true);
    const qs = new URL(uri).searchParams;
    expect(qs.get("subject_id")).toBe(ctx.subjectId);
    expect(qs.get("detail_path")).toBe(ctx.detailPath);
    expect(qs.get("resolution")).toBe("480p");
    // The signed CDN URL must never be embedded in the proxy request.
    expect(uri).not.toContain("cdn.example.net");
  });

  test("transportChain is direct-with-headers first, proxy second", () => {
    const chain = transportChain(source, ctx);
    expect(chain.map((c) => c.label)).toEqual(["direct", "proxy"]);
    expect(chain[0]!.uri).toBe(source.url);
    expect(chain[0]!.headers && Object.keys(chain[0]!.headers).length).toBeGreaterThan(0);
    expect(chain[1]!.headers).toBeUndefined();
  });

  test("proxy URL wins no matter the source resolution", () => {
    const uri = proxyUri({ ...source, resolution: null }, ctx);
    expect(new URL(uri).searchParams.get("resolution")).toBe("");
  });
});
