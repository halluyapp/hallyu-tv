import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  fetchAudioVersions,
  fetchDetail,
  fetchHome,
  resolveOriginalStreams,
  searchCatalogue,
} from "@/services/provider/adapter";
import {
  cleanBaseTitle,
  filterOriginalCatalogueItems,
  formatAudioTrackLabel,
  isDubbedMetadata,
  isHindiDubMetadata,
  parseDubSiblings,
  pickOriginalAudioTrack,
  pickOriginalDubSibling,
} from "@/services/provider/originalAudio";
import {
  normalizeStreamResponse,
  selectableSources,
  selectDownloadSource,
  selectPreferredSource,
  selectSource,
} from "@/services/provider/streams";

describe("Original Audio Enforcement (No Unwanted Hindi Dubs)", () => {
  test("detects Hindi and regional dub tags across titles, badges, and slugs without false positives", () => {
    expect(isHindiDubMetadata({ title: "Venom: The Last Dance [Hindi]" })).toBe(true);
    expect(isHindiDubMetadata({ title: "Deadpool & Wolverine (Hindi Dubbed)" })).toBe(true);
    expect(isHindiDubMetadata({ title: "Queen of Tears - Hindi" })).toBe(true);
    expect(isHindiDubMetadata({ title: "Exhuma", slug: "exhuma-hindi-eNHDBJtwKu4" })).toBe(true);
    expect(isHindiDubMetadata({ title: "Moving", badge: "Hindi" })).toBe(true);

    expect(isDubbedMetadata({ title: "Solo Leveling [Tamil]" })).toBe(true);
    expect(isDubbedMetadata({ title: "Moving (Tagalog)" })).toBe(true);
    expect(isDubbedMetadata({ title: "Squid Game", slug: "squid-game-telugu-oAmYsY887H5" })).toBe(true);

    // Genuine original titles must NEVER be flagged as dubs
    expect(isDubbedMetadata({ title: "The French Dispatch", slug: "the-french-dispatch-abc12345" })).toBe(false);
    expect(isDubbedMetadata({ title: "Russian Doll", slug: "russian-doll-abc12345" })).toBe(false);
    expect(isHindiDubMetadata({ title: "Hindi Medium", slug: "hindi-medium-abc12345", country: "India" })).toBe(false);
    expect(cleanBaseTitle("Deadpool & Wolverine [Hindi Dubbed]")).toBe("Deadpool & Wolverine");
  });

  test("filterOriginalCatalogueItems strips Hindi clones on browse/search unless user explicitly searches Hindi", () => {
    const raw = [
      {
        subjectId: "h1",
        name: "Venom: The Last Dance [Hindi]",
        slug: "venom-the-last-dance-hindi-11111111",
        badge: "Hindi",
        mediaType: "movie" as const,
        year: "2024",
      },
      {
        subjectId: "o1",
        name: "Venom: The Last Dance",
        slug: "venom-the-last-dance-22222222",
        badge: "HD",
        mediaType: "movie" as const,
        year: "2024",
      },
      {
        subjectId: "t1",
        name: "Venom: The Last Dance [Tamil]",
        slug: "venom-the-last-dance-tamil-33333333",
        badge: null,
        mediaType: "movie" as const,
        year: "2024",
      },
    ];

    const filtered = filterOriginalCatalogueItems(raw, { query: "venom" });
    expect(filtered.map((i) => i.subjectId)).toEqual(["o1"]);

    // Explicit "venom hindi" search honors the user's explicit request
    const explicit = filterOriginalCatalogueItems(raw, { query: "venom hindi" });
    expect(explicit.some((i) => i.subjectId === "h1")).toBe(true);
  });

  test("pickOriginalDubSibling switches Hindi dub detail subjects to Original Audio sibling", () => {
    const dubs = parseDubSiblings({
      dubs: [
        { subjectId: "9001", detailPath: "exhuma-hindi-abc123", lanCode: "hi", lanName: "Hindi", type: 1 },
        { subjectId: "9000", detailPath: "exhuma-orig-xyz789", lanCode: "ko", lanName: "Original", type: 0 },
      ],
    });

    const picked = pickOriginalDubSibling({
      currentSubjectId: "9001",
      currentTitle: "Exhuma [Hindi]",
      currentSlug: "exhuma-hindi-abc123",
      country: "South Korea",
      dubs,
    });
    expect(picked?.subjectId).toBe("9000");
    expect(picked?.detailPath).toBe("exhuma-orig-xyz789");

    // Already on Original -> returns null (no redirect)
    const alreadyOrig = pickOriginalDubSibling({
      currentSubjectId: "9000",
      currentTitle: "Exhuma",
      currentSlug: "exhuma-orig-xyz789",
      country: "South Korea",
      dubs,
    });
    expect(alreadyOrig).toBeNull();
  });

  test("fetchDetail & fetchHome & searchCatalogue automatically enforce Original Audio over Hindi", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/home")) {
        return new Response(
          JSON.stringify({
            sections: [
              {
                section: "Trending Movies",
                items: [
                  {
                    subjectId: "h-deadpool",
                    name: "Deadpool & Wolverine [Hindi]",
                    slug: "deadpool-and-wolverine-hindi-aaa111",
                    posterUrl: "https://pbcdnw.aoneroom.com/dp-hi.jpg",
                    type: "movie",
                  },
                  {
                    subjectId: "o-deadpool",
                    name: "Deadpool & Wolverine",
                    slug: "deadpool-and-wolverine-bbb222",
                    posterUrl: "https://pbcdnw.aoneroom.com/dp.jpg",
                    type: "movie",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/detail/deadpool-and-wolverine-hindi-aaa111")) {
        return new Response(
          JSON.stringify({
            subject: {
              subjectId: "h-deadpool",
              title: "Deadpool & Wolverine [Hindi]",
              detailPath: "deadpool-and-wolverine-hindi-aaa111",
              countryName: "United States",
              dubs: [
                { subjectId: "h-deadpool", detailPath: "deadpool-and-wolverine-hindi-aaa111", lanCode: "hi", lanName: "Hindi", type: 1 },
                { subjectId: "o-deadpool", detailPath: "deadpool-and-wolverine-bbb222", lanCode: "en", lanName: "Original", type: 0 },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/detail/deadpool-and-wolverine-bbb222")) {
        return new Response(
          JSON.stringify({
            subject: {
              subjectId: "o-deadpool",
              title: "Deadpool & Wolverine",
              detailPath: "deadpool-and-wolverine-bbb222",
              countryName: "United States",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/search")) {
        return new Response(
          JSON.stringify({
            items: [
              { subjectId: "h-deadpool", name: "Deadpool & Wolverine [Hindi]", slug: "deadpool-and-wolverine-hindi-aaa111", type: "movie" },
              { subjectId: "o-deadpool", name: "Deadpool & Wolverine", slug: "deadpool-and-wolverine-bbb222", type: "movie" },
            ],
            totalPages: 1,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const home = await fetchHome();
      expect(home[0]?.items.map((i) => i.subjectId)).toEqual(["o-deadpool"]);

      const search = await searchCatalogue("deadpool", 1);
      expect(search.items.map((i) => i.subjectId)).toEqual(["o-deadpool"]);

      // Opening the Hindi slug directly redirects seamlessly to the Original subject!
      const detail = await fetchDetail("deadpool-and-wolverine-hindi-aaa111");
      expect(detail.subjectId).toBe("o-deadpool");
      expect(detail.detailPath).toBe("deadpool-and-wolverine-bbb222");
      expect(detail.title).toBe("Deadpool & Wolverine");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("resolveOriginalStreams canonicalizes Hindi instant-play slugs to Original Audio before calling /stream", async () => {
    const origFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("/detail/attack-on-titan-hindi-kGWQOIx0d4")) {
        return new Response(
          JSON.stringify({
            subject: {
              subjectId: "56988683026712168",
              title: "Attack on Titan [Hindi]",
              detailPath: "attack-on-titan-hindi-kGWQOIx0d4",
              countryName: "Japan",
              dubs: [
                { subjectId: "56988683026712168", detailPath: "attack-on-titan-hindi-kGWQOIx0d4", lanCode: "hi", lanName: "Hindi", type: 1 },
                { subjectId: "99999911111122222", detailPath: "attack-on-titan-orig-jpn99999", lanCode: "ja", lanName: "Original", type: 0 },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/detail/attack-on-titan-orig-jpn99999")) {
        return new Response(
          JSON.stringify({
            subject: {
              subjectId: "99999911111122222",
              title: "Attack on Titan",
              detailPath: "attack-on-titan-orig-jpn99999",
              countryName: "Japan",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/stream/99999911111122222")) {
        return new Response(
          JSON.stringify({
            subject_id: "99999911111122222",
            se: 1,
            ep: 1,
            has_resource: true,
            sources: [
              { url: "https://cdn.example.com/aot-jp-1080p.mp4", resolution: "1080p", duration: 1440, size_mb: 420 },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const res = await resolveOriginalStreams("56988683026712168", "attack-on-titan-hindi-kGWQOIx0d4", 1, 1);
      expect(res.subjectId).toBe("99999911111122222");
      expect(res.sources[0]?.url).toBe("https://cdn.example.com/aot-jp-1080p.mp4");
      expect(requestedUrls.some((u) => u.includes("/stream/99999911111122222?detail_path=attack-on-titan-orig-jpn99999"))).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("streams.ts excludes Hindi-labelled streams whenever Original streams exist", () => {
    const normalized = normalizeStreamResponse({
      subject_id: "500",
      se: 0,
      ep: 0,
      has_resource: true,
      sources: [
        {
          url: "https://cdn.example.com/movie-1080-hindi.mp4",
          resolution: "1080p",
          lan: "hi",
          lanName: "Hindi",
          duration: 7200,
          size_mb: 1800,
        },
        {
          url: "https://cdn.example.com/movie-360-hindi.mp4",
          resolution: "360p (Hindi)",
          source: "Hindi Dub",
          duration: 7200,
          size_mb: 320,
        },
        {
          url: "https://cdn.example.com/movie-1080-orig.mp4",
          resolution: "1080p",
          lan: "en",
          lanName: "Original",
          duration: 7200,
          size_mb: 1900,
        },
        {
          url: "https://cdn.example.com/movie-360-orig.mp4",
          resolution: "360p",
          lan: "en",
          duration: 7200,
          size_mb: 340,
        },
      ],
    });

    const selectable = selectableSources(normalized.sources);
    expect(selectable.map((s) => s.url)).toEqual([
      "https://cdn.example.com/movie-1080-orig.mp4",
      "https://cdn.example.com/movie-360-orig.mp4",
    ]);
    expect(selectSource(normalized.sources, null)?.url).toBe("https://cdn.example.com/movie-360-orig.mp4");
    expect(selectPreferredSource(normalized.sources, "auto", true)?.url).toBe(
      "https://cdn.example.com/movie-1080-orig.mp4",
    );
    expect(selectDownloadSource(normalized.sources, "1080p")?.url).toBe(
      "https://cdn.example.com/movie-1080-orig.mp4",
    );
  });

  test("pickOriginalAudioTrack switches dual-audio containers away from Track 0 Hindi to Original Audio", () => {
    const dualAudioHollywood = [
      { id: "0", language: "hi", label: "Hindi" },
      { id: "1", language: "en", label: "English" },
    ];
    expect(pickOriginalAudioTrack(dualAudioHollywood, "United States")?.id).toBe("1");
    expect(pickOriginalAudioTrack(dualAudioHollywood, null)?.id).toBe("1");

    const triAudioKdrama = [
      { id: "0", language: "hi", label: "Hindi" },
      { id: "1", language: "en", label: "English Dub" },
      { id: "2", language: "ko", label: "Korean" },
    ];
    expect(pickOriginalAudioTrack(triAudioKdrama, "South Korea")?.id).toBe("2");
    expect(formatAudioTrackLabel(triAudioKdrama[2]!, 2, "South Korea")).toContain("Original");
    expect(formatAudioTrackLabel(triAudioKdrama[0]!, 0, "South Korea")).toContain("Dub");
  });

  test("fetchHome NEVER drops sections when Moviebox puts language availability badges on cards", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          sections: [
            {
              section: "Banner",
              items: [
                {
                  subjectId: "kd1",
                  name: "Queen of Tears",
                  slug: "queen-of-tears-abc111",
                  badge: "Hindi",
                  type: "series",
                },
                {
                  subjectId: "kd2",
                  name: "Lovely Runner",
                  slug: "lovely-runner-abc222",
                  badge: "Indonesian",
                  type: "series",
                },
              ],
            },
            {
              section: "Trending K-Drama",
              items: [
                {
                  subjectId: "kd3",
                  name: "Marry My Husband",
                  slug: "marry-my-husband-abc333",
                  badge: "Sub | Dub",
                  type: "series",
                },
                {
                  subjectId: "kd4",
                  name: "Moving",
                  slug: "moving-abc444",
                  badge: "Arabic",
                  type: "series",
                },
              ],
            },
            {
              section: "Popular Series",
              items: [
                // Even if an entire rail only had -hindi- slugs, fetchHome never drops the rail!
                {
                  subjectId: "aot-hi",
                  name: "Attack on Titan [Hindi]",
                  slug: "attack-on-titan-hindi-kGWQOIx0d4",
                  badge: "Hindi",
                  type: "series",
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    try {
      const home = await fetchHome();
      expect(home.map((s) => s.section)).toEqual(["Banner", "Trending K-Drama", "Popular Series"]);
      expect(home[0]?.items.map((i) => i.subjectId)).toEqual(["kd1", "kd2"]);
      expect(home[1]?.items.map((i) => i.subjectId)).toEqual(["kd3", "kd4"]);
      expect(home[2]?.items.length).toBe(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("fetchAudioVersions discovers Original Audio + Dub siblings from /detail and /search for live player switching", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/detail/squid-game-hindi-999")) {
        return new Response(
          JSON.stringify({
            subject: {
              subjectId: "sg-hi",
              title: "Squid Game [Hindi]",
              detailPath: "squid-game-hindi-999",
              countryName: "South Korea",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/search?q=Squid%20Game")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                subjectId: "sg-hi",
                name: "Squid Game [Hindi]",
                slug: "squid-game-hindi-999",
                type: "series",
              },
              {
                subjectId: "sg-orig",
                name: "Squid Game",
                slug: "squid-game-orig-111",
                type: "series",
              },
              {
                subjectId: "sg-en",
                name: "Squid Game [English]",
                slug: "squid-game-english-222",
                type: "series",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const versions = await fetchAudioVersions({
        subjectId: "sg-hi",
        detailPath: "squid-game-hindi-999",
        title: "Squid Game [Hindi]",
        mediaType: "series",
      });
      expect(versions[0]?.subjectId).toBe("sg-orig");
      expect(versions[0]?.isOriginal).toBe(true);
      expect(versions[0]?.label).toBe("Original Audio (Korean)");
      expect(versions.some((v) => v.subjectId === "sg-en" && v.label.includes("English"))).toBe(true);
      expect(versions.some((v) => v.subjectId === "sg-hi" && v.isHindi)).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("crash-safety invariants: no availableAudioTracksChange JSI race, no enableFreeze, no RGB_565 blur", () => {
    const engineSrc = readFileSync("src/services/player/usePlaybackEngine.ts", "utf8");
    expect(engineSrc).not.toContain('useEvent(player, "availableAudioTracksChange"');

    const indexSrc = readFileSync("index.ts", "utf8");
    const mobileEntry = readFileSync("entries/mobile.ts", "utf8");
    const tvEntry = readFileSync("entries/tv.ts", "utf8");
    expect(indexSrc).not.toContain("enableFreeze");
    expect(mobileEntry).not.toContain("enableFreeze");
    expect(tvEntry).not.toContain("enableFreeze");

    const posterSrc = readFileSync("src/components/ui/Poster.tsx", "utf8");
    const ambientSrc = readFileSync("src/ui/glass/AmbientArtworkCanvas.tsx", "utf8");
    expect(posterSrc).not.toContain('decodeFormat="rgb"');
    expect(ambientSrc).not.toContain('decodeFormat="rgb"');
  });
});
