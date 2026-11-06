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

const FAST_FIRST_TIMEOUT_MS = 8_500;
const RETRY_TIMEOUT_MS = 12_500;
const MAX_RETRIES = 2;

/** Deduplicates identical concurrent un-aborted GET calls across UI components. */
const inflightRequests = new Map<string, Promise<unknown>>();

function backoff(attempt: number): number {
  return Math.min(700 * 2 ** attempt, 2800) + Math.random() * 220;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function executeProviderFetch(
  path: string,
  opts: { timeoutMs?: number; retries?: number; signal?: AbortSignal },
): Promise<unknown> {
  const { timeoutMs, retries = MAX_RETRIES, signal } = opts;
  let lastError: Error = new ProviderError("network", "Network request failed");

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new ProviderError("network", "Request cancelled");
    const attemptTimeout = timeoutMs ?? (attempt === 0 ? FAST_FIRST_TIMEOUT_MS : RETRY_TIMEOUT_MS);
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, attemptTimeout);
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

export async function providerFetch(
  path: string,
  opts: { timeoutMs?: number; retries?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
  if (opts.signal) {
    return executeProviderFetch(path, opts);
  }
  const existing = inflightRequests.get(path);
  if (existing) return existing;

  const pending = executeProviderFetch(path, opts).finally(() => {
    inflightRequests.delete(path);
  });
  inflightRequests.set(path, pending);
  return pending;
}
