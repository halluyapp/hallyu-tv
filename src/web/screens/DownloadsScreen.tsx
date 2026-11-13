import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  HardDrive,
  ListChecks,
  Pause,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { DownloadJob } from "@/services/downloads/types";
import { formatBytes } from "@/utils/format";
import { Poster, initialsFor } from "@/web/components/Poster";
import { EmptyState } from "@/web/components/States";
import { loadOfflineTracks, webDownloadManager } from "@/web/services/downloads";
import type { OfflineVaultCapabilities } from "@/web/services/downloadStorage";
import { useLibrary } from "@/web/services/library";
import { usePreferences } from "@/web/services/preferences";
import { useSound } from "@/web/services/sound";
import type { PlaybackLaunchParams } from "./DetailsScreen";

const STATE_LABEL: Record<string, string> = {
  queued: "Queued",
  resolving: "Refreshing link…",
  connecting: "Connecting…",
  downloading: "Downloading",
  paused: "Paused",
  waiting_for_network: "Waiting for network",
  verifying: "Writing to vault…",
  completed: "Ready offline",
  failed: "Failed",
  cancelled: "Cancelled",
};

interface SpeedSample {
  bytesPerSec: number;
  etaSeconds: number | null;
}

interface DownloadGroup {
  key: string;
  title: string;
  posterUrl: string | null;
  mediaType: DownloadJob["mediaType"];
  jobs: DownloadJob[];
}

interface DownloadsScreenProps {
  onPlayOffline: (params: PlaybackLaunchParams) => void;
  onExplore: () => void;
}

