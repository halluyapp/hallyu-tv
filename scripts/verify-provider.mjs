#!/usr/bin/env node
/**
 * Provider integration verification — run in CI (backend-verify workflow) and
 * locally via `npm run verify:provider`. Exercises every public endpoint the
 * app depends on and fails loudly (exit 1) when the contract breaks.
 *
 * Public API, no key required. This script never touches CDN media URLs
 * (they are IP-sensitive); it verifies metadata + stream descriptors only.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load EXPO_PUBLIC_* from .env if not already in the environment (CI supplies them too).
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^(EXPO_PUBLIC_[A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const BASE = process.env.PROVIDER_BASE_URL ?? "https://movieapi.zarhosting.dpdns.org/api/public/v1";
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Referer: "https://www.moviebox.ph/",
  Origin: "https://www.moviebox.ph",
  Accept: "application/json",
};

// Fixtures verified during development. If these drift, pick replacements from /home results.
const FIXTURE_SERIES = { subjectId: "4780148614284956296", slug: "dead-end-job-oAmYsY887H5" };
const FIXTURE_MOVIE = { subjectId: "6202255725672398112", slug: "verity-eNHDBJtwKu4" };

let failures = 0;
function check(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function main() {
  // 1. Home catalogue
  try {
    const home = await getJson("/home");
    const sections = Array.isArray(home) ? home : home?.data ?? home?.sections ?? [];
    check("GET /home", sections.length > 0, `${sections.length} sections`);
  } catch (err) {
    check("GET /home", false, String(err.message));
  }

  // 2. Search
  try {
    const s = await getJson("/search?q=love&page=1");
    const items = s?.data?.items ?? s?.data ?? s?.items ?? [];
    check("GET /search?q=&page=", Array.isArray(items) && items.length > 0, `${items.length} results`);
  } catch (err) {
    check("GET /search?q=&page=", false, String(err.message));
  }

  // 3. Detail (series fixture)
  try {
    const d = await getJson(`/detail/${FIXTURE_SERIES.slug}`);
    const detail = d?.data?.subject ?? d?.subject ?? d?.data ?? d;
    check(
      "GET /detail/{slug}",
      Boolean(detail) && (detail.title || detail.name),
      String(detail?.title ?? detail?.name ?? ""),
    );
  } catch (err) {
    check("GET /detail/{slug}", false, String(err.message));
  }

  // 4. Stream resolution (movie fixture: se=0&ep=0) — descriptors only.
  try {
    const st = await getJson(
      `/stream/${FIXTURE_MOVIE.subjectId}?detail_path=${FIXTURE_MOVIE.slug}&se=0&ep=0`,
    );
    const data = st?.data ?? st;
    const sources = JSON.stringify(data).length > 2 ? data : null;
    const blob = JSON.stringify(sources ?? {});
    const hasUrls = blob.includes("http") && /mp4|m3u8/i.test(blob);
    check("GET /stream/{id} (movie)", hasUrls, "stream descriptors present");
  } catch (err) {
    check("GET /stream/{id} (movie)", false, String(err.message));
  }

  // 5. Captions
  try {
    const cap = await getJson(
      `/stream/${FIXTURE_MOVIE.subjectId}/captions?detail_path=${FIXTURE_MOVIE.slug}&se=0&ep=0`,
    );
    check("GET /stream/{id}/captions", cap !== undefined && cap !== null, "endpoint alive");
  } catch (err) {
    check("GET /stream/{id}/captions", false, String(err.message));
  }

  console.log(failures === 0 ? "\nProvider verification: ALL PASS" : `\nProvider verification: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
