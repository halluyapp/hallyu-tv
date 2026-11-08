import { beforeEach, describe, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Lightweight in-memory AsyncStorage mock for Bun unit tests
const memoryStore = new Map<string, string>();
mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => memoryStore.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      memoryStore.set(k, v);
    },
    removeItem: async (k: string) => {
      memoryStore.delete(k);
    },
    multiRemove: async (keys: string[]) => {
      for (const k of keys) memoryStore.delete(k);
    },
    clear: async () => {
      memoryStore.clear();
    },
  },
}));

import {
  clearAllProgress,
  clearAllWatchlist,
  emptyLibrary,
  removeProgressEntry,
  toggleWatchlistItem,
  upsertProgress,
} from "@/services/localLibrary";
import { MOBILE_EXPLORE_WORLDS, WORLD_DEFINITIONS, type WorldId } from "@/services/provider/categories";
import { providerFetch } from "@/services/provider/client";
import { curateFeaturedItems } from "@/services/provider/homeCatalogue";
import {
  IMAGE_REQUEST_HEADERS,
  markResizeUnsupportedForUrl,
  optimizeImageUrl,
  resetUnsupportedResizeHosts,
} from "@/services/provider/imageOptimizer";
import { selectPreferredSource } from "@/services/provider/streams";
import {
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearches,
  MAX_RECENT_SEARCHES,
  removeRecentSearch,
} from "@/services/searchHistory";
import {
  clearCachedSubtitles,
  loadCues,
  MAX_CACHED_SUBTITLE_TRACKS,
  saveCues,
} from "@/services/subtitles/cache";
import { stripFileScheme } from "@/services/updater/version";
import type { StreamSource } from "@/types/provider";

const ROOT = join(__dirname, "..");

function makeSource(resolution: string, qualityValue: number): StreamSource {
  return {
    url: `https://cdn.example.com/video-${resolution}.mp4`,
    resolution,
    qualityValue,
    format: "MP4",
    codec: "h264",
    sizeBytes: 120_000_000,
    durationSeconds: 3600,
    sourceLabel: resolution,
    audioLanguage: null,
    isDubbed: false,
    isHindiDub: false,
    preview: false,
    verifiedFullLength: true,
  };
}

