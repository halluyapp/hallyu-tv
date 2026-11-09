#!/usr/bin/env bun
/**
 * Live Zarhosting contract verification.
 *
 * Beyond "did /home return something", this reports what the catalogue actually
 * contains: every section with its counts, how many items were received,
 * normalized and rejected (with reasons), metadata coverage (genre, country,
 * rating, dub), the derived discovery worlds, and the search contract. Then it
 * walks detail → stream for a real movie and a real episode.
 *
 * Structural failures fail the run. Thin content (for example zero K-Dramas on
 * a given day) is reported as a warning: provider rankings move, and CI must not
 * fall over because a feed changed.
 *
 * Run: bun run verify:provider
 */
import {
  fetchDetail,
  fetchHomeCatalogue,
  resolveStreams,
  searchCatalogue,
} from "../src/services/provider/adapter";
import { buildSnapshot } from "../src/services/catalogue";
import { harvestCatalogue } from "../src/services/catalogue/harvest";
import { isAnimeItem, isChinese, isDubbedItem, isHollywoodItem, isKorean } from "../src/services/catalogue/worlds";
import { qualityOptions, selectDownloadSource, selectSource } from "../src/services/provider/streams";

let failures = 0;
let warnings = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function warn(name, detail = "") {
  warnings += 1;
  console.log(`WARN  ${name}${detail ? ` — ${detail}` : ""}`);
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}

function bar(label, value) {
  return `${String(label).padEnd(28)} ${String(value).padStart(6)}`;
}

