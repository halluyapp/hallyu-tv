import { resolveStreams } from "@/services/provider/adapter";
import { selectSource } from "@/services/provider/streams";
import { proxyUri } from "@/services/provider/transport";
import { LegacyFileSystem, DOWNLOADS_DIR } from "./fs";
import { isNativeDownloaderAvailable, nativeDownloader } from "./nativeDownloader";
import { downloadKey, reasonMessage, sizeWithinTolerance, DM_REASON, DM_STATUS } from "./reasons";
import { jobPaths } from "./paths";
import type { DownloadJob, DownloadState, DownloadRequest } from "./types";

export { DOWNLOADS_DIR };

/**
 * Download state machine. Persisted to AsyncStorage so jobs recover across app
 * restarts. Two engines:
 *
 *  - native (Android): the system DownloadManager owns the transfer. It keeps
 *    running while the app is backgrounded or closed, retries on connectivity
 *    changes, and shows a system notification. Progress arrives by polling;
 *    on restart, polling reconciles registry entries with system state.
 *    DownloadManager cannot pause, so native jobs do not offer pause.
 *  - js (fallback, e.g. other platforms): expo-file-system transfer to a
 *    `.part` file, validated and atomically renamed on completion. Honest
 *    limitation: continues in the background only as long as the OS lets the
 *    JS task run. See docs/downloads-design.md.
 */

const REGISTRY_KEY = "download_jobs_v1";
export const MAX_CONCURRENT_DOWNLOADS = 2;
/** Minimum free disk space a download must leave untouched (256 MB). */
const MIN_FREE_DISK_BYTES = 256 * 1024 * 1024;

type Listener = (jobs: DownloadJob[]) => void;