describe("Dual-APK Optical Liquid Glass Architecture", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  test("selectPreferredSource chooses 360p on Mobile auto and 1080p HD on TV auto", () => {
    const sources = [
      makeSource("360p", 360),
      makeSource("480p", 480),
      makeSource("720p", 720),
      makeSource("1080p", 1080),
    ];

    expect(selectPreferredSource(sources, "auto", false)?.resolution).toBe("360p");
    expect(selectPreferredSource(sources, "auto", true)?.resolution).toBe("1080p");
    expect(selectPreferredSource(sources, "720p", false)?.resolution).toBe("720p");
    expect(selectPreferredSource(sources, "480p", true)?.resolution).toBe("480p");
  });

  test("subtitle cache enforces 30-track LRU cap and supports full clear", async () => {
    for (let i = 1; i <= MAX_CACHED_SUBTITLE_TRACKS + 5; i++) {
      await saveCues(`hallyu.cues.v1.track-${i}`, [{ startMs: 0, endMs: 2000, text: `Cue ${i}` }]);
    }

    // Oldest 5 tracks should have been evicted
    expect(await loadCues("hallyu.cues.v1.track-1")).toBeNull();
    expect(await loadCues("hallyu.cues.v1.track-5")).toBeNull();
    // Newest tracks remain cached
    const newest = await loadCues(`hallyu.cues.v1.track-${MAX_CACHED_SUBTITLE_TRACKS + 5}`);
    expect(newest?.[0]?.text).toBe(`Cue ${MAX_CACHED_SUBTITLE_TRACKS + 5}`);

    await clearCachedSubtitles();
    expect(await loadCues(`hallyu.cues.v1.track-${MAX_CACHED_SUBTITLE_TRACKS + 5}`)).toBeNull();
  });

  test("searchHistory deduplicates case-insensitively and caps at 10 items", async () => {
    for (let i = 1; i <= 12; i++) {
      await addRecentSearch(`Drama ${i}`);
    }
    await addRecentSearch("drama 10");

    const list = await loadRecentSearches();
    expect(list.length).toBe(MAX_RECENT_SEARCHES);
    expect(list[0]).toBe("drama 10");

    const afterRemove = await removeRecentSearch("DRAMA 10");
    expect(afterRemove).not.toContain("drama 10");

    const afterClear = await clearRecentSearches();
    expect(afterClear).toEqual([]);
  });

  test("localLibrary pure reducers support single-episode history removal and bulk clear", () => {
    let snap = emptyLibrary();
    snap = toggleWatchlistItem(snap, {
      subject_id: "s1",
      detail_path: "moving",
      media_type: "series",
      title: "Moving",
      poster_url: null,
    });
    snap = upsertProgress(snap, {
      subject_id: "s1",
      detail_path: "moving",
      media_type: "series",
      title: "Moving",
      poster_url: null,
      season_number: 1,
      episode_number: 1,
      position_seconds: 300,
      duration_seconds: 3000,
      completed: false,
      updated_at: "2026-11-05T01:00:00.000Z",
    });
    snap = upsertProgress(snap, {
      subject_id: "s1",
      detail_path: "moving",
      media_type: "series",
      title: "Moving",
      poster_url: null,
      season_number: 1,
      episode_number: 2,
      position_seconds: 400,
      duration_seconds: 3000,
      completed: false,
      updated_at: "2026-11-05T02:00:00.000Z",
    });

    snap = removeProgressEntry(snap, "s1", 1, 1);
    expect(snap.progress.length).toBe(1);
    expect(snap.progress[0]?.episode_number).toBe(2);

    snap = clearAllProgress(snap);
    snap = clearAllWatchlist(snap);
    expect(snap.progress).toEqual([]);
    expect(snap.watchlist).toEqual([]);
  });

  test("updater stripFileScheme normalizes file:// URIs before native Kotlin verification", () => {
    expect(stripFileScheme("file:///data/user/0/app.hallyu.mobile/cache/updates/hallyu-mobile-v1.apk")).toBe(
      "/data/user/0/app.hallyu.mobile/cache/updates/hallyu-mobile-v1.apk",
    );
    expect(stripFileScheme("/data/user/0/app.hallyutv.dev/cache/updates/hallyu-tv-v1.apk")).toBe(
      "/data/user/0/app.hallyutv.dev/cache/updates/hallyu-tv-v1.apk",
    );
  });

  test("create-update-manifest.mjs produces SHA-256 verified manifests for mobile and tv", () => {
    const tmp = mkdtempSync(join(tmpdir(), "hallyu-manifest-"));
    try {
      const dummyApk = join(tmp, "dummy.apk");
      writeFileSync(dummyApk, Buffer.from("fake-signed-apk-payload-for-sha256-test"));

      execFileSync(
        process.execPath,
        [join(ROOT, "scripts/create-update-manifest.mjs"), dummyApk],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            APP_VARIANT: "mobile",
            RELEASE_TAG: "v0.2.0",
            OUT_DIR: tmp,
          },
        },
      );

      execFileSync(
        process.execPath,
        [join(ROOT, "scripts/create-update-manifest.mjs"), dummyApk],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            APP_VARIANT: "tv",
            RELEASE_TAG: "v0.2.0",
            OUT_DIR: tmp,
          },
        },
      );

      const mJson = JSON.parse(readFileSync(join(tmp, "mobile-update.json"), "utf8"));
      const tJson = JSON.parse(readFileSync(join(tmp, "tv-update.json"), "utf8"));

      expect(mJson.variant).toBe("mobile");
      expect(mJson.packageName).toBe("app.hallyu.mobile");
      expect(mJson.apkAssetName).toBe("hallyu-mobile.apk");
      expect(mJson.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(mJson.fileSize).toBeGreaterThan(10);

      expect(tJson.variant).toBe("tv");
      expect(tJson.packageName).toBe("app.hallyutv.dev");
      expect(tJson.apkAssetName).toBe("hallyu-tv.apk");
      expect(tJson.sha256).toBe(mJson.sha256);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("TV 320x180 Leanback banner asset exists and categories cover both TV and Mobile worlds", () => {
    expect(existsSync(join(ROOT, "assets/images/tv-banner.png"))).toBe(true);
    const tvWorlds: WorldId[] = ["discover", "kdrama", "cdrama", "anime", "movies", "series"];
    for (const id of tvWorlds) {
      expect(WORLD_DEFINITIONS[id]).toBeDefined();
    }
    for (const id of MOBILE_EXPLORE_WORLDS) {
      expect(WORLD_DEFINITIONS[id]).toBeDefined();
    }
  });

  test("Design system & native plugins preserve strict Liquid Glass & FileProvider invariants", () => {
    const tokens = readFileSync(join(ROOT, "src/design-system/tokens.ts"), "utf8");
    expect(tokens).not.toMatch(/#8b5cf6|#7c3aed|#a855f7|#9333ea|#6d28d9/i);

    const downloaderPlugin = readFileSync(join(ROOT, "plugins/withHallyuDownloader.js"), "utf8");
    expect(downloaderPlugin).toContain(".hallyu.updateprovider");
    expect(downloaderPlugin).toContain("hallyu_update_paths");
    expect(downloaderPlugin).toContain('removePrefix("file://")');
    expect(downloaderPlugin).toContain('abiFilters "armeabi-v7a", "arm64-v8a"');

    const appConfig = readFileSync(join(ROOT, "app.config.js"), "utf8");
    expect(appConfig).toContain("android.permission.REQUEST_INSTALL_PACKAGES");

    const tvPlugin = readFileSync(join(ROOT, "plugins/withAndroidTvSupport.js"), "utf8");
    expect(tvPlugin).toContain("@drawable/tv_banner");
  });

  test("curateFeaturedItems picks distinct poster-backed dramas across sections for Hero rotation", () => {
    const curated = curateFeaturedItems(
      [
        {
          section: "Trending K-Drama",
          items: [
            {
              subjectId: "1",
              name: "Moving",
              slug: "moving",
              posterUrl: "https://cdn.example.com/1.jpg",
              badge: null,
              rating: "8.9",
              year: "2023",
              genre: "Action",
              mediaType: "series",
            },
            {
              subjectId: "2",
              name: "Missing Poster",
              slug: "missing",
              posterUrl: null,
              badge: null,
              rating: null,
              year: null,
              genre: null,
              mediaType: "series",
            },
          ],
        },
        {
          section: "Top Cinema",
          items: [
            {
              subjectId: "1",
              name: "Moving Duplicate",
              slug: "moving",
              posterUrl: "https://cdn.example.com/1.jpg",
              badge: null,
              rating: "8.9",
              year: "2023",
              genre: "Action",
              mediaType: "series",
            },
            {
              subjectId: "3",
              name: "Exhuma",
              slug: "exhuma",
              posterUrl: "https://cdn.example.com/3.jpg",
              badge: null,
              rating: "8.1",
              year: "2024",
              genre: "Thriller",
              mediaType: "movie",
            },
          ],
        },
      ],
      6,
    );

    expect(curated.map((c) => c.subjectId)).toEqual(["1", "3"]);
  });

  test("providerFetch deduplicates concurrent identical requests into one network call", async () => {
    const orig = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 25));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      const [a, b, c] = await Promise.all([
        providerFetch("/detail/moving", { retries: 0 }),
        providerFetch("/detail/moving", { retries: 0 }),
        providerFetch("/detail/moving", { retries: 0 }),
      ]);
      expect(calls).toBe(1);
      expect(a).toEqual({ ok: true });
      expect(b).toEqual({ ok: true });
      expect(c).toEqual({ ok: true });
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("optimizeImageUrl shrinks OSS posters to WebP, preserves signed URLs, and self-heals on unsupported hosts", () => {
    resetUnsupportedResizeHosts();
    expect(IMAGE_REQUEST_HEADERS.Referer).toBe("https://moviebox.ph/");
    expect(IMAGE_REQUEST_HEADERS["User-Agent"]).toBe("Mozilla/5.0");

    const rawAoneroom = "https://pbcdnw.aoneroom.com/image/2025/04/poster.jpg";
    expect(optimizeImageUrl(rawAoneroom, "poster")).toContain("w_340");
    expect(optimizeImageUrl(rawAoneroom, "poster")).toContain("format,webp");
    expect(optimizeImageUrl(rawAoneroom, "ambient")).toContain("w_120");
    expect(optimizeImageUrl(rawAoneroom, "hero")).toContain("w_780");

    // Signed URLs with existing query strings are never mutated
    const signed = "https://pbcdnw.aoneroom.com/image/poster.jpg?OSSAccessKeyId=123&Signature=abc";
    expect(optimizeImageUrl(signed, "poster")).toBe(signed);

    // Self-healing fallback disables resizing for that host immediately
    markResizeUnsupportedForUrl(rawAoneroom);
    expect(optimizeImageUrl(rawAoneroom, "poster")).toBe(rawAoneroom);
    resetUnsupportedResizeHosts();
  });
});
