import { LegacyFileSystem as FS, AsyncStorage } from "./native";
import { DOWNLOADS_DIR, absolutePath, localFileUri } from "./paths";
import { PROVIDER_MEDIA_HEADERS } from "../provider/client";
import { sizeWithinTolerance } from "./reasons";
import type { DownloadResumable } from "expo-file-system/legacy";
import type { DownloadJob } from "./types";

/**
 * Platform file system + registry storage wrapper. Uses expo-file-system's
 * stable "legacy" imperative surface (SDK 54) for resumable downloads.
 */

export { DOWNLOADS_DIR };
const REGISTRY_KEY = "download_jobs_v1";
const BASE_DIR = `${FS.documentDirectory ?? ""}${DOWNLOADS_DIR}`;

export function absolutePathFor(relative: string): string {
  return absolutePath(BASE_DIR, relative);
}

function resolveLocal(path: string): string {
  if (!path) return path;
  const resolved = path.startsWith(DOWNLOADS_DIR) ? absolutePathFor(path) : path;
  return localFileUri(resolved);
}

async function hasMp4Signature(uri: string): Promise<boolean> {
  try {
    const head = await FS.readAsStringAsync(uri, { position: 0, length: 16, encoding: "base64" });
    const bytes = decodeBase64Bytes(head);
    return bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  } catch {
    // If the platform cannot do partial binary reads, rely on size checks.
    return true;
  }
}

export const LegacyFileSystem = {
  REGISTRY_KEY,
  absolutePathFor,
  hasMp4Signature,

  async ensureDir(): Promise<void> {
    const dir = await FS.getInfoAsync(BASE_DIR);
    if (!dir.exists) await FS.makeDirectoryAsync(BASE_DIR, { intermediates: true });
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
      const target = resolveLocal(path);
      const info = await FS.getInfoAsync(target);
      if (info.exists) await FS.deleteAsync(target, { idempotent: true });
    } catch (err) {
      console.error("deleteFile failed:", err);
    }
  },

  async freeDiskBytes(): Promise<number | null> {
    try {
      const info = await FS.getFreeDiskStorageAsync();
      return typeof info === "number" ? info : null;
    } catch {
      return null;
    }
  },

  async totalDiskBytes(): Promise<number | null> {
    try {
      const fn = (FS as unknown as { getTotalDiskCapacityAsync?: () => Promise<number> }).getTotalDiskCapacityAsync;
      if (typeof fn !== "function") return null;
      const info = await fn();
      return typeof info === "number" && info > 0 ? info : null;
    } catch {
      return null;
    }
  },

  async fileSize(path: string): Promise<number | null> {
    try {
      const info = await FS.getInfoAsync(resolveLocal(path));
      return info.exists && typeof info.size === "number" ? info.size : null;
    } catch {
      return null;
    }
  },

  /** Validate a completed .part file, then atomically move it to its final name. */
  async finalizePart(partPath: string, finalPath: string, expectedBytes?: number | null): Promise<boolean> {
    try {
      const from = absolutePathFor(partPath);
      const to = absolutePathFor(finalPath);
      const info = await FS.getInfoAsync(from);
      const size = info.exists && typeof info.size === "number" ? info.size : 0;
      if (!sizeWithinTolerance(size, expectedBytes ?? null)) return false;
      if (!(await hasMp4Signature(from))) return false;
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
        { headers: { ...PROVIDER_MEDIA_HEADERS } },
        (progress) => onProgress(progress.totalBytesWritten, progress.totalBytesExpectedToWrite),
      );
    } catch (err) {
      console.error("createDownloadResumable failed:", err);
      onError("Download could not start");
      return { start: () => {}, pause: () => {}, resume: () => {}, cancel: () => {} };
    }

    const handleResult = (result: unknown) => {
      const status = result && typeof result === "object" && "status" in result ? (result as { status: number }).status : 0;
      if (status === 200 || status === 206) onComplete();
      else onError(`Server responded ${status || "unexpectedly"}`);
    };

    return {
      start: () => {
        task.downloadAsync().then(handleResult).catch((err: Error) => {
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
        task.resumeAsync().then(handleResult).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "";
          if (msg.includes("cancel")) onError("cancelled");
          else if (msg.includes("pause")) onError("paused");
          else onError(msg || "Network error during download");
        });
      },
      cancel: () => {
        task.cancelAsync().catch((err: unknown) => console.error("cancel failed:", err));
      },
    };
  },
};

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
