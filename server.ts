import compression from "compression";
import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import sharp from "sharp";

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const PROVIDER_BASE_URL = "https://movieapi.zarhosting.dpdns.org/api/public/v1";

const PROVIDER_API_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://moviebox.ph/",
  Accept: "application/json",
};

const PROVIDER_MEDIA_HEADERS: Record<string, string> = {
  "User-Agent": "ExoPlayerLib/2.19.1",
  Referer: "https://www.movieboxpro.app/",
  Origin: "https://www.movieboxpro.app",
  Accept: "*/*",
  "Accept-Encoding": "identity",
};

/**
 * The hakunaymatata media CDN rejects browser-style requests with
 * 426/428/429. Try the documented ExoPlayer/movieboxpro profile first, then
 * progressively older profiles, so a CDN header rotation cannot break
 * playback again.
 */
const MEDIA_HEADER_PROFILES: ReadonlyArray<Record<string, string>> = [
  PROVIDER_MEDIA_HEADERS,
  {
    "User-Agent": "MovieBoxPro/16.2.1 (Android 12; Pixel 6)",
    Referer: "https://www.movieboxpro.app/",
    Origin: "https://www.movieboxpro.app",
  },
  {
    "User-Agent": "ExoPlayerLib/2.19.1",
    Referer: "https://moviebox.ph/",
    Origin: "https://moviebox.ph",
  },
  {
    "User-Agent": "Mozilla/5.0",
    Referer: "https://moviebox.ph/",
    Origin: "https://moviebox.ph",
  },
  { "User-Agent": "Mozilla/5.0" },
];

function isMediaHeaderRejection(status: number): boolean {
  return status === 401 || status === 403 || status === 426 || status === 428 || status === 429;
}

interface MediaUpstream {
  res: Response;
  profile: Record<string, string>;
  profileIndex: number;
}

/**
 * Fetch a CDN media/caption URL, rotating header profiles until one is
 * accepted. Returns the first non-rejection response (including 404/416, which
 * are meaningful to the caller), or the last rejection if every profile fails.
 */
async function fetchMediaWithProfiles(
  url: string,
  extraHeaders: Record<string, string>,
  signal: AbortSignal,
): Promise<MediaUpstream | null> {
  let last: MediaUpstream | null = null;
  for (let i = 0; i < MEDIA_HEADER_PROFILES.length; i++) {
    if (signal.aborted) break;
    const profile = MEDIA_HEADER_PROFILES[i];
    if (!profile) break;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { ...profile, ...extraHeaders },
        signal,
        redirect: "follow",
      });
    } catch {
      if (signal.aborted) break;
      continue;
    }
    last = { res, profile, profileIndex: i };
    if (!isMediaHeaderRejection(res.status)) return last;
    // Drain the rejection body so the socket is released before the next try.
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
  }
  return last;
}

const HARVEST_SEED_PARAMS: { query: string; pages: number }[] = [
  { query: "korean", pages: 2 },
  { query: "k-drama", pages: 2 },
  { query: "chinese drama", pages: 2 },
  { query: "cdrama", pages: 2 },
  { query: "anime", pages: 2 },
];
const HARVEST_PAGE_SIZE = 60;

// Server-side SWR cache for the heavy initial catalogue (/home + 10 seed queries).
const CATALOGUE_FRESH_MS = 5 * 60_000;
const CATALOGUE_STALE_MS = 30 * 60_000;

interface CatalogueCacheEntry {
  at: number;
  etag: string;
  payload: string;
}

let catalogueCache: CatalogueCacheEntry | null = null;
let catalogueInflight: Promise<CatalogueCacheEntry> | null = null;

// Short-lived in-memory cache for read-heavy provider JSON (details & search).
const API_CACHE_MAX = 250;
const API_CACHE_TTL_MS = 90_000;
const apiResponseCache = new Map<string, { at: number; contentType: string; body: string }>();

// Bounded LRU cache for optimized poster/backdrop images.
const IMG_CACHE_MAX_ITEMS = 320;
const IMG_CACHE_MAX_BYTES = 48 * 1024 * 1024;
interface CachedImage {
  buf: Buffer;
  contentType: string;
  etag: string;
  at: number;
}
const imgCache = new Map<string, CachedImage>();
let imgCacheTotalBytes = 0;
const imgInflight = new Map<string, Promise<CachedImage | null>>();

