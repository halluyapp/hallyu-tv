#!/usr/bin/env bun
/**
 * CDN delivery diagnostics (development tool — NOT run in CI).
 *
 * A URL in the API response does not prove the CDN will serve media to the
 * Android player. This helper probes ONE media URL with a small ranged GET:
 *   - HTTP status and final host (never the full signed URL)
 *   - Content-Type / Content-Length / Accept-Ranges
 *   - whether media bytes actually arrive
 *   - whether the first bytes carry the MP4 "ftyp" signature
 *
 * Usage: bun scripts/cdn-probe.mjs <subjectId> <detailPath> <se> <ep>
 * A rejected HEAD is not final proof that playback is impossible; this tool
 * reports evidence, and a datacenter-IP block (e.g. HTTP 429) is an
 * environment limitation, not an app defect.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeStreamResponse, selectSource } from "../src/services/provider/streams";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = existsSync(join(root, ".env")) ? join(root, ".env") : join(root, ".env.example");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^(EXPO_PUBLIC_[A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const BASE = process.env.PROVIDER_BASE_URL ?? "https://movieapi.zarhosting.dpdns.org/api/public/v1";
const [subjectId, detailPath, se = "0", ep = "0"] = process.argv.slice(2);
if (!subjectId || !detailPath) {
  console.error("usage: bun scripts/cdn-probe.mjs <subjectId> <detailPath> [se] [ep]");
  process.exit(1);
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  Referer: "https://www.moviebox.ph/",
  Origin: "https://www.moviebox.ph",
  Accept: "application/json",
};

// 1. Resolve a fresh signed URL through the API.
const apiRes = await fetch(`${BASE}/stream/${subjectId}?detail_path=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`, { headers: HEADERS });
console.log(`API /stream → HTTP ${apiRes.status}`);
if (!apiRes.ok) process.exit(1);
const n = normalizeStreamResponse(await apiRes.json());
const pick = selectSource(n.sources, null);
if (!pick) {
  console.error("No selectable full-length source.");
  process.exit(1);
}
console.log(`Selected: ${pick.resolution} · ${pick.sizeBytes ?? "?"} bytes · host=${new URL(pick.url).host} (signed URL not printed)`);

// 2. Ranged GET of the first 2 KiB with the media headers playback uses.
const mediaHeaders = { ...HEADERS, Accept: "*/*" };
delete mediaHeaders.Accept;
const res = await fetch(pick.url, { headers: { ...mediaHeaders, Range: "bytes=0-2047" }, redirect: "follow" });
const finalHost = new URL(res.url).host;
console.log(`Media ranged GET → HTTP ${res.status} · final host=${finalHost}`);
console.log(`  Content-Type: ${res.headers.get("content-type") ?? "(none)"}`);
console.log(`  Content-Length: ${res.headers.get("content-length") ?? "(none)"}`);
console.log(`  Accept-Ranges: ${res.headers.get("accept-ranges") ?? "(none)"}`);
console.log(`  Content-Range: ${res.headers.get("content-range") ?? "(none)"}`);

const buf = new Uint8Array(await res.arrayBuffer());
console.log(`  Body bytes received: ${buf.byteLength}`);
if (buf.byteLength >= 8) {
  const ftyp = buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
  console.log(`  MP4 "ftyp" signature at byte 4: ${ftyp ? "YES" : "NO"}`);
} else {
  console.log('  Too few bytes to check the MP4 "ftyp" signature.');
}
console.log("\nNote: a 429 here means this datacenter IP is rate-limited by the CDN — an environment limitation, not an app defect.");
