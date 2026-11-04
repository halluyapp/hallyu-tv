#!/usr/bin/env bun
/**
 * Live Zarhosting contract verification. Run locally with
 * `bun run verify:provider` or in CI. Uses the app's exact API headers and
 * shared normalization/selection rules. Never logs signed media URLs.
 */
import { normalizeStreamResponse, selectSource, selectDownloadSource, qualityOptions, streamEndpoint } from "../src/services/provider/streams";

const BASE = "https://movieapi.zarhosting.dpdns.org/api/public/v1";
const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://moviebox.ph/",
  Accept: "application/json",
};

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function getJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${BASE}${path}`, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}

function unwrap(raw) {
  return raw && typeof raw === "object" && raw.data && typeof raw.data === "object" ? raw.data : raw;
}

async function main() {
  let movie = null;
  let series = null;

  try {
    const home = unwrap(await getJson("/home"));
    const sections = Array.isArray(home.sections) ? home.sections : [];
    check("GET /home", sections.length > 0, `${sections.length} sections`);
    for (const section of sections) {
      for (const item of section.items ?? []) {
        const candidate = {
          subjectId: item.subject_id ?? item.subjectId,
          slug: item.slug ?? item.detail_path ?? item.detailPath,
          title: item.name ?? item.title,
          type: item.type,
        };
        if (!candidate.subjectId || !candidate.slug) continue;
        if (!movie && candidate.type !== "series" && candidate.type !== "tv") movie = candidate;
        if (!series && (candidate.type === "series" || candidate.type === "tv")) series = candidate;
      }
    }
  } catch (err) {
    check("GET /home", false, String(err.message));
  }

  try {
    const search = unwrap(await getJson("/search?q=love&page=1"));
    const items = Array.isArray(search.items) ? search.items : Array.isArray(search.results) ? search.results : [];
    check("GET /search", items.length > 0, `${items.length} results`);
    if (!movie || !series) {
      for (const item of items) {
        const candidate = {
          subjectId: item.subject_id ?? item.subjectId,
          slug: item.slug ?? item.detail_path ?? item.detailPath,
          title: item.name ?? item.title,
          type: item.type,
        };
        if (!candidate.subjectId || !candidate.slug) continue;
        if (!movie && candidate.type !== "series" && candidate.type !== "tv") movie = candidate;
        if (!series && (candidate.type === "series" || candidate.type === "tv")) series = candidate;
      }
    }
  } catch (err) {
    check("GET /search", false, String(err.message));
  }

  if (!movie && !series) {
    check("catalogue fixtures", false, "no movie or series found to verify");
  }

  for (const [label, fixture, se, ep] of [
    ["movie", movie, 0, 0],
    ["series S1E1", series, 1, 1],
  ]) {
    if (!fixture) continue;
    try {
      const detail = unwrap(await getJson(`/detail/${encodeURIComponent(fixture.slug)}`));
      const subject = detail.subject ?? detail;
      check(`GET /detail (${label})`, Boolean(subject?.title || subject?.name), String(subject?.title ?? subject?.name ?? ""));
      const subjectId = subject?.subjectId ?? fixture.subjectId;
      const detailPath = subject?.detailPath ?? fixture.slug;

      const st = await getJson(streamEndpoint(subjectId, detailPath, se, ep));
      const n = normalizeStreamResponse(st);
      const pick = selectSource(n.sources, null);
      const download = selectDownloadSource(n.sources, null);
      check(
        `GET /stream (${label}) normalized`,
        n.sources.length > 0 && Boolean(pick) && !pick.preview,
        `${n.sources.length} sources (${qualityOptions(n.sources).join("/")}); default=${pick?.resolution ?? "none"}; host=${pick ? safeHost(pick.url) : "?"}`,
      );
      check(`downloadable MP4 (${label})`, Boolean(download), download?.resolution ?? "none");

      const cap = await getJson(`/stream/${encodeURIComponent(subjectId)}/captions?detail_path=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`);
      const capData = unwrap(cap);
      const captions = Array.isArray(capData.captions) ? capData.captions : Array.isArray(capData.subtitles) ? capData.subtitles : [];
      check(`GET /captions (${label})`, true, `${captions.length} tracks`);
    } catch (err) {
      check(`stream flow (${label})`, false, String(err.message));
    }
  }

  console.log(failures === 0 ? "\nProvider verification: ALL PASS" : `\nProvider verification: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