export function DownloadsScreen({ onPlayOffline, onExplore }: DownloadsScreenProps) {
  const { resumeFor } = useLibrary();
  const { prefs, updatePrefs } = usePreferences();
  const { play } = useSound();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [storageInfo, setStorageInfo] = useState<{ freeBytes: number | null; quotaBytes: number | null }>({
    freeBytes: null,
    quotaBytes: null,
  });
  const [vaultCaps, setVaultCaps] = useState<OfflineVaultCapabilities | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [speeds, setSpeeds] = useState<Map<string, SpeedSample>>(new Map());
  const prevStates = useRef(new Map<string, string>());
  const samplesRef = useRef(new Map<string, { t: number; bytes: number }>());

  useEffect(() => {
    void webDownloadManager.freeStorageBytes().then(setStorageInfo);
    void webDownloadManager.getVaultCapabilities().then(setVaultCaps);
    return webDownloadManager.subscribe((nextJobs) => {
      setJobs(nextJobs);
      void webDownloadManager.freeStorageBytes().then(setStorageInfo);
    });
  }, []);

  useEffect(() => {
    for (const job of jobs) {
      const prev = prevStates.current.get(job.id);
      if (prev !== undefined && prev !== job.state) {
        if (job.state === "completed") play("complete");
        else if (job.state === "failed") play("error");
      }
      prevStates.current.set(job.id, job.state);
    }
  }, [jobs, play]);

  useEffect(() => {
    const now = Date.now();
    const next = new Map<string, SpeedSample>();
    for (const job of jobs) {
      if (job.state !== "downloading") {
        samplesRef.current.delete(job.id);
        continue;
      }
      const prev = samplesRef.current.get(job.id);
      if (prev && now - prev.t >= 1200 && job.receivedBytes >= prev.bytes) {
        const dt = (now - prev.t) / 1000;
        const bytesPerSec = (job.receivedBytes - prev.bytes) / dt;
        const remaining = job.totalBytes && job.totalBytes > job.receivedBytes ? job.totalBytes - job.receivedBytes : null;
        next.set(job.id, {
          bytesPerSec,
          etaSeconds: bytesPerSec > 1024 && remaining !== null ? remaining / bytesPerSec : null,
        });
      }
      samplesRef.current.set(job.id, { t: now, bytes: job.receivedBytes });
    }
    setSpeeds(next);
  }, [jobs]);

  const { usedBytes, moviesBytes, seriesBytes, hasActive, hasPausedOrFailed, completedCount } = useMemo(() => {
    let movies = 0;
    let series = 0;
    let active = false;
    let pausedOrFailed = false;
    let completed = 0;
    for (const j of jobs) {
      const sz = j.state === "completed" ? j.totalBytes ?? j.receivedBytes : j.receivedBytes;
      if (j.mediaType === "series") series += sz;
      else movies += sz;
      if (j.state === "downloading" || j.state === "connecting" || j.state === "queued") active = true;
      if (j.state === "paused" || j.state === "failed") pausedOrFailed = true;
      if (j.state === "completed") completed += 1;
    }
    return {
      usedBytes: movies + series,
      moviesBytes: movies,
      seriesBytes: series,
      hasActive: active,
      hasPausedOrFailed: pausedOrFailed,
      completedCount: completed,
    };
  }, [jobs]);

  const removableSelected = useMemo(
    () => Array.from(selected).filter((id) => jobs.some((j) => j.id === id)),
    [selected, jobs],
  );

  const groups = useMemo(() => {
    const map = new Map<string, DownloadGroup>();
    for (const job of jobs) {
      const key = job.mediaType === "series" ? `series:${job.subjectId}` : `job:${job.id}`;
      const existing = map.get(key);
      if (existing) existing.jobs.push(job);
      else map.set(key, { key, title: job.title, posterUrl: job.posterUrl, mediaType: job.mediaType, jobs: [job] });
    }
    for (const group of map.values()) {
      group.jobs.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
    }
    return Array.from(map.values());
  }, [jobs]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const launchOffline = (job: DownloadJob) => {
    const p = resumeFor(job.subjectId, job.season || null, job.episode || null);
    play("play");
    onPlayOffline({
      subjectId: job.subjectId,
      detailPath: job.detailPath,
      title: job.title,
      posterUrl: job.posterUrl,
      mediaType: job.mediaType,
      season: job.season,
      episode: job.episode,
      resumeAt: p && !p.completed ? p.position_seconds : 0,
      sources: [
        {
          url: job.finalPath,
          resolution: job.source.resolution ?? "Offline",
          qualityValue: job.source.qualityValue,
          format: "MP4",
          codec: job.source.codec,
          sizeBytes: job.totalBytes,
          durationSeconds: null,
          sourceLabel: "Offline",
          preview: false,
          verifiedFullLength: true,
        },
      ],
      nextEpisode: null,
    });
  };

  const renderJob = (job: DownloadJob, compact = false) => {
    const pct = job.totalBytes && job.totalBytes > 0 ? Math.min(100, (job.receivedBytes / job.totalBytes) * 100) : null;
    const isActive =
      job.state === "downloading" ||
      job.state === "connecting" ||
      job.state === "queued" ||
      job.state === "verifying" ||
      job.state === "resolving";
    const speed = job.state === "downloading" ? speeds.get(job.id) : undefined;
    const checked = selected.has(job.id);
    const hasBundledSubs = loadOfflineTracks(job.id).length > 0;
    const prog = resumeFor(job.subjectId, job.season || null, job.episode || null);
    const watchPct =
      prog && prog.duration_seconds > 0 ? Math.min(100, Math.round((prog.position_seconds / prog.duration_seconds) * 100)) : 0;

    return (
      <div
        key={job.id}
        className={`glass-panel rounded-2xl p-4 flex items-center gap-4 ${compact ? "ml-4 sm:ml-8" : ""}`}
      >
        {selecting ? (
          <button
            type="button"
            onClick={() => toggleSelected(job.id)}
            aria-label={`Select ${job.title}`}
            className="shrink-0"
          >
            {checked ? <CheckCircle2 className="w-5 h-5 text-[#FF8256]" /> : <Circle className="w-5 h-5 text-[#6B7787]" />}
          </button>
        ) : null}

        {!compact ? (
          <div className="relative w-16 aspect-[2/3] rounded-lg overflow-hidden shrink-0 border border-white/10">
            <Poster uri={job.posterUrl} alt={job.title} initials={initialsFor(job.title)} width={160} className="w-full h-full" />
            {watchPct > 0 ? (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-black/75">
                <div className="h-full ember-gradient" style={{ width: `${watchPct}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-white truncate">
              {compact && job.mediaType === "series" ? `Episode ${job.episode}` : job.title}
            </h3>
            {hasBundledSubs ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-[#A8B4C4] shrink-0">CC</span>
            ) : null}
          </div>
          <p className="text-xs text-[#A8B4C4]">
            {[
              job.mediaType === "series" && job.season ? `S${job.season} · E${job.episode}` : "Movie",
              STATE_LABEL[job.state] ?? job.state,
              job.source.resolution,
              job.totalBytes
                ? `${formatBytes(job.receivedBytes)} / ${formatBytes(job.totalBytes)}`
                : formatBytes(job.receivedBytes),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {speed ? (
            <p className="text-[11px] font-mono text-[#A8B4C4]">
              {formatBytes(speed.bytesPerSec)}/s
              {speed.etaSeconds ? ` · ${Math.max(1, Math.round(speed.etaSeconds / 60))} min left` : ""}
            </p>
          ) : null}

          {job.failureReason ? <p className="text-xs text-red-400">{job.failureReason}</p> : null}

          {isActive || job.state === "paused" ? (
            <div className="h-1.5 w-full rounded-full bg-white/12 overflow-hidden">
              <div
                className="h-full ember-gradient transition-all"
                style={{ width: pct !== null ? `${pct}%` : "12%", opacity: pct !== null ? 1 : 0.5 }}
              />
            </div>
          ) : null}

          {!selecting ? (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {job.state === "queued" ? (
                <button
                  type="button"
                  onClick={() => webDownloadManager.moveToFront(job.id)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#FF8256] hover:underline"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  Download next
                </button>
              ) : null}

              {job.state === "completed" ? (
                <>
                  <button
                    type="button"
                    onClick={() => launchOffline(job)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:underline"
                  >
                    <Play className="w-3.5 h-3.5 fill-emerald-400" />
                    Play offline
                  </button>
                  <button
                    type="button"
                    onClick={() => void webDownloadManager.saveToDeviceFile(job)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#A8B4C4] hover:text-white"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Export MP4
                  </button>
                </>
              ) : null}

              {job.state === "downloading" ? (
                <button
                  type="button"
                  onClick={() => webDownloadManager.pause(job.id)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 hover:underline"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
              ) : null}

              {job.state === "paused" || job.state === "failed" || job.state === "cancelled" ? (
                <button
                  type="button"
                  onClick={() => webDownloadManager.resume(job.id)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-white hover:underline"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  {job.state === "paused" ? "Resume" : "Retry"}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => void webDownloadManager.delete(job.id)}
                className="inline-flex items-center gap-1 text-xs font-bold text-red-400 hover:underline"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-white">Downloads</h1>
        {jobs.length > 0 ? (
          <div className="flex items-center gap-2">
            {hasActive ? (
              <button
                type="button"
                onClick={() => webDownloadManager.pauseAll()}
                className="px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold text-amber-300 hover:bg-white/15"
              >
                Pause all
              </button>
            ) : hasPausedOrFailed ? (
              <button
                type="button"
                onClick={() => webDownloadManager.resumeAll()}
                className="px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold text-[#FF8256] hover:bg-white/15"
              >
                Resume all
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (selecting) {
                  setSelecting(false);
                  setSelected(new Set());
                } else {
                  setSelecting(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white"
            >
              <ListChecks className="w-4 h-4 text-[#A8B4C4]" />
              {selecting ? "Done" : "Select"}
            </button>
          </div>
        ) : null}
      </div>

      {/* Netflix-Style Smart Downloads Banner */}
      <div className="glass-panel rounded-2xl p-4 mb-4 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-[#FF5E3A]/15 border border-[#FF5E3A]/40 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-[#FF8256]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Smart Downloads</p>
            <p className="text-xs text-[#6B7787]">
              Automatically downloads the next episode when watching offline series.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.smartDownloads}
          aria-label="Toggle Smart Downloads"
          onClick={() => updatePrefs({ smartDownloads: !prefs.smartDownloads })}
          className={`w-12 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
            prefs.smartDownloads ? "bg-[#FF5E3A]" : "bg-[#141C2B]"
          }`}
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white transition-transform ${
              prefs.smartDownloads ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Netflix-Style Device Storage Breakdown */}
      <div className="glass-panel-bright rounded-2xl p-4 mb-5 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <HardDrive className="w-4 h-4 text-[#FF8256]" />
          <span className="text-sm font-bold text-white">Offline Storage Vault</span>
          {vaultCaps ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-[#A8B4C4]">
              {vaultCaps.persistent ? <ShieldCheck className="w-3 h-3 text-emerald-400" /> : null}
              {vaultCaps.engine}
            </span>
          ) : null}
          <span className="ml-auto text-xs font-semibold text-[#A8B4C4] font-mono">
            {storageInfo.freeBytes !== null
              ? `${formatBytes(usedBytes)} used · ${formatBytes(storageInfo.freeBytes)} free`
              : `${formatBytes(usedBytes)} used`}
          </span>
        </div>

        <div className="h-2 rounded-full bg-white/10 overflow-hidden flex">
          {usedBytes > 0 ? (
            <>
              {moviesBytes > 0 ? (
                <div
                  className="h-full bg-[#FF5E3A]"
                  style={{
                    width: `${
                      storageInfo.freeBytes !== null && storageInfo.freeBytes > 0
                        ? Math.max(2, (moviesBytes / (usedBytes + storageInfo.freeBytes)) * 100)
                        : (moviesBytes / Math.max(1, usedBytes)) * 100
                    }%`,
                  }}
                />
              ) : null}
              {seriesBytes > 0 ? (
                <div
                  className="h-full bg-sky-400"
                  style={{
                    width: `${
                      storageInfo.freeBytes !== null && storageInfo.freeBytes > 0
                        ? Math.max(2, (seriesBytes / (usedBytes + storageInfo.freeBytes)) * 100)
                        : (seriesBytes / Math.max(1, usedBytes)) * 100
                    }%`,
                  }}
                />
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6B7787]">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#FF5E3A]" /> Movies ({formatBytes(moviesBytes)})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" /> Series ({formatBytes(seriesBytes)})
            </span>
          </div>
          {completedCount > 1 ? (
            <button
              type="button"
              onClick={() => void webDownloadManager.deleteCompleted()}
              className="text-red-400 hover:underline font-semibold"
            >
              Clear finished
            </button>
          ) : null}
        </div>
      </div>

      {selecting && selected.size > 0 ? (
        <div className="mb-4 p-3.5 rounded-2xl bg-[#FF5E3A]/15 border border-[#FF8256] flex items-center justify-between">
          <span className="text-xs font-bold text-[#FF8256]">{selected.size} selected</span>
          {removableSelected.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                for (const id of removableSelected) void webDownloadManager.delete(id);
                setSelecting(false);
                setSelected(new Set());
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400 hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete selected
            </button>
          ) : null}
        </div>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          title="No downloads yet"
          message="Open any movie or episode and tap Download to save it to your persistent offline device vault."
          actionLabel="Explore titles"
          onAction={onExplore}
        />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const first = group.jobs[0];
            if (!first) return null;
            if (!(group.mediaType === "series" && group.jobs.length > 1)) {
              return renderJob(first);
            }
            const open = expanded.has(group.key);
            const received = group.jobs.reduce((sum, j) => sum + j.receivedBytes, 0);
            const ready = group.jobs.filter((j) => j.state === "completed").length;

            return (
              <div key={group.key} className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                  className="w-full glass-panel rounded-2xl p-4 flex items-center gap-4 text-left hover:bg-white/8 transition"
                >
                  <div className="relative w-16 aspect-[2/3] rounded-lg overflow-visible shrink-0">
                    <Poster
                      uri={group.posterUrl}
                      alt={group.title}
                      initials={initialsFor(group.title)}
                      width={160}
                      className="w-full h-full rounded-lg border border-white/10"
                    />
                    <span className="absolute -right-1.5 -bottom-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#FF5E3A] text-white text-[11px] font-extrabold flex items-center justify-center">
                      {group.jobs.length}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-white truncate">{group.title}</h3>
                    <p className="text-xs text-[#A8B4C4] mt-0.5">
                      {group.jobs.length} episodes · {ready} ready · {formatBytes(received)}
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#FF8256] mt-2">
                      {open ? "Hide episodes" : "Show episodes"}
                      {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  </div>
                </button>
                {open ? <div className="space-y-2">{group.jobs.map((j) => renderJob(j, true))}</div> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
