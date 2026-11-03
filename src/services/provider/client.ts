import { ProviderError } from "@/types/provider";

/**
 * Low-level provider HTTP client. Provider-specific behaviour (base URL,
 * headers, timeouts, retries) lives here and nowhere else.
 */

export const PROVIDER_BASE_URL = "https://movieapi.zarhosting.dpdns.org/api/public/v1";

/**
 * Headers verified against the provider contract. The CDN may enforce
 * browser-style Referer/Origin on media requests; API calls pass them too —
 * harmless there, and required by some CDN edges on manifest/segment fetches.
 */
export const PROVIDER_MEDIA_HEADERS: Record<string, string> = {
  Referer: "https://www.moviebox.ph/",
  Origin: "https://www.moviebox.ph",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
};

const API_TIMEOUT_MS = 15_000;
const STREAM_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;

function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 4000) + Math.random() * 300;
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
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(`${PROVIDER_BASE_URL}${path}`, {
        headers: { Accept: "application/json", ...PROVIDER_MEDIA_HEADERS },
        signal: controller.signal,
      });
      if (res.status === 404) throw new ProviderError("not_found", "This title could not be found.");
      if (!res.ok) throw new ProviderError("unavailable", `Provider responded with ${res.status}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new ProviderError("invalid_response", "Provider returned an unexpected response.");
      }
      return await res.json();
    } catch (err) {
      if (err instanceof ProviderError && (err.kind === "not_found" || err.kind === "invalid_response")) {
        throw err; // not retryable
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) await new Promise((r) => setTimeout(r, backoff(attempt)));
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError;
}
