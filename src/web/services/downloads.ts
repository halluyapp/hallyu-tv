import type { DownloadJob, DownloadRequest } from "@/services/downloads/types";
import { fetchCaptions, fetchCaptionText, resolveStreams } from "@/services/provider/adapter";
import { selectDownloadSource } from "@/services/provider/streams";
import { loadCues, pickPreferredTrack, saveCues, subtitleKey } from "@/services/subtitles/cache";
import { parseSubtitles, type Cue } from "@/services/subtitles/srt";
import type { CaptionTrack, TitleDetail } from "@/types/provider";
import {
  buildResumeHeaders,
  createVaultWriter,
  deleteVaultMedia,
  detectVaultCapabilities,
  getVaultPartialSize,
  readVaultMedia,
  requestPersistentVault,
  resolveRangeResponse,
  type OfflineVaultCapabilities,
} from "./downloadStorage";
import { preferredSubtitleWords } from "./preferences";

const JOBS_STORAGE_KEY = "hallyu.downloads.jobs.v1";
const OFFLINE_TRACKS_PREFIX = "hallyu.offline_tracks.v1.";

export interface OfflineSubtitleTrack {
  id: string;
  language: string;
  languageName: string;
  cues: Cue[];
}

type Listener = (jobs: DownloadJob[]) => void;

export function jobIdFor(req: Pick<DownloadRequest, "subjectId" | "season" | "episode">): string {
  return `${req.subjectId}_s${req.season}_e${req.episode}`;
}