function getCachedImage(key: string): CachedImage | undefined {
  const hit = imgCache.get(key);
  if (!hit) return undefined;
  // Refresh LRU recency.
  imgCache.delete(key);
  imgCache.set(key, hit);
  return hit;
}

function setCachedImage(key: string, entry: CachedImage): void {
  if (entry.buf.byteLength > 2 * 1024 * 1024) return;
  const existing = imgCache.get(key);
  if (existing) {
    imgCacheTotalBytes -= existing.buf.byteLength;
    imgCache.delete(key);
  }
  imgCache.set(key, entry);
  imgCacheTotalBytes += entry.buf.byteLength;
  while (imgCache.size > IMG_CACHE_MAX_ITEMS || imgCacheTotalBytes > IMG_CACHE_MAX_BYTES) {
    const oldest = imgCache.keys().next().value;
    if (!oldest) break;
    const removed = imgCache.get(oldest);
    imgCache.delete(oldest);
    if (removed) imgCacheTotalBytes -= removed.buf.byteLength;
  }
}

function isSafeRemoteHttpsUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "0.0.0.0" ||
      h === "::1" ||
      h.endsWith(".local") ||
      h.startsWith("10.") ||
      h.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      h.startsWith("169.254.")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 15_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: PROVIDER_API_HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function refreshCatalogueCache(): Promise<CatalogueCacheEntry> {
  if (catalogueInflight) return catalogueInflight;

  catalogueInflight = (async () => {
    const homePromise = fetchJsonWithTimeout(`${PROVIDER_BASE_URL}/home`, 18_000);
    const seedDescriptors: { query: string; page: number; url: string }[] = [];
    for (const seed of HARVEST_SEED_PARAMS) {
      for (let page = 1; page <= seed.pages; page++) {
        const qs = new URLSearchParams({
          q: seed.query,
          page: String(page),
          per_page: String(HARVEST_PAGE_SIZE),
        });
        seedDescriptors.push({
          query: seed.query,
          page,
          url: `${PROVIDER_BASE_URL}/search?${qs.toString()}`,
        });
      }
    }

    const [homeRaw, ...seedResults] = await Promise.allSettled([
      homePromise,
      ...seedDescriptors.map((s) => fetchJsonWithTimeout(s.url, 15_000)),
    ]);

    if (homeRaw.status === "rejected") {
      if (catalogueCache) return catalogueCache;
      throw homeRaw.reason;
    }

    const seeds = seedDescriptors.map((desc, idx) => {
      const outcome = seedResults[idx];
      return {
        query: desc.query,
        page: desc.page,
        raw: outcome?.status === "fulfilled" ? outcome.value : null,
      };
    });

    const at = Date.now();
    const payload = JSON.stringify({
      at,
      home: homeRaw.value,
      seeds,
    });
    const etag = `"cat-${crypto.createHash("sha1").update(payload).digest("hex").slice(0, 16)}"`;
    const entry: CatalogueCacheEntry = { at, etag, payload };
    catalogueCache = entry;
    return entry;
  })().finally(() => {
    catalogueInflight = null;
  });

  return catalogueInflight;
}

