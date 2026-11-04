import { ProviderError } from "@/types/provider";

/**
 * Single HTTP client for the Zarhosting public API. The request contract is
 * fixed here so playback, downloads, captions and verification all agree.
 */

export const PROVIDER_BASE_URL = "https://movieapi.zarhosting.dpdns.org/api/public/v1";

/** Exact headers required by the stream resolver (and used for all API calls). */
export const PROVIDER_API_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://moviebox.ph/",
  Accept: "application/json",
};

/**
 * Headers for direct CDN media/caption-file transfers. Kept separate from the
 * JSON API contract; the native downloader mirrors these exactly.
 */
export const PROVIDER_MEDIA_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://moviebox.ph/",
  Origin: "https://moviebox.ph",
};

/**
 * Per-endpoint budgets. A single global timeout meant Details could block for
 * ~45s (15s x 3 attempts with backoff) before showing an error. Catalogue reads
 * fail fast and retry less; stream resolution keeps its generous budget because
 * the resolver is genuinely slower than the other endpoints.
 */
export const TIMEOUTS = {
  home: 12_000,
  search: 10_000,
  detail: 15_000,
  stream: 20_000,
  captions: 15_000,
} as const;

const API_TIMEOUT_MS = TIMEOUTS.home;
const MAX_RETRIES = 2;
/** Search is user-driven: one attempt, no retry storm while typing. */
export const SEARCH_RETRIES = 0;

function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 4000) + Math.random() * 300;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function providerFetch(
  path: string,
  opts: { timeoutMs?: number; retries?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
  const { timeoutMs = API_TIMEOUT_MS, retries = MAX_RETRIES, signal } = opts;
  let lastError: Error = new ProviderError("network", "Network request failed");

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new ProviderError("network", "Request cancelled");
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    try {
      const res = await fetch(`${PROVIDER_BASE_URL}${path}`, {
        headers: { ...PROVIDER_API_HEADERS },
        signal: controller.signal,
      });
      if (res.status === 404) throw new ProviderError("not_found", "This title could not be found.");
      if (!res.ok) {
        const err = new ProviderError("unavailable", `Provider responded with ${res.status}`);
        if (!isRetryableStatus(res.status)) throw err;
        lastError = err;
        if (attempt < retries) await new Promise((r) => setTimeout(r, backoff(attempt)));
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json") && !contentType.includes("+json")) {
        throw new ProviderError("invalid_response", "Provider returned an unexpected response.");
      }
      try {
        return await res.json();
      } catch {
        throw new ProviderError("invalid_response", "Provider returned malformed JSON.");
      }
    } catch (err) {
      if (signal?.aborted) throw new ProviderError("network", "Request cancelled");
      if (err instanceof ProviderError) {
        if (err.kind !== "unavailable" && err.kind !== "network") throw err;
        lastError = err;
      } else {
        lastError = timedOut
          ? new ProviderError("network", "The provider took too long to respond.")
          : new ProviderError("network", "Network request failed");
      }
      if (attempt < retries) await new Promise((r) => setTimeout(r, backoff(attempt)));
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError;
}