export function loadOfflineTracks(jobId: string): OfflineSubtitleTrack[] {
  try {
    const raw = localStorage.getItem(`${OFFLINE_TRACKS_PREFIX}${jobId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineSubtitleTrack[]) : [];
  } catch {
    return [];
  }
}

function saveOfflineTracks(jobId: string, tracks: OfflineSubtitleTrack[]) {
  if (tracks.length === 0) return;
  try {
    localStorage.setItem(`${OFFLINE_TRACKS_PREFIX}${jobId}`, JSON.stringify(tracks));
  } catch {}
}

function removeOfflineTracks(jobId: string) {
  try {
    localStorage.removeItem(`${OFFLINE_TRACKS_PREFIX}${jobId}`);
  } catch {}
}

class WebDownloadManager {
  private jobs: DownloadJob[] = [];
  private listeners = new Set<Listener>();
  private controllers = new Map<string, AbortController>();
  private hydrated = false;
  private runningId: string | null = null;
  private seasonQueueBusy = false;

  hydrate(): DownloadJob[] {
    if (this.hydrated) return this.jobs;
    this.hydrated = true;
    try {
      const raw = localStorage.getItem(JOBS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.jobs = parsed.map((j: DownloadJob) =>
            j.state === "downloading" ||
            j.state === "connecting" ||
            j.state === "resolving" ||
            j.state === "verifying"
              ? { ...j, state: "paused" }
              : j,
          );
          this.persist();
        }
      }
    } catch {
      this.jobs = [];
    }
    return this.jobs;
  }

  subscribe(fn: Listener): () => void {
    this.hydrate();
    this.listeners.add(fn);
    fn([...this.jobs]);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getJobs(): DownloadJob[] {
    return [...this.hydrate()];
  }

  getJob(subjectId: string, season = 0, episode = 0): DownloadJob | null {
    const id = jobIdFor({ subjectId, season, episode });
    return this.hydrate().find((j) => j.id === id) ?? null;
  }

  getCompletedJob(subjectId: string, season = 0, episode = 0): DownloadJob | null {
    const job = this.getJob(subjectId, season, episode);
    return job?.state === "completed" ? job : null;
  }

  private emit() {
    this.persist();
    const snap = [...this.jobs];
    for (const fn of this.listeners) fn(snap);
  }

  private persist() {
    try {
      localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(this.jobs));
    } catch {}
  }

  private updateJob(id: string, patch: Partial<DownloadJob>) {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
    this.emit();
  }

  async enqueue(req: DownloadRequest, subtitleLang = "en"): Promise<DownloadJob> {
    this.hydrate();
    void requestPersistentVault();
    const id = jobIdFor(req);
    const existing = this.jobs.find((j) => j.id === id);
    if (existing && (existing.state === "completed" || existing.state === "downloading" || existing.state === "queued")) {
      return existing;
    }

    const job: DownloadJob = {
      ...req,
      id,
      state: "queued",
      receivedBytes: 0,
      totalBytes: req.expectedBytes,
      createdAt: Date.now(),
      partPath: `${id}.part`,
      finalPath: `offline://${id}`,
      failureReason: null,
      engine: "js",
      freshRetries: 0,
    };

    this.jobs = [job, ...this.jobs.filter((j) => j.id !== id)];
    this.emit();
    void this.bundleSubtitles(job, subtitleLang);
    void this.pump();
    return job;
  }

  async enqueueSeason(
    detail: TitleDetail,
    season: number,
    maxEp: number,
    preferredResolution: string | null,
    subtitleLang = "en",
  ): Promise<number> {
    if (this.seasonQueueBusy) return 0;
    this.seasonQueueBusy = true;
    let added = 0;
    try {
      for (let ep = 1; ep <= maxEp; ep++) {
        const existing = this.getJob(detail.subjectId, season, ep);
        if (existing && (existing.state === "completed" || existing.state === "downloading" || existing.state === "queued")) {
          continue;
        }
        try {
          const res = await resolveStreams(detail.subjectId, detail.detailPath, season, ep);
          const pick = selectDownloadSource(res.sources, preferredResolution);
          if (!pick) continue;
          await this.enqueue(
            {
              subjectId: detail.subjectId,
              detailPath: detail.detailPath,
              season,
              episode: ep,
              title: detail.title,
              posterUrl: detail.posterUrl,
              mediaType: detail.mediaType,
              source: pick,
              expectedBytes: pick.sizeBytes,
            },
            subtitleLang,
          );
          added += 1;
        } catch {
          // Skip unavailable episode without halting season batch.
        }
      }
      return added;
    } finally {
      this.seasonQueueBusy = false;
    }
  }

  /**
   * Netflix Smart Downloads hook: called when an episode crosses 90% completion.
   * Optionally deletes the watched offline episode and queues the next episode!
   */
  async handleEpisodeWatched(opts: {
    subjectId: string;
    detailPath: string;
    title: string;
    posterUrl: string | null;
    mediaType: "movie" | "series";
    season: number;
    episode: number;
    nextEpisode: { season: number; episode: number } | null;
    smartDownloads: boolean;
    smartDeleteWatched: boolean;
    preferredQuality: string | null;
    subtitleLang: string;
  }): Promise<void> {
    if (!opts.smartDownloads || opts.mediaType !== "series") return;

    const currentJob = this.getCompletedJob(opts.subjectId, opts.season, opts.episode);
    if (!currentJob) return; // Netflix Smart Downloads activates for series being watched offline.

    if (opts.smartDeleteWatched) {
      await this.delete(currentJob.id);
    }

    if (opts.nextEpisode) {
      const nextExisting = this.getJob(opts.subjectId, opts.nextEpisode.season, opts.nextEpisode.episode);
      if (!nextExisting) {
        try {
          const res = await resolveStreams(
            opts.subjectId,
            opts.detailPath,
            opts.nextEpisode.season,
            opts.nextEpisode.episode,
          );
          const pick = selectDownloadSource(res.sources, opts.preferredQuality ?? currentJob.source.resolution);
          if (pick) {
            await this.enqueue(
              {
                subjectId: opts.subjectId,
                detailPath: opts.detailPath,
                season: opts.nextEpisode.season,
                episode: opts.nextEpisode.episode,
                title: opts.title,
                posterUrl: opts.posterUrl,
                mediaType: "series",
                source: pick,
                expectedBytes: pick.sizeBytes,
              },
              opts.subtitleLang,
            );
          }
        } catch {
          // Best-effort background prefetch; never disturb playback.
        }
      }
    }
  }

  private async bundleSubtitles(job: DownloadJob, subtitleLang: string): Promise<void> {
    if (subtitleLang === "off") return;
    try {
      const key = subtitleKey(job.subjectId, job.season, job.episode);
      const tracks = await fetchCaptions(job.subjectId, job.detailPath, job.season, job.episode);
      if (tracks.length === 0) return;

      const preferred = pickPreferredTrack(tracks, preferredSubtitleWords(subtitleLang));
      const english = pickPreferredTrack(tracks, ["english", "en", "eng"]);
      const candidates: CaptionTrack[] = [];
      for (const t of [preferred, english, tracks[0]]) {
        if (t && !candidates.some((c) => c.id === t.id)) candidates.push(t);
      }

      const offlineTracks: OfflineSubtitleTrack[] = [];
      for (const track of candidates.slice(0, 2)) {
        try {
          const text = await fetchCaptionText(track.url);
          const cues = parseSubtitles(text);
          if (cues.length > 0) {
            offlineTracks.push({
              id: track.id,
              language: track.language,
              languageName: track.languageName,
              cues,
            });
            if (offlineTracks.length === 1) {
              await saveCues(key, cues);
            }
          }
        } catch {}
      }

      if (offlineTracks.length > 0) {
        saveOfflineTracks(job.id, offlineTracks);
      } else {
        await loadCues(key);
      }
    } catch {
      // Optional subtitle bundling never fails video download.
    }
  }

  pause(id: string) {
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    if (this.runningId === id) this.runningId = null;
    this.updateJob(id, { state: "paused" });
    void this.pump();
  }

  pauseAll() {
    for (const j of this.jobs) {
      if (j.state === "downloading" || j.state === "connecting" || j.state === "queued") {
        this.controllers.get(j.id)?.abort();
        this.controllers.delete(j.id);
      }
    }
    this.runningId = null;
    this.jobs = this.jobs.map((j) =>
      j.state === "downloading" || j.state === "connecting" || j.state === "queued"
        ? { ...j, state: "paused" }
        : j,
    );
    this.emit();
  }

  resume(id: string) {
    this.updateJob(id, { state: "queued", failureReason: null });
    void this.pump();
  }

  resumeAll() {
    let changed = false;
    this.jobs = this.jobs.map((j) => {
      if (j.state === "paused" || j.state === "failed") {
        changed = true;
        return { ...j, state: "queued", failureReason: null };
      }
      return j;
    });
    if (changed) {
      this.emit();
      void this.pump();
    }
  }

  moveToFront(id: string) {
    const minPriority = this.jobs.reduce((m, j) => Math.min(m, j.priority ?? 0), 0);
    this.updateJob(id, { priority: minPriority - 1 });
    void this.pump();
  }

  async delete(id: string) {
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    if (this.runningId === id) this.runningId = null;
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.emit();
    removeOfflineTracks(id);
    await deleteVaultMedia(id);
    void this.pump();
  }

  async deleteCompleted() {
    const done = this.jobs.filter((j) => j.state === "completed");
    for (const j of done) {
      removeOfflineTracks(j.id);
      await deleteVaultMedia(j.id);
    }
    this.jobs = this.jobs.filter((j) => j.state !== "completed");
    this.emit();
  }

  private async pump() {
    if (this.runningId) return;
    const queued = this.jobs
      .filter((j) => j.state === "queued")
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.createdAt - b.createdAt);
    const next = queued[0];
    if (!next) return;

    this.runningId = next.id;
    const controller = new AbortController();
    this.controllers.set(next.id, controller);
    this.updateJob(next.id, { state: "connecting", failureReason: null });

    let writer: Awaited<ReturnType<typeof createVaultWriter>> | null = null;

    try {
      // Exact bytes already flushed to disk (OPFS or IDB chunks).
      const partialBytes = await getVaultPartialSize(next.id);
      let sourceUrl = next.source.url;

      const attemptFetch = async (urlToFetch: string, resumeBytes: number) => {
        const proxyUrl = `/api/proxy/media?url=${encodeURIComponent(urlToFetch)}`;
        return fetch(proxyUrl, {
          headers: buildResumeHeaders(resumeBytes),
          signal: controller.signal,
        });
      };

      let res = await attemptFetch(sourceUrl, partialBytes);

      // Expired CDN link auto-refresh (403/410/426) — seamlessly resolve a fresh signed link!
      if ((res.status === 403 || res.status === 410 || res.status === 426) && (next.freshRetries ?? 0) < 2) {
        this.updateJob(next.id, { state: "resolving", freshRetries: (next.freshRetries ?? 0) + 1 });
        const fresh = await resolveStreams(next.subjectId, next.detailPath, next.season, next.episode, controller.signal);
        const replacement = selectDownloadSource(fresh.sources, next.source.resolution);
        if (replacement) {
          sourceUrl = replacement.url;
          this.updateJob(next.id, { source: replacement, totalBytes: replacement.sizeBytes ?? next.totalBytes });
          res = await attemptFetch(sourceUrl, partialBytes);
        }
      }

      if (!res.ok) {
        throw new Error(`Download responded with status ${res.status}`);
      }

      const { resumeFromOffset, totalBytes } = resolveRangeResponse(
        res.status,
        res.headers.get("content-range"),
        res.headers.get("content-length"),
        partialBytes,
        next.totalBytes,
      );

      writer = await createVaultWriter(next.id, resumeFromOffset);
      let received = resumeFromOffset;

      this.updateJob(next.id, {
        state: "downloading",
        totalBytes: totalBytes ?? next.totalBytes,
        receivedBytes: received,
      });

      if (!res.body) {
        const buf = new Uint8Array(await res.arrayBuffer());
        await writer.append(buf, received);
        received += buf.byteLength;
        await writer.finalize();
        writer = null;
        this.updateJob(next.id, {
          state: "completed",
          receivedBytes: received,
          totalBytes: Math.max(received, totalBytes ?? 0),
        });
      } else {
        const reader = res.body.getReader();
        let lastEmit = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            await writer.append(value, received);
            received += value.byteLength;
            const now = Date.now();
            if (now - lastEmit >= 350) {
              lastEmit = now;
              this.updateJob(next.id, {
                receivedBytes: received,
                totalBytes: totalBytes ?? received,
              });
            }
          }
        }

        this.updateJob(next.id, {
          state: "verifying",
          receivedBytes: received,
          totalBytes: totalBytes ?? received,
        });
        await writer.finalize();
        writer = null;

        this.updateJob(next.id, {
          state: "completed",
          receivedBytes: received,
          totalBytes: totalBytes && totalBytes >= received ? totalBytes : received,
        });
      }
    } catch (err) {
      if (writer) {
        await writer.abort().catch(() => {});
        writer = null;
      }
      if (controller.signal.aborted) {
        // Keep exact on-disk progress synced cleanly so Pause/Resume restarts from exact byte!
        const diskBytes = await getVaultPartialSize(next.id);
        const jobExists = this.jobs.some((j) => j.id === next.id);
        if (jobExists) {
          this.updateJob(next.id, { receivedBytes: diskBytes });
        }
      } else {
        const diskBytes = await getVaultPartialSize(next.id);
        const msg = err instanceof Error ? err.message : "Download failed";
        this.updateJob(next.id, { state: "failed", receivedBytes: diskBytes, failureReason: msg });
      }
    } finally {
      this.controllers.delete(next.id);
      if (this.runningId === next.id) this.runningId = null;
      void this.pump();
    }
  }

  async getOfflinePlaybackUrl(jobId: string): Promise<string | null> {
    const blob = await readVaultMedia(jobId);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  async saveToDeviceFile(job: DownloadJob): Promise<void> {
    const safeName = `${job.title}${job.mediaType === "series" ? `_S${job.season}E${job.episode}` : ""}.mp4`.replace(
      /[^a-zA-Z0-9._-]+/g,
      "_",
    );
    const blob = await readVaultMedia(job.id);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }
    const a = document.createElement("a");
    a.href = `/api/proxy/media?url=${encodeURIComponent(job.source.url)}&download=1&filename=${encodeURIComponent(safeName)}`;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async getVaultCapabilities(): Promise<OfflineVaultCapabilities> {
    return detectVaultCapabilities();
  }

  async freeStorageBytes(): Promise<{ freeBytes: number | null; quotaBytes: number | null }> {
    try {
      if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        if (typeof est.quota === "number" && typeof est.usage === "number") {
          return { freeBytes: Math.max(0, est.quota - est.usage), quotaBytes: est.quota };
        }
      }
    } catch {}
    return { freeBytes: null, quotaBytes: null };
  }
}

export const webDownloadManager = new WebDownloadManager();