class DownloadManager {
  private jobs = new Map<string, DownloadJob>();
  private tasks = new Map<string, ReturnType<typeof LegacyFileSystem.createDownloadTask>>();
  private polls = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<Listener>();
  private hydrated = false;

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const raw = await LegacyFileSystem.readRegistry();
      if (Array.isArray(raw)) {
        for (const j of raw as DownloadJob[]) {
          if (j.engine === "native") {
            // System DownloadManager jobs may still be alive (or finished while
            // the app was closed) — reconcile with the system, don't guess.
            if (j.state !== "completed" && j.state !== "failed" && j.state !== "cancelled") {
              this.pollNative(j.id, 0);
            }
          } else if (
            j.state === "downloading" || j.state === "connecting" || j.state === "resolving" || j.state === "queued" || j.state === "verifying"
          ) {
            // Anything JS-mid-flight when the app died becomes failed and retryable.
            j.state = "failed";
            j.failureReason = "Interrupted by app restart";
          }
          this.jobs.set(j.id, j);
        }
      }
    } catch (err) {
      console.error("download registry hydrate failed:", err);
    }
    this.emit();
  }

  private async persist(): Promise<void> {
    try {
      await LegacyFileSystem.writeRegistry(Array.from(this.jobs.values()));
    } catch (err) {
      console.error("download registry persist failed:", err);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(Array.from(this.jobs.values()));
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snapshot = Array.from(this.jobs.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    for (const l of this.listeners) l(snapshot);
    void this.persist();
  }

  private update(id: string, patch: Partial<DownloadJob>) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.set(id, { ...job, ...patch });
    this.emit();
  }

  /** Verify only legal transitions for auditability. */
  private transition(id: string, next: DownloadState) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.update(id, { state: next });
  }

  async enqueue(request: DownloadRequest): Promise<void> {
    const existing = Array.from(this.jobs.values()).find(
      (j) => j.subjectId === request.subjectId && j.season === request.season && j.episode === request.episode && j.state !== "failed" && j.state !== "cancelled",
    );
    if (existing) return;

    const useNative = isNativeDownloaderAvailable();
    // Native engine keys are stable, so a retry replaces the old system job.
    const id = useNative
      ? downloadKey(request.subjectId, request.season, request.episode)
      : `${request.subjectId}_${request.season}_${request.episode}_${Date.now()}`;
    const paths = jobPaths(request.title, request.season, request.episode);
    const job: DownloadJob = {
      id,
      ...request,
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
    const active = Array.from(this.jobs.values()).filter(
      (j) => j.state === "downloading" || j.state === "connecting" || j.state === "resolving",
    ).length;
    if (active >= MAX_CONCURRENT_DOWNLOADS) return;
    const next = Array.from(this.jobs.values()).find((j) => j.state === "queued");
    if (!next) return;
    void this.start(next);
  }

  private async start(job: DownloadJob): Promise<void> {
    if (job.engine === "native") {
      this.startNative(job);
    } else {
      await this.startJs(job);
    }
  }

  /**
   * Native engine: hand the bytes to the system DownloadManager, then poll.
   * The system keeps transferring while the app is backgrounded or closed;
   * polling resumes/reconciles whenever the app opens again.
   */
  private startNative(job: DownloadJob): void {
    this.transition(job.id, "connecting");
    nativeDownloader
      .start(job.nativeKey ?? job.id, job.source.url, job.title)
      .then(() => {
        // A system job may already be done when reconciling; a single query
        // call settles it either way.
        this.pollNative(job.id, 0);
      })
      .catch((err: unknown) => {
        this.update(job.id, {
          state: "failed",
          failureReason: err instanceof Error ? err.message : "Download could not start",
        });
      });
  }

  private static POLL_MS = 1000;
  private static MAX_QUERIES_WITHOUT_PROGRESS = 30;

  private pollNative(id: string, stalledQueries: number): void {
    const existing = this.polls.get(id);
    if (existing) clearTimeout(existing);
    const job = this.jobs.get(id);
    if (!job || job.engine !== "native") return;
    if (job.state === "completed" || job.state === "cancelled") return;

    void nativeDownloader.query(job.nativeKey ?? job.id).then((snap) => {
      const current = this.jobs.get(id);
      if (!current || !snap) return;
      if (current.state === "completed" || current.state === "cancelled") return;

      if (snap.status === "missing") {
        // System lost the job before it ever ran (e.g. cleared by the OS).
        this.update(id, { state: "failed", failureReason: "The system download is no longer tracked. Tap retry." });
        return;
      }

      if (snap.status === "successful") {
        this.finishNative(id, snap);
        return;
      }

      if (snap.status === "failed") {
        this.update(id, { state: "failed", failureReason: reasonMessage(DM_STATUS.FAILED, snap.reason) });
        void this.pump();
        return;
      }

      let nextStalled = 0;
      if (snap.status === "paused" && snap.reason !== DM_REASON.WAITING_TO_RETRY) {
        // System-level pause (network loss etc.) — not user-pausable.
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

      // Keep polling while the app is open; background polling simply stops
      // (JS suspends) and hydrate() reconciles when the app returns.
      const timer = setTimeout(() => this.pollNative(id, nextStalled), DownloadManager.POLL_MS);
      this.polls.set(id, timer);
    });
  }

  /** Verify a successful native transfer before promoting it. */
  private finishNative(id: string, snap: { total: number; localPath?: string }): void {
    const job = this.jobs.get(id);
    if (!job) return;
    const total = snap.total > 0 ? snap.total : (job.expectedBytes ?? 0);
    if (!sizeWithinTolerance(total, job.expectedBytes)) {
      void nativeDownloader.remove(job.nativeKey ?? job.id);
      this.update(id, { state: "failed", failureReason: "The downloaded file failed verification. Tap retry." });
      void this.pump();
      return;
    }
    const localPath = snap.localPath ?? "";
    this.update(id, {
      state: "completed",
      finalPath: localPath || job.finalPath,
      receivedBytes: total,
      totalBytes: total,
    });
    void this.pump();
  }

  /** JS engine: expo-file-system transfer to a .part file, verified on completion. */
  private async startJs(job: DownloadJob): Promise<void> {
    this.transition(job.id, "connecting");
    try {
      await LegacyFileSystem.ensureDir();
      const free = await LegacyFileSystem.freeDiskBytes();
      const wanted = job.expectedBytes ?? 0;
      if (free !== null && free < wanted + MIN_FREE_DISK_BYTES) {
        throw new Error("Not enough free storage on this device");
      }
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
          // Completed: validate, then atomically move .part -> final.
          this.transition(job.id, "verifying");
          try {
            const ok = await LegacyFileSystem.finalizePart(job.partPath, job.finalPath, job.expectedBytes);
            if (!ok) throw new Error("File validation failed");
            this.update(job.id, { state: "completed", finalPath: job.finalPath });
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
    if (!job || job.engine === "native") return; // DownloadManager cannot pause
    if (job.state !== "downloading") return;
    this.tasks.get(id)?.pause();
    this.update(id, { state: "paused" });
  }

  /**
   * Resume/retry. Signed URLs expire quickly, so failures always re-resolve a
   * fresh source — same quality when the provider still offers it, else the
   * same default rule playback uses. A paused JS job whose task no longer
   * exists (app restart) goes through the same re-enqueue path.
   */
  resume(id: string) {
    const job = this.jobs.get(id);
    if (!job) return;

    if (job.engine === "native") {
      if (job.state === "waiting_for_network" || job.state === "paused") {
        // The system pauses/resumes on its own; just resume polling.
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

  /**
   * Re-resolve a fresh URL and start the job again with its engine.
   *
   * Signed URLs expire quickly, so every retry re-resolves. The first fresh
   * retry goes direct to the CDN; if a fresh direct URL already failed once
   * (throttled network, expired-again URL, header gate), later retries route
   * through the media proxy, which resolves the signed URL server-side and
   * needs no headers from the client. Both engines take a plain URL, so the
   * swap is transparent to them.
   */
  private async restartWithFreshSource(job: DownloadJob): Promise<void> {
    const id = job.id;
    const attempt = (job.freshRetries ?? 0) + 1;
    const viaProxy = attempt >= 2;
    this.update(id, { state: "resolving", failureReason: null });
    try {
      const res = await resolveStreams(job.subjectId, job.detailPath, job.season, job.episode);
      if (res.sources.length === 0) throw new Error(res.note ?? "No downloadable source was returned.");
      // Same requested quality first, then the app's default (data-conscious) rule.
      const fresh = selectSource(res.sources, job.source.resolution) ?? selectSource(res.sources, null);
      if (!fresh) throw new Error("No downloadable source was returned.");

      const ctx = { subjectId: job.subjectId, detailPath: job.detailPath, season: job.season, episode: job.episode };
      const effective = viaProxy ? { ...fresh, url: proxyUri(fresh, ctx) } : fresh;

      const paths = jobPaths(job.title, job.season, job.episode);
      const next: DownloadJob = {
        ...job,
        source: effective,
        expectedBytes: fresh.sizeBytes ?? null,
        state: "queued",
        receivedBytes: 0,
        totalBytes: fresh.sizeBytes ?? null,
        partPath: paths.partPath,
        finalPath: job.engine === "native" ? job.finalPath : paths.finalPath,
        failureReason: null,
        freshRetries: attempt,
        viaProxy,
      };
      this.jobs.set(id, next);
      this.emit();
      if (next.engine === "native") {
        this.startNative(next);
      } else {
        void this.pump();
      }
    } catch (err) {
      this.update(id, {
        state: "failed",
        failureReason: err instanceof Error ? err.message : "Could not refresh the download source",
      });
    }
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
    if (job.engine === "native") {
      void nativeDownloader.remove(job.nativeKey ?? job.id);
    } else {
      this.tasks.get(id)?.cancel();
      this.tasks.delete(id);
      void LegacyFileSystem.deleteFile(job.partPath);
    }
    const timer = this.polls.get(id);
    if (timer) clearTimeout(timer);
    this.polls.delete(id);
    this.jobs.delete(id);
    this.emit();
    void this.pump();
  }

  /** Delete a completed download (and any dangling parts). */
  async delete(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.engine === "native") {
      void nativeDownloader.remove(job.nativeKey ?? job.id);
    }
    this.stopEngine(id);
    await Promise.all([LegacyFileSystem.deleteFile(job.finalPath), LegacyFileSystem.deleteFile(job.partPath)]);
    this.jobs.delete(id);
    this.emit();
  }

  job(id: string): DownloadJob | undefined {
    return this.jobs.get(id);
  }

  all(): DownloadJob[] {
    return Array.from(this.jobs.values());
  }
}

export const downloadManager = new DownloadManager();
