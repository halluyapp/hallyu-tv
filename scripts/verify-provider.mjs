#!/usr/bin/env bun
/**
 * Provider integration verification — run in CI (backend-verify workflow) and
 * locally via `bun run verify:provider`. Exercises every public endpoint the
 * app depends on and validates responses with the SAME normalization and
 * selection rules the app ships (src/services/provider/streams.ts).
 * Fails loudly (exit 1) when the contract breaks.
 *
 * Public API, no key required. This script never logs signed CDN URLs
 * (tokens are stripped); it verifies metadata + stream descriptors only.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeStreamResponse, selectSource, qualityOptions } from "../src/services/provider/streams";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load EXPO_PUBLIC_* from .env (falls back to the committed public .env.example).
const envPath = existsSync(join(root, ".env")) ? join(root, ".env") : join(root, ".env.example");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^(EXPO_PUBLIC_[A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const BASE = process.env.PROVIDER_BASE_URL ?? "https://movieapi.zarhosting.dpdns.org/api/public/v1";
// The single verified media-header configuration (matches src/services/provider/client.ts).
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  Referer: "https://www.moviebox.ph/",
  Origin: "https://www.moviebox.ph",
  Accept: "application/json",
};

// Fixtures verified on 2026-11-03. If these drift, refresh from a live /home result — do not keep dead IDs.
let FIXTURE_MOVIE = { subjectId: "3773468085374568272", slug: "verity-eNHDBJtwKu4", title: "Verity" };
let FIXTURE_SERIES = { subjectId: "4780148614284956296", slug: "dead-end-job-oAmYsY887H5", title: "Dead-End Job" };

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

/** Strip signed-query tokens before any output: only hosts are ever printed. */
function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  // 1. Home catalogue
  try {
    const home = await getJson("/home");
    const sections = Array.isArray(home) ? home : home?.data ?? home?.sections ?? [];
    check("GET /home", sections.length > 0, `${sections.length} sections`);

    // Fixture self-heal: if a fixture id died, refresh from the live catalogue.
    const wanted = (name) => {
      for (const s of sections) {
        for (const i of s.items ?? []) {
          if ((i.name ?? "").startsWith(name)) return { subjectId: i.subject_id, slug: i.slug, title: i.name };
        }
      }
      return null;
    };
    for (const [fixture, name] of [[FIXTURE_MOVIE, FIXTURE_MOVIE.title], [FIXTURE_SERIES, FIXTURE_SERIES.title]]) {
      try {
        const d = await getJson(`/detail/${fixture.slug}`);
        if (!d?.data?.subject || d.data.subject.subjectId !== fixture.subjectId) throw new Error("drifted");
      } catch {
        const fresh = wanted(name);
        if (fresh) Object.assign(fixture, fresh);
      }
    }
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

  // 4. Stream normalization with the app's own rules — movie (se=0&ep=0).
  try {
    const st = await getJson(
      `/stream/${FIXTURE_MOVIE.subjectId}?detail_path=${FIXTURE_MOVIE.slug}&se=0&ep=0`,
    );
    const n = normalizeStreamResponse(st);
    const pick = selectSource(n.sources, null);
    const hosts = new Set(n.sources.map((s) => safeHost(s.url)));
    check(
      "GET /stream/{id} (movie) normalized",
      n.sources.length > 0 && n.sources.every((s) => s.url.startsWith("https://")),
      `${n.sources.length} sources (${qualityOptions(n.sources).join("/")}); default=${pick?.resolution ?? "none"}; host=${[...hosts][0] ?? "?"}`,
    );
    check(
      "movie default selection is full-length",
      Boolean(pick) && pick.verifiedFullLength === true,
      pick ? `${pick.resolution} · ${Math.round((pick.durationSeconds ?? 0) / 60)} min` : "no selection",
    );
  } catch (err) {
    check("GET /stream/{id} (movie) normalized", false, String(err.message));
  }

  // 5. Series episode — real season/episode params, and the selection must not be a preview.
  try {
    const st = await getJson(
      `/stream/${FIXTURE_SERIES.subjectId}?detail_path=${FIXTURE_SERIES.slug}&se=1&ep=1`,
    );
    const n = normalizeStreamResponse(st);
    const pick = selectSource(n.sources, null);
    check(
      "GET /stream/{id} (series S1E1) normalized",
      n.sources.length > 0 && !pick?.preview && pick?.verifiedFullLength === true,
      pick ? `${pick.resolution} · ${Math.round((pick.durationSeconds ?? 0) / 60)} min · not a preview` : "no selection",
    );
  } catch (err) {
    check("GET /stream/{id} (series S1E1) normalized", false, String(err.message));
  }

  // 6. Captions
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
