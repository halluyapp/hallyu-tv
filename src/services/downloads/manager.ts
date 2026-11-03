import { resolveStreams } from "@/services/provider/adapter";
import { LegacyFileSystem, DOWNLOADS_DIR } from "./fs";
import { jobPaths } from "./paths";
import type { DownloadJob, DownloadState, DownloadRequest } from "./types";

export { DOWNLOADS_DIR };

/**
 * Download state machine. Persisted to AsyncStorage so jobs recover across app
 * restarts. Bytes flow through expo-file-system download tasks to a `.part`
 * file, validated and atomically renamed on completion.
 *
 * Honest limitation: expo-file-system transfers continue while the app is
 * backgrounded only for as long as the OS lets the JS task run; OS-level
 * background resumption with notifications requires a native transfer service.
 * This is documented in docs/downloads/design.md. Resume uses Range only when
 * the CDN advertises support (Accept-Ranges), see docs.
 */

const REGISTRY_KEY = "download_jobs_v1";
export const MAX_CONCURRENT_DOWNLOADS = 2;
/** Minimum free disk space a download must leave untouched (256 MB). */
const MIN_FREE_DISK_BYTES = 256 * 1024 * 1024;

type Listener = (jobs: DownloadJob[]) => void;

class DownloadManager {
  private jobs = new Map<string, DownloadJob>();
  private tasks = new Map<string, ReturnType<typeof LegacyFileSystem.createDownloadTask>>();
  private listeners = new Set<Listener>();
  private hydrated = false;

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const raw = await LegacyFileSystem.readRegistry();
      if (Array.isArray(raw)) {
        for (const j of raw as DownloadJob[]) {
          // Anything that was mid-flight when the app died becomes failed and retryable.
          if (j.state === "downloading" || j.state === "connecting" || j.state === "resolving" || j.state === "queued" || j.state === "verifying") {
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

    const id = `${request.subjectId}_${request.season}_${request.episode}_${Date.now()}`;
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
    if (!job || job.state !== "downloading") return;
    this.tasks.get(id)?.pause();
    this.update(id, { state: "paused" });
  }

  resume(id: string) {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.state === "paused") {
      this.update(id, { state: "downloading" });
      this.tasks.get(id)?.resume();
    } else if (job.state === "failed" || job.state === "cancelled") {
      // Signed URLs expire quickly — re-resolve a fresh source, falling back to
      // the same quality when the provider still offers it.
      void (async () => {
        try {
          const res = await resolveStreams(
            job.subjectId,
            job.detailPath,
            job.season,
            job.episode,
          );
          if (res.sources.length === 0) throw new Error(res.note ?? "No downloadable source was returned.");
          const fresh =
            res.sources.find((s) => s.resolution === job.source.resolution) ??
            res.sources[res.sources.length - 1] ??
            job.source;
          this.jobs.delete(id);
          this.emit();
          await this.enqueue({
            subjectId: job.subjectId,
            detailPath: job.detailPath,
            season: job.season,
            episode: job.episode,
            title: job.title,
            posterUrl: job.posterUrl,
            mediaType: job.mediaType,
            source: fresh,
            expectedBytes: fresh.sizeBytes,
          });
        } catch (err) {
          this.update(id, {
            state: "failed",
            failureReason: err instanceof Error ? err.message : "Could not refresh the download source",
          });
        }
      })();
    }
  }

  cancel(id: string) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.tasks.get(id)?.cancel();
    this.tasks.delete(id);
    void LegacyFileSystem.deleteFile(job.partPath);
    this.jobs.delete(id);
    this.emit();
    void this.pump();
  }

  /** Delete a completed download (and any dangling parts). */
  async delete(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    this.tasks.get(id)?.cancel();
    this.tasks.delete(id);
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