async function createApp() {
  const app = express();
  app.disable("x-powered-by");

  // Gzip/deflate JSON, HTML, CSS, and SVG payloads (never compress binary video streams).
  app.use(
    compression({
      filter: (req, res) => {
        if (req.path.startsWith("/api/proxy/media") || req.path.startsWith("/api/proxy/image")) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );

  // Serve bundled sound and image assets directly in both dev and prod.
  app.use("/assets", express.static(path.resolve(process.cwd(), "assets"), { maxAge: "7d" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "hallyu-tv" });
  });

  // Coalesced Server SWR Aggregator: serves /home + 10 harvest seeds in ONE compressed HTTP roundtrip.
  app.get("/api/catalogue", async (req, res) => {
    const force = req.query.refresh === "1";
    const now = Date.now();
    const cached = catalogueCache;

    if (!force && cached) {
      const age = now - cached.at;
      if (age < CATALOGUE_FRESH_MS) {
        if (req.headers["if-none-match"] === cached.etag) {
          res.status(304).end();
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("ETag", cached.etag);
        res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
        res.send(cached.payload);
        return;
      }
      if (age < CATALOGUE_STALE_MS) {
        void refreshCatalogueCache().catch(() => {});
        if (req.headers["if-none-match"] === cached.etag) {
          res.status(304).end();
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("ETag", cached.etag);
        res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
        res.send(cached.payload);
        return;
      }
    }

    try {
      const entry = await refreshCatalogueCache();
      if (req.headers["if-none-match"] === entry.etag) {
        res.status(304).end();
        return;
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("ETag", entry.etag);
      res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
      res.send(entry.payload);
    } catch {
      res.status(502).json({ error: "Could not load catalogue from provider" });
    }
  });

  // Zarhosting public API proxy — injects required User-Agent & Referer headers and caches read endpoints briefly.
  app.use("/api/provider", async (req, res) => {
    const upstreamPath = req.url.startsWith("/") ? req.url : `/${req.url}`;
    const isCacheable = upstreamPath.startsWith("/detail/") || upstreamPath.startsWith("/search");
    if (isCacheable) {
      const hit = apiResponseCache.get(upstreamPath);
      if (hit && Date.now() - hit.at < API_CACHE_TTL_MS) {
        res.status(200);
        res.setHeader("Content-Type", hit.contentType);
        res.setHeader("Cache-Control", "public, max-age=60");
        res.send(hit.body);
        return;
      }
    }

    const targetUrl = `${PROVIDER_BASE_URL}${upstreamPath}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    req.on("close", () => controller.abort());

    try {
      const upstream = await fetch(targetUrl, {
        method: "GET",
        headers: PROVIDER_API_HEADERS,
        signal: controller.signal,
      });
      res.status(upstream.status);
      const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", isCacheable && upstream.ok ? "public, max-age=60" : "no-store");
      const text = await upstream.text();

      if (isCacheable && upstream.ok && text.length < 512_000) {
        if (apiResponseCache.size >= API_CACHE_MAX) {
          const oldest = apiResponseCache.keys().next().value;
          if (oldest) apiResponseCache.delete(oldest);
        }
        apiResponseCache.set(upstreamPath, { at: Date.now(), contentType, body: text });
      }
      res.send(text);
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: "Provider request failed" });
      }
    } finally {
      clearTimeout(timeout);
    }
  });

  // Caption proxy — fetches SRT/VTT files with CDN media headers.
  app.get("/api/proxy/caption", async (req, res) => {
    const url = req.query.url;
    if (!isSafeRemoteHttpsUrl(url)) {
      res.status(400).json({ error: "Invalid caption URL" });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    req.on("close", () => controller.abort());

    try {
      const upstream = await fetchMediaWithProfiles(url, {}, controller.signal);
      if (!upstream) {
        if (!res.headersSent) res.status(502).send("Caption fetch failed");
        return;
      }
      res.status(upstream.res.status);
      res.setHeader("Content-Type", upstream.res.headers.get("content-type") || "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      const text = await upstream.res.text();
      res.send(text);
    } catch {
      if (!res.headersSent) res.status(502).send("Caption fetch failed");
    } finally {
      clearTimeout(timeout);
    }
  });

  // Optimized image proxy for mobile/Android & desktop: resizes huge 2000-4600px posters to clean WebP/JPEG thumbnails + LRU cache + ETag.
  app.get("/api/proxy/image", async (req, res) => {
    const url = req.query.url;
    if (!isSafeRemoteHttpsUrl(url)) {
      res.status(400).end();
      return;
    }

    const rawW = Number(req.query.w);
    const width = Number.isFinite(rawW) && rawW > 0 ? Math.min(1280, Math.max(80, Math.round(rawW))) : 360;
    const rawQ = Number(req.query.q);
    const quality = Number.isFinite(rawQ) && rawQ > 0 ? Math.min(92, Math.max(45, Math.round(rawQ))) : 78;
    const accept = String(req.headers.accept ?? "");
    const wantsWebp = req.query.fmt !== "jpeg" && (accept.includes("image/webp") || accept.includes("*/*") || accept === "");
    const fmt = wantsWebp ? "webp" : "jpeg";
    const cacheKey = `${fmt}:${width}:${quality}:${url}`;

    const cached = getCachedImage(cacheKey);
    if (cached) {
      if (req.headers["if-none-match"] === cached.etag) {
        res.status(304).end();
        return;
      }
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("ETag", cached.etag);
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      res.send(cached.buf);
      return;
    }

    let pending = imgInflight.get(cacheKey);
    if (!pending) {
      pending = (async (): Promise<CachedImage | null> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 16_000);
        try {
          const upstream = await fetch(url, { headers: PROVIDER_MEDIA_HEADERS, signal: controller.signal });
          if (!upstream.ok) return null;
          const rawBuf = Buffer.from(await upstream.arrayBuffer());
          const origCt = upstream.headers.get("content-type") || "image/jpeg";

          let outBuf = rawBuf;
          let outCt = origCt;
          try {
            const pipeline = sharp(rawBuf, { failOn: "none" })
              .rotate()
              .resize({ width, withoutEnlargement: true });
            outBuf =
              fmt === "webp"
                ? await pipeline.webp({ quality, effort: 3 }).toBuffer()
                : await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
            outCt = fmt === "webp" ? "image/webp" : "image/jpeg";
          } catch {
            // Fall back to raw bytes if an upstream asset uses an unsupported format.
            outBuf = rawBuf;
            outCt = origCt;
          }

          const etag = `"img-${crypto.createHash("sha1").update(outBuf).digest("hex").slice(0, 14)}"`;
          const entry: CachedImage = { buf: outBuf, contentType: outCt, etag, at: Date.now() };
          setCachedImage(cacheKey, entry);
          return entry;
        } catch {
          return null;
        } finally {
          clearTimeout(timeout);
        }
      })().finally(() => {
        imgInflight.delete(cacheKey);
      });
      imgInflight.set(cacheKey, pending);
    }

    const result = await pending;
    if (!result) {
      if (!res.headersSent) res.status(502).end();
      return;
    }
    if (req.headers["if-none-match"] === result.etag) {
      res.status(304).end();
      return;
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("ETag", result.etag);
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.send(result.buf);
  });

  // Media streaming & download proxy — forwards Range headers for seeking and byte-resumable offline downloads.
  app.get("/api/proxy/media", async (req, res) => {
    const url = req.query.url;
    if (!isSafeRemoteHttpsUrl(url)) {
      res.status(400).json({ error: "Invalid media URL" });
      return;
    }

    const headers: Record<string, string> = {};
    if (typeof req.headers.range === "string") {
      headers.Range = req.headers.range;
    }
    if (typeof req.headers["if-range"] === "string") {
      headers["If-Range"] = req.headers["if-range"];
    }

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    try {
      let upstream = await fetchMediaWithProfiles(url, headers, controller.signal);
      // The CDN throttles bursts with 426/428/429. Give it two short retries
      // before surfacing a failure so a transient throttle does not kill
      // playback mid-stream.
      for (let attempt = 0; attempt < 2 && upstream; attempt += 1) {
        if (!isMediaHeaderRejection(upstream.res.status)) break;
        if (controller.signal.aborted) break;
        try {
          await upstream.res.body?.cancel();
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        if (controller.signal.aborted) break;
        upstream = await fetchMediaWithProfiles(url, headers, controller.signal);
      }
      if (!upstream) {
        if (!res.headersSent) res.status(502).json({ error: "Media stream failed" });
        return;
      }
      const { res: media } = upstream;
      if (isMediaHeaderRejection(media.status)) {
        // Every header profile was refused: the CDN is throttling this egress.
        // 503 + Retry-After lets the client back off and try direct playback.
        res.setHeader("Retry-After", "3");
        res.setHeader("X-Media-Blocked", "cdn-waf");
        res.status(503).json({ error: "Media CDN temporarily refused this stream", retryAfter: 3 });
        return;
      }
      res.status(media.status);
      res.setHeader("X-Media-Profile", String(upstream.profileIndex));
      const forwardHeaders = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
      ];
      for (const name of forwardHeaders) {
        const val = media.headers.get(name);
        if (val) res.setHeader(name, val);
      }
      if (!media.headers.get("accept-ranges")) {
        res.setHeader("Accept-Ranges", "bytes");
      }

      if (req.query.download === "1") {
        const rawName = typeof req.query.filename === "string" ? req.query.filename : "hallyu-video.mp4";
        const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "_");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      }

      if (!media.body) {
        res.end();
        return;
      }
      const nodeStream = Readable.fromWeb(media.body as unknown as WebReadableStream);
      nodeStream.on("error", () => {
        if (!res.headersSent) res.status(502).end();
        else res.destroy();
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: "Media stream failed" });
      }
    }
  });

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      const indexFile = path.join(distDir, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Build not found");
      }
    });
  }

  return app;
}

createApp()
  .then((app) => {
    app.listen(PORT, HOST, () => {
      console.log(`Hallyu TV listening on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
