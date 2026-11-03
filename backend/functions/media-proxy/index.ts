/**
 * Media proxy — streams video bytes to the app.
 *
 * The provider's media CDN rejects or rate-limits many clients by header
 * fingerprint and IP, and hands out short-lived signed URLs. Instead of
 * fighting that per-client, the app points the player and downloader here:
 *
 *   GET /functions/v1/media-proxy?subject_id=…&detail_path=…&se=…&ep=…&resolution=360p
 *
 * The function resolves a FRESH signed URL server-side on every request
 * (signed URLs therefore never expire mid-download and never reach the
 * client), fetches the upstream bytes with the verified header profile, and
 * streams the response through, including Range requests for seeking.
 *
 * Security: this is not an open proxy. The only upstream hosts it will ever
 * touch are the ones the provider API itself returned for the given title —
 * caller-supplied URLs are never fetched.
 */

const PROVIDER_BASE = "https://movieapi.zarhosting.dpdns.org/api/public/v1";

// The single verified media-header configuration (kept in sync with
// src/services/provider/client.ts — tests fail if they drift).
const MEDIA_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  Referer: "https://www.moviebox.ph/",
  Origin: "https://www.moviebox.ph",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Minimal re-implementation of the app's normalization + selection rules. */
interface UpstreamSource {
  resolution?: unknown;
  url?: unknown;
  size?: unknown;
  duration?: unknown;
  format?: unknown;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
    // Reference apps sometimes ship "1.2 MB" style strings.
    const m = v.match(/([\d.]+)\s*(MB|GB|KB)/i);
    if (m) {
      const n2 = Number(m[1]);
      if (Number.isFinite(n2)) {
        const unit = m[2].toUpperCase();
        return n2 * (unit === "GB" ? 1e9 : unit === "MB" ? 1e6 : 1e3);
      }
    }
  }
  return null;
}

function normalizeSources(payload: unknown): { url: string; resolution: string; sizeBytes: number | null; durationSeconds: number | null }[] {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : {}) as Record<string, unknown>;
  if (root.has_resource === false || data.has_resource === false) return [];
  const rawList = root.sources ?? root.streams ?? data.sources ?? data.streams;
  if (!Array.isArray(rawList)) return [];
  const out: { url: string; resolution: string; sizeBytes: number | null; durationSeconds: number | null }[] = [];
  for (const raw of rawList as UpstreamSource[]) {
    const url = typeof raw?.url === "string" ? raw.url : "";
    if (!url.startsWith("https://")) continue;
    out.push({
      url,
      resolution: typeof raw.resolution === "string" ? raw.resolution : "",
      sizeBytes: toNum(raw.size),
      durationSeconds: toNum(raw.duration),
    });
  }
  return out;
}

function isPreview(resolution: string): boolean {
  return /mobile native|preview|trailer|sample|clip/i.test(resolution);
}

function isFullLength(sizeBytes: number | null, durationSeconds: number | null): boolean | null {
  const byDuration = durationSeconds !== null ? durationSeconds > 300 : null;
  const bySize = sizeBytes !== null ? sizeBytes > 50 * 1024 * 1024 : null;
  if (byDuration === false && bySize === false) return false;
  if (byDuration === true || bySize === true) return true;
  return null; // unverified
}

/** Pick by requested quality, else verified 360p, else lowest verified full-length. */
function pickSource(sources: ReturnType<typeof normalizeSources>, requested: string | null) {
  const pool = sources.filter((s) => !isPreview(s.resolution));
  const qualityValue = (r: string) => parseInt(r, 10) || 0;
  const verified = pool.filter((s) => isFullLength(s.sizeBytes, s.durationSeconds) === true);
  const target = verified.length > 0 ? verified : pool;
  if (target.length === 0) return null;
  if (requested) {
    const exact = target.find((s) => s.resolution === requested);
    if (exact) return exact;
  }
  const p360 = target.find((s) => qualityValue(s.resolution) === 360);
  if (p360) return p360;
  return [...target].sort((a, b) => qualityValue(a.resolution) - qualityValue(b.resolution))[0];
}

async function resolveUpstreamUrl(subjectId: string, detailPath: string, se: string, ep: string, resolution: string | null): Promise<string | null> {
  const qs = new URLSearchParams({ detail_path: detailPath, se, ep });
  const res = await fetch(`${PROVIDER_BASE}/stream/${encodeURIComponent(subjectId)}?${qs}`, {
    headers: { Accept: "application/json", ...MEDIA_HEADERS },
  });
  if (!res.ok) throw new Error(`provider stream resolve failed: HTTP ${res.status}`);
  const payload = await res.json();
  const sources = normalizeSources(payload);
  return pickSource(sources, resolution)?.url ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    const subjectId = url.searchParams.get("subject_id") ?? "";
    const detailPath = url.searchParams.get("detail_path") ?? "";
    const se = url.searchParams.get("se") ?? "0";
    const ep = url.searchParams.get("ep") ?? "0";
    const resolution = url.searchParams.get("resolution");
    if (!subjectId || !detailPath) return json({ error: "subject_id and detail_path are required" }, 400);

    const upstreamUrl = await resolveUpstreamUrl(subjectId, detailPath, se, ep, resolution);
    if (!upstreamUrl) return json({ error: "No selectable full-length source" }, 404);

    const headers: Record<string, string> = { ...MEDIA_HEADERS, Accept: "*/*" };
    const range = req.headers.get("Range");
    if (range) headers.Range = range;

    // Only bytes the provider itself pointed at for this title are streamed.
    const upstream = await fetch(upstreamUrl, { headers, redirect: "follow" });
    if (!upstream.ok || !upstream.body) {
      return json({ error: `Upstream refused the transfer (HTTP ${upstream.status})` }, 502);
    }

    const outHeaders = new Headers({
      ...corsHeaders,
      "Content-Type": upstream.headers.get("Content-Type") ?? "video/mp4",
      "Accept-Ranges": upstream.headers.get("Accept-Ranges") ?? "bytes",
      "Cache-Control": "no-store",
    });
    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength) outHeaders.set("Content-Length", contentLength);
    const contentRange = upstream.headers.get("Content-Range");
    if (contentRange) outHeaders.set("Content-Range", contentRange);

    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  } catch (err) {
    // Never log or echo the signed upstream URL.
    return json({ error: err instanceof Error ? err.message : "Proxy failure" }, 500);
  }
});
