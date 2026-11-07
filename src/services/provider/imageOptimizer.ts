import { PROVIDER_MEDIA_HEADERS } from "./client";

/**
 * Right-sized CDN image URL optimizer & request header profile for Moviebox /
 * Zarhosting artwork.
 *
 * Why posters previously took seconds to appear on real phones & TVs:
 * 1. Glide's default `okhttp/...` User-Agent without `Referer: https://moviebox.ph/`
 *    gets throttled or cold-routed on Moviebox/Aoneroom CDNs.
 * 2. Raw `cover.url` assets on Alibaba Cloud OSS (`pbcdnw.aoneroom.com`, etc.)
 *    are uncompressed 1080x1600–2000x3000 JPEGs/PNGs (1–3.5 MB EACH!). Loading
 *    25 posters on Home meant downloading ~45 MB over mobile data.
 *
 * `optimizeImageUrl` requests right-sized WebP derivatives (~18–24 KB for poster
 * cards — 70x smaller!) on known OSS/TMDB hosts, and automatically disables
 * resizing per-host (`markResizeUnsupportedForUrl`) if a host ever rejects the
 * query suffix so images NEVER break.
 */

export type ImageSizeKind = "ambient" | "avatar" | "poster" | "hero";

export const IMAGE_REQUEST_HEADERS: Readonly<Record<string, string>> = {
  "User-Agent": PROVIDER_MEDIA_HEADERS["User-Agent"] ?? "Mozilla/5.0",
  Referer: PROVIDER_MEDIA_HEADERS.Referer ?? "https://moviebox.ph/",
};

const OSS_RESIZE_SPECS: Record<ImageSizeKind, string> = {
  ambient: "x-oss-process=image/resize,m_lfit,w_120/quality,q_55/format,webp",
  avatar: "x-oss-process=image/resize,m_lfit,w_160/quality,q_74/format,webp",
  poster: "x-oss-process=image/resize,m_lfit,w_340/quality,q_78/format,webp",
  hero: "x-oss-process=image/resize,m_lfit,w_780/quality,q_82/format,webp",
};

const TMDB_SIZE_SPECS: Record<ImageSizeKind, string> = {
  ambient: "w185",
  avatar: "w185",
  poster: "w342",
  hero: "w780",
};

const OSS_HOST_RE = /(?:^|\.)(?:aoneroom\.com|hakunaymatata\.com|aliyuncs\.com|alicdn\.com|moviebox\.ph)$/i;

const unsupportedResizeHosts = new Set<string>();

export function resetUnsupportedResizeHosts(): void {
  unsupportedResizeHosts.clear();
}

export function markResizeUnsupportedForUrl(rawUrl: string | null | undefined): void {
  if (!rawUrl) return;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host) unsupportedResizeHosts.add(host);
  } catch {
    // Ignore malformed URLs
  }
}

export function optimizeImageUrl(
  rawUrl: string | null | undefined,
  kind: ImageSizeKind = "poster",
): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("file://") || trimmed.startsWith("data:")) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (unsupportedResizeHosts.has(host)) {
      return trimmed;
    }

    // Alibaba Cloud OSS / Moviebox Aoneroom CDN (only when unsigned / query-free)
    if (!parsed.search && OSS_HOST_RE.test(host)) {
      return `${trimmed}?${OSS_RESIZE_SPECS[kind]}`;
    }

    // TMDB original-size fallback rewrite
    if (host === "image.tmdb.org" && parsed.pathname.includes("/t/p/original/")) {
      parsed.pathname = parsed.pathname.replace("/t/p/original/", `/t/p/${TMDB_SIZE_SPECS[kind]}/`);
      return parsed.toString();
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}
