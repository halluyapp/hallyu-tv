import { PROVIDER_MEDIA_HEADERS } from "./client";
import type { StreamSource } from "@/types/provider";

/**
 * Media transport selection.
 *
 * Two ways to reach the bytes:
 *  - direct: the CDN's signed URL with the verified media headers. Fastest
 *    path; works from the networks phones actually use. Datacenter networks
 *    are rate-limited by the CDN (HTTP 429), which is why a server proxy
 *    exists.
 *  - proxy: the media-proxy Worker re-resolves a fresh signed URL server-side
 *    and streams the bytes. No headers needed, signed URLs never reach the
 *    client, and URLs cannot expire mid-transfer. Used automatically when
 *    direct playback is refused.
 */

export const MEDIA_PROXY_BASE =
  process.env.EXPO_PUBLIC_MEDIA_PROXY_URL ?? "https://tmm1xojnlt3p8gfm6c1xf-backend.rork.app/media";

export interface TransportUri {
  uri: string;
  headers?: Record<string, string>;
  label: "direct" | "proxy";
}

export interface StreamContext {
  subjectId: string;
  detailPath: string;
  season: number;
  episode: number;
}

/** The proxy URL for one title/quality. The proxy resolves the signed URL itself. */
export function proxyUri(source: StreamSource, ctx: StreamContext): string {
  const qs = new URLSearchParams({
    subject_id: ctx.subjectId,
    detail_path: ctx.detailPath,
    se: String(ctx.season),
    ep: String(ctx.episode),
    resolution: source.resolution ?? "",
  });
  return `${MEDIA_PROXY_BASE}?${qs.toString()}`;
}

/**
 * Failover chain for one source: direct first (fastest, works on residential
 * networks), then the proxy. Callers walk the chain on transport-class
 * failures so a throttled client still plays.
 */
export function transportChain(source: StreamSource, ctx: StreamContext): TransportUri[] {
  const chain: TransportUri[] = [{ uri: source.url, headers: { ...PROVIDER_MEDIA_HEADERS }, label: "direct" }];
  chain.push({ uri: proxyUri(source, ctx), label: "proxy" });
  return chain;
}
