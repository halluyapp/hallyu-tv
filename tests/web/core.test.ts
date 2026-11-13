import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHomeSections, normalizeItems } from "../../src/services/catalogue/normalize";
import { canonicalGenre, isBlockedItem } from "../../src/services/catalogue/worlds";
import { buildSnapshot, browseCatalogue } from "../../src/services/catalogue/index";
import {
  normalizeStreamResponse,
  selectDownloadSource,
  selectSource,
} from "../../src/services/provider/streams";
import { cueAt, parseSubtitles } from "../../src/services/subtitles/srt";
import {
  emptyLibrary,
  normalizeLibrary,
  toggleWatchlistItem,
  upsertProgress,
} from "../../src/services/localLibrary";
import { classifyPlayerError } from "../../src/services/player/classify";
import { pickAdaptiveSource, shouldDownshift } from "../../src/services/player/playbackPolicy";
import { buildRouteUrl, parseRoute } from "../../src/web/services/routing";
import { buildResumeHeaders, resolveRangeResponse } from "../../src/web/services/downloadStorage";
import { normalizePreferences } from "../../src/web/services/preferences";
import { sortCatalogueItems } from "../../src/services/catalogue/index";

test("normalizeHomeSections merges duplicate worlds and isBlockedItem filters adult items", () => {
  const { sections, mergedSections } = normalizeHomeSections([
    {
      section: "🔥Trending Now",
      items: [
        { name: "Signal [Hindi]", subject_id: "101", slug: "signal-101", type: 2, rating: "8.9", year: "2016", country: "Korea", genre: "Crime,Drama" },
      ],
    },
    {
      section: "🔥Trending now",
      items: [
        { name: "Signal", subject_id: "101", slug: "signal-101", type: 2 },
        { name: "Goblin", subject_id: "102", slug: "goblin-102", type: 2, rating: "8.8", year: "2016", country: "Korea", genre: "Fantasy,Romance" },
      ],
    },
  ]);
  assert.equal(sections.length, 1);
  assert.equal(mergedSections, 1);
  assert.equal(sections[0]!.items.length, 2);
  assert.equal(canonicalGenre("Erotic"), null);

  const blocked = {
    name: "Blocked Item",
    subjectId: "103",
    slug: "blocked-103",
    posterUrl: null,
    badge: null,
    rating: null,
    year: null,
    genre: "Erotic",
    mediaType: "movie" as const,
  };
  assert.equal(isBlockedItem(blocked), true);

  const snapshot = buildSnapshot({ sections, harvest: [blocked] });
  assert.equal(snapshot.index.some((i) => i.subjectId === "103"), false);
  const kdrama = browseCatalogue(snapshot, { world: "kdrama", type: "series" });
  assert.equal(kdrama.total, 2);
});

test("normalizeItems cleans bracket tags and filters explicit entries", () => {
  const { items } = normalizeItems([
    { name: "My Mister [Hindi]", subject_id: "200", slug: "my-mister-200", type: 2 },
    { name: "Explicit OVA", subject_id: "201", slug: "explicit-201", type: 2, genre: "Hentai,Drama" },
    { name: "Goblin no Suana", subject_id: "202", slug: "goblin-no-suana-202", type: 2, genre: "Anime" },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.displayName, "My Mister");
  assert.deepEqual(items[0]?.tags, ["Hindi"]);
});

test("stream normalization filters previews and picks data-conscious 360p MP4 default", () => {
  const res = normalizeStreamResponse({
    has_resource: true,
    sources: [
      { url: "https://cdn.example.com/preview.mp4", resolution: "360p", source: "Mobile Native", duration: 60 },
      { url: "https://cdn.example.com/720.mp4", resolution: "720p", size_mb: 700, duration: 3600 },
      { url: "https://cdn.example.com/360.mp4", resolution: "360p", size_mb: 250, duration: 3600 },
    ],
    hls: ["https://cdn.example.com/master.m3u8"],
  });
  const picked = selectSource(res.sources, null);
  assert.equal(picked?.resolution, "360p");
  assert.equal(selectDownloadSource(res.sources, "720p")?.url, "https://cdn.example.com/720.mp4");
  assert.equal(selectDownloadSource(res.sources, "HLS"), null);
});

test("SRT parsing and cueAt binary search respect offsetMs", () => {
  const srt = `1
00:00:01,000 --> 00:00:04,000
<i>Hello</i> world

2
00:00:05,000 --> 00:00:08,000
Second line`;
  const cues = parseSubtitles(srt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0]?.text, "Hello world");
  assert.equal(cueAt(cues, 2000, 0)?.text, "Hello world");
  assert.equal(cueAt(cues, 2000, 1500), null);
});

