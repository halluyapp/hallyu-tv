import { afterEach, describe, expect, mock, test } from "bun:test";
import { PROVIDER_API_HEADERS, PROVIDER_BASE_URL, PROVIDER_MEDIA_HEADERS, providerFetch } from "../src/services/provider/client";
import { resolveStreams } from "../src/services/provider/adapter";
import { ProviderError } from "../src/types/provider";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("provider HTTP contract", () => {
  test("API headers match the required Zarhosting resolver contract exactly", () => {
    expect(PROVIDER_API_HEADERS).toEqual({
      "User-Agent": "Mozilla/5.0",
      Referer: "https://moviebox.ph/",
      Accept: "application/json",
    });
  });

  test("media headers use the CDN media-verifier profile", () => {
    expect(PROVIDER_MEDIA_HEADERS["User-Agent"]).toBe("ExoPlayerLib/2.19.1");
    expect(PROVIDER_MEDIA_HEADERS.Referer).toBe("https://www.movieboxpro.app/");
    expect(PROVIDER_MEDIA_HEADERS.Origin).toBe("https://www.movieboxpro.app");
  });

  test("providerFetch sends the exact headers and base URL", async () => {
    const fetchMock = mock(async () => jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await providerFetch("/home", { retries: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PROVIDER_BASE_URL}/home`);
    expect(init.headers).toEqual(PROVIDER_API_HEADERS);
  });

  test("resolveStreams calls the required endpoint with detail_path/se/ep", async () => {
    const fetchMock = mock(async () =>
      jsonResponse({
        subject_id: "56988683026712168",
        se: 1,
        ep: 1,
        has_resource: true,
        sources: [{ url: "https://cdn.example.com/a.mp4", resolution: "360p", size: "337609228", duration: 2679 }],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const res = await resolveStreams("56988683026712168", "attack-on-titan-hindi-kGWQOIx0d4", 1, 1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `${PROVIDER_BASE_URL}/stream/56988683026712168?detail_path=attack-on-titan-hindi-kGWQOIx0d4&se=1&ep=1`,
    );
    expect(init.headers).toEqual(PROVIDER_API_HEADERS);
    expect(res.se).toBe(1);
    expect(res.ep).toBe(1);
    expect(res.sources).toHaveLength(1);
  });

  test("resolveStreams rejects missing detail_path before making a request", async () => {
    const fetchMock = mock(async () => jsonResponse({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(resolveStreams("1", "", 0, 0)).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("resolveStreams reports no_stream when only previews are returned", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse({ sources: [{ url: "https://cdn.example.com/p.mp4", source: "preview", duration: 30, size: 1000 }] }),
    ) as unknown as typeof fetch;
    await expect(resolveStreams("1", "slug", 0, 0)).rejects.toMatchObject({ kind: "no_stream" });
  });

  test("aborted signals do not retry", async () => {
    const fetchMock = mock(async () => jsonResponse({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();
    await expect(providerFetch("/home", { signal: controller.signal, retries: 2 })).rejects.toMatchObject({ kind: "network" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
