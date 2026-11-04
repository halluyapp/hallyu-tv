import { resolveStreams } from "@/services/provider/adapter";
import { selectDownloadSource } from "@/services/provider/streams";
import { LegacyFileSystem, DOWNLOADS_DIR } from "./fs";
import { isNativeDownloaderAvailable, nativeDownloader } from "./nativeDownloader";
import { downloadKey, reasonMessage, sizeWithinTolerance, DM_REASON, DM_STATUS } from "./reasons";
import { jobPaths, localFileUri } from "./paths";
import type { DownloadJob, DownloadState, DownloadRequest } from "./types";

export { DOWNLOADS_DIR };

/**
 * Direct-to-device download state machine. No proxy or account backend is
 * involved. Android uses the system DownloadManager when the native module is
 * present; other platforms use expo-file-system. Jobs persist locally and are
 * reconciled on restart. Retries always re-resolve a fresh Zarhosting URL.
 */

export const MAX_CONCURRENT_DOWNLOADS = 2;
const MIN_FREE_DISK_BYTES = 256 * 1024 * 1024;

type Listener = (jobs: DownloadJob[]) => void;

const ACTIVE_STATES: DownloadState[] = ["queued", "resolving", "connecting", "downloading", "verifying"];

class DownloadManager {
  private jobs = new Map<string, DownloadJob>();
  private tasks = new Map<string, ReturnType<typeof LegacyFileSystem.createDownloadTask>>();
  private polls = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<Listener>();
  private hydratePromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private pumping = false;
  private priorityFloor = 0;

  hydrate(): Promise<void> {
    if (!this.hydratePromise) {
      this.hydratePromise = this.doHydrate();
    }
    return this.hydratePromise;
  }

  private async doHydrate(): Promise<void> {
    try {
      const raw = await LegacyFileSystem.readRegistry();
      if (Array.isArray(raw)) {
        for (const j of raw as DownloadJob[]) {
          if (!j || typeof j.id !== "string" || typeof j.subjectId !== "string") continue;
          if (j.engine === "native") {
            if (j.state !== "completed" && j.state !== "failed" && j.state !== "cancelled") {
              this.jobs.set(j.id, j);
              this.pollNative(j.id, 0);
            } else {
              this.jobs.set(j.id, j);
            }
          } else {
            if (ACTIVE_STATES.includes(j.state) || j.state === "paused") {
              j.state = "failed";
              j.failureReason = "Interrupted by app restart. Tap retry to start again.";
            }
            this.jobs.set(j.id, j);
          }
        }
      }
    } catch (err) {
      console.error("download registry hydrate failed:", err);
    }
    this.emit();
    void this.pump();
  }

  private persist(): void {
    const snapshot = Array.from(this.jobs.values());
    this.writeQueue = this.writeQueue
      .then(() => LegacyFileSystem.writeRegistry(snapshot))
      .catch((err) => console.error("download registry persist failed:", err));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(Array.from(this.jobs.values()));
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snapshot = Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
    for (const l of this.listeners) l(snapshot);
    this.persist();
  }