async function main() {
  console.log("== /home ==");
  const home = await fetchHomeCatalogue();
  const allItems = home.sections.flatMap((section) => section.items);

  check(
    "GET /home returned sections",
    home.sections.length > 0,
    `${home.rawSections} raw → ${home.sections.length} merged`,
  );
  check("normalization produced items", allItems.length > 0, `${allItems.length} normalized`);

  const titles = home.sections.map((section) => section.section);
  check("no duplicate section titles after merge", new Set(titles).size === titles.length, titles.join(" | "));

  console.log("");
  console.log(
    "section".padEnd(28),
    "items".padStart(6),
    "genre".padStart(6),
    "country".padStart(8),
    "dubbed".padStart(7),
  );
  for (const section of home.sections) {
    console.log(
      section.section.padEnd(28),
      String(section.items.length).padStart(6),
      String(section.items.filter((item) => item.genre).length).padStart(6),
      String(section.items.filter((item) => item.country).length).padStart(8),
      String(section.items.filter((item) => isDubbedItem(item)).length).padStart(7),
    );
  }

  if (home.mergedSections > 0) {
    console.log(`\nMerged ${home.mergedSections} duplicate provider section(s) into canonical worlds.`);
  }

  console.log("");
  console.log("== normalization ==");
  const report = home.report;
  console.log(bar("received", report.received));
  console.log(bar("normalized", report.normalized));
  console.log(bar("rejected", report.rejected));
  console.log(bar("with genre", report.withGenre));
  console.log(bar("with rating", report.withRating));
  console.log(bar("with year", report.withYear));
  if (Object.keys(report.reasons).length > 0) {
    console.log(`rejection reasons: ${JSON.stringify(report.reasons)}`);
  }
  check(
    "rejection rate stays small",
    report.received === 0 || report.rejected / report.received < 0.25,
    `${report.rejected}/${report.received}`,
  );

  console.log("");
  console.log("== discovery worlds (home catalogue only) ==");
  const homeSnapshot = buildSnapshot({
    sections: home.sections,
    report,
    rawSections: home.rawSections,
    mergedSections: home.mergedSections,
  });
  console.log(
    "shelves:",
    homeSnapshot.shelves.map((shelf) => `${shelf.title}(${shelf.items.length})`).join(", ") || "none",
  );
  check("builds at least three shelves from /home", homeSnapshot.shelves.length >= 3, `${homeSnapshot.shelves.length}`);

  console.log("");
  console.log("== metadata harvest (search-derived worlds) ==");
  let harvest = { items: [], requests: 0, failures: 0 };
  try {
    harvest = await harvestCatalogue();
    console.log(
      `harvest: ${harvest.items.length} items from ${harvest.requests} request(s), ${harvest.failures} failed`,
    );
    console.log(bar("korean series", harvest.items.filter((item) => isKorean(item) && item.mediaType === "series").length));
    console.log(bar("chinese series", harvest.items.filter((item) => isChinese(item) && item.mediaType === "series").length));
    console.log(bar("anime", harvest.items.filter(isAnimeItem).length));
    console.log(bar("hollywood", harvest.items.filter(isHollywoodItem).length));
    check("harvest returns metadata-verified titles", harvest.items.length > 0, `${harvest.items.length}`);
  } catch (error) {
    check("harvest", false, String(error instanceof Error ? error.message : error));
  }

  const snapshot = buildSnapshot({
    sections: home.sections,
    harvest: harvest.items,
    report,
    rawSections: home.rawSections,
    mergedSections: home.mergedSections,
    harvestRequests: harvest.requests,
    harvestFailures: harvest.failures,
  });
  console.log(
    "shelves with harvest:",
    snapshot.shelves.map((shelf) => `${shelf.title}(${shelf.items.length})`).join(", "),
  );
  for (const name of ["K-Drama", "C-Drama", "Anime", "Trending Now", "Hot Picks"]) {
    if (!snapshot.shelves.some((shelf) => shelf.title === name)) warn(`shelf missing: ${name}`);
  }

  console.log("");
  console.log("== /search ==");
  let movieFixture = null;
  let seriesFixture = null;

  try {
    const first = await searchCatalogue("love", 1, undefined, 60);
    console.log(`q=love page 1: ${first.count} items, total ${first.total}, ${first.totalPages} pages`);
    check("GET /search returns items", first.items.length > 0, `${first.items.length}`);
    check("search metadata includes country", first.items.some((item) => Boolean(item.country)));
    console.log(
      `metadata coverage: country ${first.items.filter((item) => item.country).length}/${first.items.length}, ` +
        `genre ${first.items.filter((item) => item.genre).length}/${first.items.length}, ` +
        `dub ${first.items.filter((item) => isDubbedItem(item)).length}/${first.items.length}`,
    );

    const second = await searchCatalogue("love", 2, undefined, 60);
    const firstIds = first.items.map((item) => item.subjectId).join(",");
    const secondIds = second.items.map((item) => item.subjectId).join(",");
    check("pagination returns a different page", firstIds !== secondIds && second.items.length > 0);

    for (const candidate of [...first.items, ...second.items]) {
      if (!movieFixture && candidate.mediaType === "movie" && !isDubbedItem(candidate)) {
        movieFixture = { subjectId: candidate.subjectId, slug: candidate.slug };
      }
      if (!seriesFixture && candidate.mediaType === "series" && candidate.country) {
        seriesFixture = { subjectId: candidate.subjectId, slug: candidate.slug };
      }
    }
  } catch (error) {
    check("GET /search", false, String(error instanceof Error ? error.message : error));
  }

  console.log("");
  console.log("== detail → stream ==");
  const fixtures = [
    ["movie", movieFixture, 0, 0],
    ["series S1E1", seriesFixture, 1, 1],
  ];
  for (const [label, fixture, se, ep] of fixtures) {
    if (!fixture) {
      warn(`no ${label} fixture available from search`);
      continue;
    }
    try {
      const detail = await fetchDetail(fixture.slug);
      check(`GET /detail (${label})`, Boolean(detail.title), detail.title);
      console.log(
        `  metadata: type=${detail.mediaType} country=${detail.country ?? "?"} genre=${detail.genre ?? "?"} ` +
          `rating=${detail.rating ?? "?"} seasons=${detail.seasons.length}`,
      );
      const resolved = await resolveStreams(fixture.subjectId, detail.detailPath, se, ep);
      const pick = selectSource(resolved.sources, null);
      const download = selectDownloadSource(resolved.sources, null);
      check(
        `GET /stream (${label}) normalized`,
        resolved.sources.length > 0 && Boolean(pick) && !pick.preview,
        `${resolved.sources.length} sources (${qualityOptions(resolved.sources).join("/")}); ` +
          `default=${pick ? pick.resolution : "none"}; host=${pick ? safeHost(pick.url) : "?"}`,
      );
      check(`downloadable MP4 (${label})`, Boolean(download), download ? download.resolution : "none");
    } catch (error) {
      check(`stream flow (${label})`, false, String(error instanceof Error ? error.message : error));
    }
  }

  console.log("");
  console.log(
    failures === 0
      ? `Provider verification: ALL PASS${warnings > 0 ? ` (${warnings} warning${warnings === 1 ? "" : "s"})` : ""}`
      : `Provider verification: ${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
