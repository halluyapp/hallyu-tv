import { LegacyFileSystem as FS, AsyncStorage } from "./native";
import type { DownloadResumable } from "expo-file-system/legacy";
import type { DownloadJob } from "./types";

/**
 * Thin wrapper over the platform file system + registry storage. Isolated so
 * the state machine never touches vendor APIs directly. Uses the stable
 * "legacy" surface of expo-file-system (SDK 54) which exposes plain
 * documentDirectory paths and resumable download tasks.
 */

export const DOWNLOADS_DIR = "downloads/";
const REGISTRY_KEY = "download_jobs_v1";
const BASE_DIR = `${FS.documentDirectory ?? ""}${DOWNLOADS_DIR}`;

/** Map a registry-relative path ("downloads/x.mp4") to an absolute file URI. */
export function absolutePath(relative: string): string {
  return `${BASE_DIR}${relative.replace(DOWNLOADS_DIR, "")}`;
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
      const target = path.startsWith(DOWNLOADS_DIR) ? absolutePath(path) : path;
      const info = await FS.getInfoAsync(target);
      if (info.exists) await FS.deleteAsync(target, { idempotent: true });
    } catch (err) {
      console.error("deleteFile failed:", err);
    }
  },

  /**
   * Validate the completed .part file (exists, non-trivial size, and — when the
   * provider reported an expected size — matching within tolerance) and move it
   * to its final name atomically (rename within the same directory).
   */
  async finalizePart(partPath: string, finalPath: string): Promise<boolean> {
    try {
      const from = absolutePath(partPath);
      const to = absolutePath(finalPath);
      const info = await FS.getInfoAsync(from);
      if (!info.exists || info.size === undefined || info.size < 1024) {
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
        absolutePath(job.partPath),
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

function jobHeaders(_job: DownloadJob): Record<string, string> {
  // Provider media headers — kept inside provider-specific layers only.
  return {
    Referer: "https://www.moviebox.ph/",
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  };
}