  private update(id: string, patch: Partial<DownloadJob>) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.set(id, { ...job, ...patch });
    this.emit();
  }

  private transition(id: string, next: DownloadState) {
    this.update(id, { state: next });
  }

  async enqueue(request: DownloadRequest): Promise<void> {
    await this.hydrate();
    const existing = Array.from(this.jobs.values()).find(
      (j) => j.subjectId === request.subjectId && j.season === request.season && j.episode === request.episode && j.state !== "failed" && j.state !== "cancelled",
    );
    if (existing) return;

    const useNative = isNativeDownloaderAvailable();
    const id = downloadKey(request.subjectId, request.season, request.episode);
    const paths = jobPaths(request.subjectId, request.title, request.season, request.episode);
    const job: DownloadJob = {
      ...request,
      id,
      state: "queued",
      receivedBytes: 0,
      totalBytes: request.expectedBytes ?? null,
      createdAt: Date.now(),
      partPath: paths.partPath,
      finalPath: paths.finalPath,
      failureReason: null,
      engine: useNative ? "native" : "js",
      nativeKey: useNative ? id : undefined,
    };
    this.jobs.set(id, job);
    this.emit();
    void this.pump();
  }

  private async pump(): Promise<void> {
    await this.hydrate();
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (true) {
        const active = Array.from(this.jobs.values()).filter((j) => ACTIVE_STATES.includes(j.state) && j.state !== "queued").length;
        if (active >= MAX_CONCURRENT_DOWNLOADS) break;
        const next = Array.from(this.jobs.values())
          .filter((j) => j.state === "queued")
          .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.createdAt - b.createdAt)[0];
        if (!next) break;
        // Mark connecting synchronously so the next loop iteration counts it.
        this.transition(next.id, "connecting");
        void this.start(next);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async start(job: DownloadJob): Promise<void> {
    if (job.engine === "native") {
      await this.startNative(job);
    } else {
      await this.startJs(job);
    }
  }

  private async checkFreeDisk(expectedBytes: number | null): Promise<void> {
    const free = await LegacyFileSystem.freeDiskBytes();
    const wanted = expectedBytes ?? 0;
    if (free !== null && free < wanted + MIN_FREE_DISK_BYTES) {
      throw new Error("Not enough free storage on this device. Free up space, then tap retry.");
    }
  }

  private async startNative(job: DownloadJob): Promise<void> {
    try {
      await this.checkFreeDisk(job.expectedBytes);
      await nativeDownloader.start(job.nativeKey ?? job.id, job.source.url, job.title);
      this.pollNative(job.id, 0);
    } catch (err) {
      this.update(job.id, {
        state: "failed",
        failureReason: err instanceof Error ? err.message : "Download could not start",
      });
      void this.pump();
    }
  }

  private static POLL_MS = 1000;
  private static MAX_QUERIES_WITHOUT_PROGRESS = 30;

  private pollNative(id: string, stalledQueries: number): void {
    const existing = this.polls.get(id);
    if (existing) clearTimeout(existing);
    const job = this.jobs.get(id);
    if (!job || job.engine !== "native") return;
    if (job.state === "completed" || job.state === "cancelled" || job.state === "failed") return;

    void nativeDownloader
      .query(job.nativeKey ?? job.id)
      .then((snap) => {
        const current = this.jobs.get(id);
        if (!current || !snap) {
          if (current && current.state !== "completed" && current.state !== "cancelled") {
            this.update(id, { state: "failed", failureReason: "The system download is no longer tracked. Tap retry." });
            void this.pump();
          }
          return;
        }
        if (current.state === "completed" || current.state === "cancelled") return;

        if (snap.status === "missing") {
          this.update(id, { state: "failed", failureReason: "The system download is no longer tracked. Tap retry." });
          void this.pump();
          return;
        }
        if (snap.status === "successful") {
          void this.finishNative(id, snap);
          return;
        }
        if (snap.status === "failed") {
          this.update(id, { state: "failed", failureReason: reasonMessage(DM_STATUS.FAILED, snap.reason) });
          void this.pump();
          return;
        }

        let nextStalled = 0;
        if (snap.status === "paused" && snap.reason !== DM_REASON.WAITING_TO_RETRY) {
          this.update(id, {
            state: "waiting_for_network",
            failureReason: reasonMessage(DM_STATUS.PAUSED, snap.reason),
          });
        } else {
          nextStalled = snap.bytes > current.receivedBytes ? 0 : stalledQueries + 1;
          if (nextStalled > DownloadManager.MAX_QUERIES_WITHOUT_PROGRESS) {
            this.update(id, { state: "failed", failureReason: "The download stopped making progress. Tap retry." });
            void this.pump();
            return;
          }
          this.update(id, {
            state: "downloading",
            receivedBytes: snap.bytes,
            totalBytes: snap.total > 0 ? snap.total : current.expectedBytes,
          });
        }

        const timer = setTimeout(() => this.pollNative(id, nextStalled), DownloadManager.POLL_MS);
        this.polls.set(id, timer);
      })
      .catch((err) => {
        console.error("native download query failed:", err);
        const timer = setTimeout(() => this.pollNative(id, stalledQueries + 1), DownloadManager.POLL_MS);
        this.polls.set(id, timer);
      });
  }

  /** Verify the actual file on disk before promoting a native transfer. */
  private async finishNative(id: string, snap: { total: number; localPath?: string; fileSize?: number }): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    const localPath = snap.localPath ?? "";
    const uri = localFileUri(localPath || job.finalPath);
    const actual = await LegacyFileSystem.fileSize(uri);
    const reported = typeof snap.fileSize === "number" && snap.fileSize >= 0 ? snap.fileSize : null;
    const total = actual ?? reported ?? (snap.total > 0 ? snap.total : job.expectedBytes ?? 0);
    const validSize = sizeWithinTolerance(total, job.expectedBytes);
    const validFile = validSize && (await LegacyFileSystem.hasMp4Signature(uri));
    if (!validFile) {
      void nativeDownloader.remove(job.nativeKey ?? job.id);
      this.update(id, { state: "failed", failureReason: "The downloaded file failed verification. Tap retry." });
      void this.pump();
      return;
    }
    this.update(id, {
      state: "completed",
      finalPath: localPath || job.finalPath,
      receivedBytes: total,
      totalBytes: total,
    });
    void this.pump();
  }

  private async startJs(job: DownloadJob): Promise<void> {
    try {
      await LegacyFileSystem.ensureDir();
      await this.checkFreeDisk(job.expectedBytes);
      const task = LegacyFileSystem.createDownloadTask(
        job,
        (received, total) => {
          this.update(job.id, {
            state: "downloading",
            receivedBytes: received,
            totalBytes: total > 0 ? total : job.expectedBytes,
          });
        },
        async () => {
          this.transition(job.id, "verifying");
          try {
            const ok = await LegacyFileSystem.finalizePart(job.partPath, job.finalPath, job.expectedBytes);
            if (!ok) throw new Error("The downloaded file failed verification. Tap retry.");
            const info = await LegacyFileSystem.fileSize(LegacyFileSystem.absolutePathFor(job.finalPath));
            this.update(job.id, {
              state: "completed",
              finalPath: job.finalPath,
              receivedBytes: info ?? job.receivedBytes,
              totalBytes: info ?? job.totalBytes,
            });
          } catch (err) {
            this.update(job.id, {
              state: "failed",
              failureReason: err instanceof Error ? err.message : "Verification failed",
            });
          }
          void this.pump();
        },
        (reason: string) => {
          if (reason === "cancelled") {
            this.update(job.id, { state: "cancelled" });
          } else if (reason === "paused") {
            this.update(job.id, { state: "paused" });
          } else {
            this.update(job.id, { state: "failed", failureReason: reason });
          }
          void this.pump();
        },
      );
      this.tasks.set(job.id, task);
      this.transition(job.id, "downloading");
      task.start();
    } catch (err) {
      this.update(job.id, {
        state: "failed",
        failureReason: err instanceof Error ? err.message : "Download could not start",
      });
      void this.pump();
    }
  }

  pause(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.engine === "native") return;
    if (job.state !== "downloading") return;
    this.tasks.get(id)?.pause();
    this.update(id, { state: "paused" });
  }

  resume(id: string) {
    const job = this.jobs.get(id);
    if (!job) return;

    if (job.engine === "native") {
      if (job.state === "waiting_for_network" || job.state === "paused") {
        this.pollNative(id, 0);
      } else if (job.state === "failed" || job.state === "cancelled") {
        void this.restartWithFreshSource(job);
      }
      return;
    }

    if (job.state === "paused" && this.tasks.has(id)) {
      this.update(id, { state: "downloading" });
      this.tasks.get(id)?.resume();
    } else if (job.state === "paused" || job.state === "failed" || job.state === "cancelled") {
      void this.restartWithFreshSource(job);
    }
  }

  /** Re-resolve a fresh direct CDN URL and restart the job with its engine. */
  private async restartWithFreshSource(job: DownloadJob): Promise<void> {
    const id = job.id;
    if (this.jobs.get(id)?.state === "resolving") return;
    this.update(id, { state: "resolving", failureReason: null });
    try {
      const res = await resolveStreams(job.subjectId, job.detailPath, job.season, job.episode);
      const fresh = selectDownloadSource(res.sources, job.source.resolution) ?? selectDownloadSource(res.sources, null);
      if (!fresh) throw new Error("No downloadable MP4 source was returned.");

      const paths = jobPaths(job.subjectId, job.title, job.season, job.episode);
      const next: DownloadJob = {
        ...job,
        source: fresh,
        expectedBytes: fresh.sizeBytes ?? null,
        state: "queued",
        receivedBytes: 0,
        totalBytes: fresh.sizeBytes ?? null,
        partPath: paths.partPath,
        finalPath: job.engine === "native" ? job.finalPath : paths.finalPath,
        failureReason: null,
        freshRetries: (job.freshRetries ?? 0) + 1,
      };
      this.jobs.set(id, next);
      this.emit();
      void this.pump();
    } catch (err) {
      this.update(id, {
        state: "failed",
        failureReason: err instanceof Error ? err.message : "Could not refresh the download source",
      });
      void this.pump();
    }
  }

  /** Jump a queued job to the front of the queue ("download next"). */
  moveToFront(id: string): void {
    const job = this.jobs.get(id);
    if (!job || job.state !== "queued") return;
    this.priorityFloor -= 1;
    this.update(id, { priority: this.priorityFloor });
    void this.pump();
  }

  private stopEngine(id: string): void {
    this.tasks.get(id)?.cancel();
    this.tasks.delete(id);
    const timer = this.polls.get(id);
    if (timer) clearTimeout(timer);
    this.polls.delete(id);
  }

  cancel(id: string) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.stopEngine(id);
    if (job.engine === "native") {
      void nativeDownloader.remove(job.nativeKey ?? job.id);
    } else {
      void LegacyFileSystem.deleteFile(job.partPath);
    }
    this.jobs.delete(id);
    this.emit();
    void this.pump();
  }

  async delete(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    this.stopEngine(id);
    if (job.engine === "native") {
      await nativeDownloader.remove(job.nativeKey ?? job.id).catch(() => undefined);
    }
    await Promise.all([LegacyFileSystem.deleteFile(job.finalPath), LegacyFileSystem.deleteFile(job.partPath)]);
    this.jobs.delete(id);
    this.emit();
    void this.pump();
  }

  job(id: string): DownloadJob | undefined {
    return this.jobs.get(id);
  }

  all(): DownloadJob[] {
    return Array.from(this.jobs.values());
  }
}

export const downloadManager = new DownloadManager();
