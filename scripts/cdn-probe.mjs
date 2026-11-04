#!/usr/bin/env bun
/**
 * Direct CDN delivery diagnostics (development tool — not run in CI).
 * Resolves a fresh Zarhosting URL, then does a small ranged GET with the exact
 * media headers used by the player/downloader. Never prints the signed URL.
 *
 * Usage: bun scripts/cdn-probe.mjs <subjectId> <detailPath> [se] [ep]
 */
import { normalizeStreamResponse, selectSource, streamEndpoint } from "../src/services/provider/streams";

const BASE = "https://movieapi.zarhosting.dpdns.org/api/public/v1";
const [subjectId, detailPath, se = "0", ep = "0"] = process.argv.slice(2);
if (!subjectId || !detailPath) {
  console.error("usage: bun scripts/cdn-probe.mjs <subjectId> <detailPath> [se] [ep]");
  process.exit(1);
}

const API_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://moviebox.ph/",
  Accept: "application/json",
};
const MEDIA_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://moviebox.ph/",
  Origin: "https://moviebox.ph",
};

const apiRes = await fetch(`${BASE}${streamEndpoint(subjectId, detailPath, Number(se), Number(ep))}`, { headers: API_HEADERS });
console.log(`API /stream → HTTP ${apiRes.status}`);
if (!apiRes.ok) process.exit(1);
const n = normalizeStreamResponse(await apiRes.json());
const pick = selectSource(n.sources, null);
if (!pick) {
  console.error("No selectable full-length source.");
  process.exit(1);
}
console.log(`Selected: ${pick.resolution ?? pick.format} · ${pick.sizeBytes ?? "?"} bytes · host=${new URL(pick.url).host} (signed URL not printed)`);

const res = await fetch(pick.url, { headers: { ...MEDIA_HEADERS, Range: "bytes=0-2047" }, redirect: "follow" });
console.log(`Media ranged GET → HTTP ${res.status} · final host=${new URL(res.url).host}`);
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
