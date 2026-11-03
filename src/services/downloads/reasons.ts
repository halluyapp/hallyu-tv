/**
 * Pure helpers for the download pipeline — no vendor imports, so they are
 * unit-testable and shared by the native (DownloadManager) and JS engines.
 */

/**
 * Stable identity for one title/episode download. The native engine uses it
 * as the SharedPreferences key and file name, so re-enqueueing replaces the
 * previous attempt instead of stacking duplicates.
 */
export function downloadKey(subjectId: string, season: number, episode: number): string {
  return `${subjectId}_${season}_${episode}`;
}

/** Android DownloadManager status codes (android.app.DownloadManager). */
export const DM_STATUS = {
  RUNNING: 1,
  PAUSED: 4,
  SUCCESSFUL: 8,
  FAILED: 16,
} as const;

/** Android DownloadManager pause/error reason codes (COLUMN_REASON). */
export const DM_REASON = {
  WAITING_FOR_NETWORK: 2,
  QUEUED_FOR_WIFI: 3,
  WAITING_TO_RETRY: 4,
  PAUSED_UNKNOWN: 5,
  ERROR_UNKNOWN: 1,
  ERROR_FILE_ERROR: 1001,
  ERROR_UNHANDLED_HTTP_CODE: 1002,
  ERROR_DEVICE_NOT_FOUND: 1003,
  ERROR_HTTP_DATA_ERROR: 1004,
  ERROR_TOO_MANY_REDIRECTS: 1005,
  ERROR_INSUFFICIENT_SPACE: 1006,
  ERROR_CANNOT_RESUME: 1008,
  ERROR_BLOCKED: 1010,
} as const;

/**
 * Turn a (status, reason) pair into one plain sentence with no link/token and
 * no jargon. Retryable failures point at retry, because a fresh signed URL
 * fixes most of them.
 */
export function reasonMessage(status: number, reason: number): string {
  if (status === 8 /* SUCCESSFUL */) return "Download complete";
  switch (reason) {
    case DM_REASON.ERROR_INSUFFICIENT_SPACE:
      return "There is not enough free storage for this download. Free up space, then tap retry.";
    case DM_REASON.ERROR_UNHANDLED_HTTP_CODE:
    case DM_REASON.ERROR_HTTP_DATA_ERROR:
      return "The server refused this download. Tap retry to get a fresh link.";
    case DM_REASON.ERROR_TOO_MANY_REDIRECTS:
      return "The download link kept redirecting. Tap retry to get a fresh link.";
    case DM_REASON.ERROR_CANNOT_RESUME:
      return "Android could not resume this download. Tap retry to start it again.";
    case DM_REASON.ERROR_DEVICE_NOT_FOUND:
      return "The storage for this app is not available right now. Tap retry.";
    case DM_REASON.ERROR_FILE_ERROR:
      return "The file could not be written to storage. Tap retry.";
    case DM_REASON.ERROR_BLOCKED:
      return "Android blocked this download. Check your network, then tap retry.";
    case DM_REASON.WAITING_FOR_NETWORK:
    case DM_REASON.QUEUED_FOR_WIFI:
      return "Waiting for a network connection…";
    case DM_REASON.WAITING_TO_RETRY:
      return "The download stopped briefly and will continue automatically.";
    default:
      return "The download stopped. Tap retry to start it again.";
  }
}

/**
 * Size sanity check before a transfer is promoted to "completed": match the
 * provider-reported size within 2% (container metadata drift), and accept
 * when no expectation is known. Zero bytes is never acceptable.
 */
export function sizeWithinTolerance(actual: number, expected: number | null): boolean {
  if (!Number.isFinite(actual) || actual < 1024) return false;
  if (expected === null || expected <= 0) return true;
  const low = expected * 0.98;
  const high = expected * 1.02;
  return actual >= low && actual <= high;
}