test("localLibrary watchlist and progress persistence helpers behave deterministically", () => {
  const lib0 = emptyLibrary();
  const item = {
    subject_id: "55",
    detail_path: "crash-landing-55",
    media_type: "series" as const,
    title: "Crash Landing on You",
    poster_url: null,
  };
  const lib1 = toggleWatchlistItem(lib0, item);
  assert.equal(lib1.watchlist.length, 1);
  const lib2 = upsertProgress(lib1, {
    ...item,
    season_number: 1,
    episode_number: 2,
    position_seconds: 120,
    duration_seconds: 3600,
    completed: false,
    updated_at: "2026-11-12T00:00:00Z",
  });
  const roundtrip = normalizeLibrary(JSON.parse(JSON.stringify(lib2)));
  assert.equal(roundtrip.progress.length, 1);
  assert.equal(roundtrip.progress[0]?.episode_number, 2);
});

test("player error classification and adaptive downshift work as expected", () => {
  assert.equal(classifyPlayerError("HTTP 426 Upgrade Required"), "cdn");
  assert.equal(classifyPlayerError("HTTP 403 Forbidden"), "expired");
  const now = 100_000;
  assert.equal(shouldDownshift([now - 10_000, now - 5_000], now), true);
  const res = normalizeStreamResponse({
    has_resource: true,
    sources: [
      { url: "https://cdn.example.com/1080.mp4", resolution: "1080p", size_mb: 1200, duration: 3600 },
      { url: "https://cdn.example.com/720.mp4", resolution: "720p", size_mb: 700, duration: 3600 },
      { url: "https://cdn.example.com/480.mp4", resolution: "480p", size_mb: 400, duration: 3600 },
    ],
  });
  assert.equal(pickAdaptiveSource(res.sources, "1080p", 1)?.resolution, "720p");
});

test("route parser and URL builder roundtrip cleanly", () => {
  const explore = parseRoute("/explore", "?world=kdrama&genre=Romance&q=goblin");
  assert.equal(explore.tab, "explore");
  assert.equal(explore.world, "kdrama");
  assert.equal(explore.genre, "Romance");
  assert.equal(explore.query, "goblin");
  assert.equal(buildRouteUrl(explore), "/explore?world=kdrama&genre=Romance&q=goblin");

  const titleRoute = parseRoute("/title/goblin-102", "?from=explore");
  assert.equal(titleRoute.detailPath, "goblin-102");
  assert.equal(titleRoute.tab, "explore");
  assert.equal(buildRouteUrl(titleRoute), "/title/goblin-102?from=explore");
});

test("HTTP Range resume headers and 206/200 offset resolution behave accurately", () => {
  assert.deepEqual(buildResumeHeaders(0), {});
  assert.deepEqual(buildResumeHeaders(1048576), { Range: "bytes=1048576-" });

  const partial = resolveRangeResponse(206, "bytes 1048576-5242879/5242880", "4194304", 1048576, null);
  assert.equal(partial.resumeFromOffset, 1048576);
  assert.equal(partial.totalBytes, 5242880);

  // If upstream ignores Range and sends 200, writer resets to 0 without corrupting file.
  const restart = resolveRangeResponse(200, null, "5242880", 1048576, null);
  assert.equal(restart.resumeFromOffset, 0);
  assert.equal(restart.totalBytes, 5242880);
});

test("preferences normalization and catalogue sorting work safely", () => {
  const prefs = normalizePreferences({ defaultStreamQuality: "720p", subtitleScale: 99, cardDensity: "compact" });
  assert.equal(prefs.defaultStreamQuality, "720p");
  assert.equal(prefs.subtitleScale, 1.4);
  assert.equal(prefs.cardDensity, "compact");

  const sorted = sortCatalogueItems(
    [
      { name: "B", subjectId: "1", slug: "b", posterUrl: null, badge: null, rating: "7.5", year: "2020", mediaType: "movie" },
      { name: "A", subjectId: "2", slug: "a", posterUrl: null, badge: null, rating: "9.1", year: "2024", mediaType: "movie" },
    ],
    "rating",
  );
  assert.equal(sorted[0]?.subjectId, "2");
});
