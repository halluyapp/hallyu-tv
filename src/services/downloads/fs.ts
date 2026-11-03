import { LegacyFileSystem as FS, AsyncStorage } from "./native";
import { DOWNLOADS_DIR, absolutePath } from "./paths";
import type { DownloadResumable } from "expo-file-system/legacy";
import type { DownloadJob } from "./types";

/**
 * Thin wrapper over the platform file system + registry storage. Isolated so
 * the state machine never touches vendor APIs directly. Uses the stable
 * "legacy" surface of expo-file-system (SDK 54) which exposes plain
 * documentDirectory paths and resumable download tasks.
 */

export { DOWNLOADS_DIR };
const REGISTRY_KEY = "download_jobs_v1";
const BASE_DIR = `${FS.documentDirectory ?? ""}${DOWNLOADS_DIR}`;

/** Map a registry-relative path ("downloads/x.mp4") to an absolute file URI. */
export function absolutePathFor(relative: string): string {
  return absolutePath(BASE_DIR, relative);
}

export const LegacyFileSystem = {
  REGISTRY_KEY,

  async ensureDir(): Promise<void> {
    const dir = await FS.getInfoAsync(BASE_DIR);
    if (!dir.exists) {
      await FS.makeDirectoryAsync(BASE_DIR, { intermediates: true });
    }
  },

  async readRegistry(): Promise<unknown> {
    try {
      const raw = await AsyncStorage.getItem(REGISTRY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async writeRegistry(jobs: DownloadJob[]): Promise<void> {
    await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(jobs));
  },

  async deleteFile(path: string): Promise<void> {
    try {
      // Registry stores relative paths; resolve any form before touching disk.
      const target = path.startsWith(DOWNLOADS_DIR) ? absolutePathFor(path) : path;
      const info = await FS.getInfoAsync(target);
      if (info.exists) await FS.deleteAsync(target, { idempotent: true });
    } catch (err) {
      console.error("deleteFile failed:", err);
    }
  },

  /** Free-disk headroom in bytes, when the platform reports it. null = unknown. */
  async freeDiskBytes(): Promise<number | null> {
    try {
      const info = await FS.getFreeDiskStorageAsync();
      return typeof info === "number" ? info : null;
    } catch {
      return null;
    }
  },

  /**
   * Validate the completed .part file before promoting it:
   *  1. exists and is non-trivial (>1KB),
   *  2. when the provider reported an expected size, matches within tolerance,
   *  3. starts with an MP4 "ftyp" box signature (best-effort read).
   * On success it is moved to its final name atomically (rename in same dir).
   */
  async finalizePart(partPath: string, finalPath: string, expectedBytes?: number | null): Promise<boolean> {
    try {
      const from = absolutePathFor(partPath);
      const to = absolutePathFor(finalPath);
      const info = await FS.getInfoAsync(from);
      if (!info.exists || info.size === undefined || info.size < 1024) {
        return false;
      }
      if (typeof expectedBytes === "number" && expectedBytes > 0) {
        // Tolerate ±2% container metadata drift; a truncated transfer fails here.
        const low = expectedBytes * 0.98;
        const high = expectedBytes * 1.02;
        if (info.size < low || info.size > high) {
          console.error(`finalizePart size mismatch: got ${info.size}, expected ~${expectedBytes}`);
          return false;
        }
      }
      if (!(await hasMp4Signature(from))) {
        console.error("finalizePart: file does not start with an MP4 ftyp signature");
        return false;
      }
      await FS.moveAsync({ from, to });
      return true;
    } catch (err) {
      console.error("finalizePart failed:", err);
      return false;
    }
  },

  createDownloadTask(
    job: DownloadJob,
    onProgress: (received: number, total: number) => void,
    onComplete: () => void,
    onError: (reason: string) => void,
  ): { start: () => void; pause: () => void; resume: () => void; cancel: () => void } {
    let task: DownloadResumable;
    try {
      task = FS.createDownloadResumable(
        job.source.url,
        absolutePathFor(job.partPath),
        { headers: jobHeaders(job) },
        (progress) => {
          onProgress(
            progress.totalBytesWritten,
            progress.totalBytesExpectedToWrite,
          );
        },
      );
    } catch (err) {
      console.error("createDownloadResumable failed:", err);
      onError("Download could not start");
      return { start: () => {}, pause: () => {}, resume: () => {}, cancel: () => {} };
    }

    return {
      start: () => {
        task
          .downloadAsync()
          .then((result) => {
            const status = result && "status" in result ? result.status : 0;
            if (status === 200 || status === 206) onComplete();
            else onError(`Server responded ${status || "unexpectedly"}`);
          })
          .catch((err: Error) => {
            const msg = err?.message ?? "";
            if (msg.includes("cancel")) onError("cancelled");
            else if (msg.includes("pause")) onError("paused");
            else onError(msg || "Network error during download");
          });
      },
      pause: () => {
        task.pauseAsync().catch((err: unknown) => console.error("pause failed:", err));
      },
      resume: () => {
        task.resumeAsync().catch((err: unknown) => console.error("resume failed:", err));
      },
      cancel: () => {
        task.cancelAsync().catch((err: unknown) => console.error("cancel failed:", err));
      },
    };
  },
};

/** Best-effort MP4 signature probe. Returns true when the check cannot run. */
async function hasMp4Signature(uri: string): Promise<boolean> {
  try {
    const head = await FS.readAsStringAsync(uri, {
      position: 0,
      length: 16,
      encoding: "base64",
    });
    const bytes = decodeBase64Bytes(head);
    // "ftyp" = 0x66 0x74 0x79 0x70 at offset 4 of every MP4/ISO-BMFF file.
    return (
      bytes.length >= 8 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    );
  } catch {
    // Platform cannot do partial binary reads — rely on size checks only.
    return true;
  }
}

/** Minimal base64 decoder for short prefixes (Hermes has no Buffer/atob). */
function decodeBase64Bytes(b64: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = b64.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = clean[i] ?? "A";
    const c1 = clean[i + 1] ?? "A";
    const c2 = clean[i + 2] ?? "A";
    const c3 = clean[i + 3] ?? "A";
    const n =
      (alphabet.indexOf(c0) << 18) |
      (alphabet.indexOf(c1) << 12) |
      (alphabet.indexOf(c2) << 6) |
      alphabet.indexOf(c3);
    if (o < out.length) out[o++] = (n >> 16) & 0xff;
    if (o < out.length) out[o++] = (n >> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  return out.subarray(0, o);
}

function jobHeaders(_job: DownloadJob): Record<string, string> {
  // Provider media headers. The CDN checks Origin/Referer in addition to UA.
  return {
    Origin: "https://www.moviebox.ph/",
    Referer: "https://www.moviebox.ph/",
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  };
}
