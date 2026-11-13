import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Check,
  Clapperboard,
  Download,
  Film,
  Monitor,
  Pause,
  Play,
  Star,
  Tv,
  X,
} from "lucide-react";
import type { DownloadJob } from "@/services/downloads/types";
import { fetchDetail, resolveStreams } from "@/services/provider/adapter";
import { selectDownloadSource } from "@/services/provider/streams";
import { ProviderError, type SeasonInfo, type StreamSource, type TitleDetail } from "@/types/provider";
import { DownloadQualitySheet } from "@/web/components/DownloadQualitySheet";
import { Poster, initialsFor } from "@/web/components/Poster";
import { ErrorState } from "@/web/components/States";
import { jobIdFor, webDownloadManager } from "@/web/services/downloads";
import { useLibrary } from "@/web/services/library";
import { usePreferences } from "@/web/services/preferences";
import { useSound } from "@/web/services/sound";

export interface PlaybackLaunchParams {
  subjectId: string;
  detailPath: string;
  title: string;
  posterUrl: string | null;
  mediaType: "movie" | "series";
  season: number;
  episode: number;
  resumeAt: number;
  sources: StreamSource[];
  nextEpisode: { season: number; episode: number } | null;
  seasons?: SeasonInfo[];
}

function nextEpisodeFor(
  detail: TitleDetail,
  season: number,
  episode: number,
): { season: number; episode: number } | null {
  if (detail.mediaType !== "series") return null;
  const current = detail.seasons.find((s) => s.season === season);
  if (current && episode < current.maxEp) return { season, episode: episode + 1 };
  const later = detail.seasons.filter((s) => s.season > season).sort((a, b) => a.season - b.season)[0];
  return later ? { season: later.season, episode: 1 } : null;
}

function CircularProgress({ pct, active }: { pct: number; active: boolean }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(4, pct)) / 100) * c;
  return (
    <svg className="w-5 h-5 -rotate-90" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke={active ? "#FF8256" : "#A8B4C4"}
        strokeWidth="2.5"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

interface DetailsScreenProps {
  detailPath: string;
  onBack: () => void;
  onPlay: (params: PlaybackLaunchParams) => void;
  onGoDownloads: () => void;
}

export function DetailsScreen({ detailPath, onBack, onPlay, onGoDownloads }: DetailsScreenProps) {
  const { inWatchlist, toggleWatchlist, resumeFor, latestFor, loading: libraryLoading } = useLibrary();
  const { play: playTone } = useSound();
  const { prefs, updatePrefs } = usePreferences();

  const [detail, setDetail] = useState<TitleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [episode, setEpisode] = useState(1);
  const [resolving, setResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [qualityPicker, setQualityPicker] = useState<{
    season: number;
    episode: number;
    sources: StreamSource[];
    freeBytes: number | null;
  } | null>(null);
  const [seasonDownloading, setSeasonDownloading] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => webDownloadManager.subscribe(setJobs), []);

  const jobMap = useMemo(() => {
    const map = new Map<string, DownloadJob>();
    for (const j of jobs) map.set(j.id, j);
    return map;
  }, [jobs]);

  const load = useCallback(async () => {
    setError(null);
    setDetail(null);
    setResolutionError(null);
    initializedRef.current = false;
    try {
      const d = await fetchDetail(detailPath);
      setDetail(d);
    } catch (err) {
      setError(err instanceof ProviderError ? err.message : "Could not load this title.");
    }
  }, [detailPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detail || libraryLoading || initializedRef.current) return;
    initializedRef.current = true;
    if (detail.mediaType !== "series") {
      setSeason(null);
      setEpisode(1);
      return;
    }
    const latest = latestFor(detail.subjectId);
    const matched = latest?.season_number != null ? detail.seasons.find((s) => s.season === latest.season_number) : null;
    const first = matched ?? detail.seasons[0] ?? null;
    setSeason(first);
    const ep = matched && latest?.episode_number != null ? latest.episode_number : 1;
    setEpisode(first ? Math.min(Math.max(1, ep), first.maxEp) : 1);
  }, [detail, libraryLoading, latestFor]);

  const saved = detail ? inWatchlist(detail.subjectId) : false;
  const currentSeason = detail?.mediaType === "series" ? season?.season ?? 1 : null;
  const activeDownloadJob = detail
    ? jobMap.get(jobIdFor({ subjectId: detail.subjectId, season: currentSeason ?? 0, episode: currentSeason ? episode : 0 })) ?? null
    : null;

  const resume = useMemo(() => {
    if (!detail) return null;
    return resumeFor(detail.subjectId, currentSeason, currentSeason ? episode : null);
  }, [detail, resumeFor, currentSeason, episode]);

  const showToast = (msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => setStatusNotice((curr) => (curr === msg ? null : curr)), 4000);
  };

  // Offline-first playback: plays local disk file instantly if already downloaded!
  const handlePlay = useCallback(
    async (opts: { resumeAt: number; season?: number | null; episode?: number | null }) => {
      if (!detail || resolving) return;
      const selSeason = opts.season !== undefined ? opts.season : currentSeason;
      const selEpisode = opts.episode !== undefined ? opts.episode : currentSeason ? episode : 0;
      const sNum = selSeason ?? 0;
      const eNum = selEpisode ?? 0;

      const offline = webDownloadManager.getCompletedJob(detail.subjectId, sNum, eNum);
      if (offline) {
        playTone("play");
        onPlay({
          subjectId: detail.subjectId,
          detailPath: detail.detailPath,
          title: detail.title,
          posterUrl: detail.posterUrl,
          mediaType: detail.mediaType,
          season: sNum,
          episode: eNum,
          resumeAt: opts.resumeAt,
          sources: [
            {
              url: offline.finalPath,
              resolution: offline.source.resolution ?? "Offline",
              qualityValue: offline.source.qualityValue,
              format: "MP4",
              codec: offline.source.codec,
              sizeBytes: offline.totalBytes,
              durationSeconds: null,
              sourceLabel: "Offline",
              preview: false,
              verifiedFullLength: true,
            },
          ],
          nextEpisode: nextEpisodeFor(detail, sNum, eNum),
          seasons: detail.seasons,
        });
        return;
      }

      setResolving(true);
      setResolutionError(null);
      try {
        const res = await resolveStreams(detail.subjectId, detail.detailPath, sNum, eNum);
        playTone("play");
        onPlay({
          subjectId: detail.subjectId,
          detailPath: detail.detailPath,
          title: detail.title,
          posterUrl: detail.posterUrl,
          mediaType: detail.mediaType,
          season: sNum,
          episode: eNum,
          resumeAt: opts.resumeAt,
          sources: res.sources,
          nextEpisode: nextEpisodeFor(detail, sNum, eNum),
          seasons: detail.seasons,
        });
      } catch (err) {
        playTone("error");
        setResolutionError(
          err instanceof ProviderError ? err.message : "Could not start playback. Try again shortly.",
        );
      } finally {
        setResolving(false);
      }
    },
    [detail, resolving, currentSeason, episode, playTone, onPlay],
  );

  const triggerDownloadFor = useCallback(
    async (targetSeason: number, targetEpisode: number) => {
      if (!detail || resolving) return;
      const existing = jobMap.get(jobIdFor({ subjectId: detail.subjectId, season: targetSeason, episode: targetEpisode }));

      if (existing) {
        if (existing.state === "downloading" || existing.state === "queued" || existing.state === "connecting") {
          webDownloadManager.pause(existing.id);
          showToast("Download paused.");
          return;
        }
        if (existing.state === "paused" || existing.state === "failed") {
          webDownloadManager.resume(existing.id);
          showToast("Resuming download…");
          return;
        }
        if (existing.state === "completed") {
          onGoDownloads();
          return;
        }
      }

      setResolving(true);
      setResolutionError(null);
      try {
        const [res, storageInfo] = await Promise.all([
          resolveStreams(detail.subjectId, detail.detailPath, targetSeason, targetEpisode),
          webDownloadManager.freeStorageBytes(),
        ]);

        // If user chose a default download quality (not "ask"), start immediately cleanly on Details!
        if (prefs.defaultDownloadQuality !== "ask") {
          const pick = selectDownloadSource(res.sources, prefs.defaultDownloadQuality);
          if (pick) {
            await webDownloadManager.enqueue(
              {
                subjectId: detail.subjectId,
                detailPath: detail.detailPath,
                season: targetSeason,
                episode: targetEpisode,
                title: detail.title,
                posterUrl: detail.posterUrl,
                mediaType: detail.mediaType,
                source: pick,
                expectedBytes: pick.sizeBytes,
              },
              prefs.defaultSubtitleLang,
            );
            playTone("confirm");
            showToast(
              targetSeason > 0
                ? `Downloading S${targetSeason} E${targetEpisode} (${pick.resolution ?? "MP4"})`
                : `Downloading ${pick.resolution ?? "MP4"}`,
            );
            return;
          }
        }

        setQualityPicker({
          season: targetSeason,
          episode: targetEpisode,
          sources: res.sources,
          freeBytes: storageInfo.freeBytes,
        });
      } catch (err) {
        playTone("error");
        setResolutionError(err instanceof ProviderError ? err.message : "Could not prepare download.");
      } finally {
        setResolving(false);
      }
    },
    [detail, resolving, jobMap, prefs.defaultDownloadQuality, prefs.defaultSubtitleLang, playTone, onGoDownloads],
  );

  const handleDownloadSeason = useCallback(async () => {
    if (!detail || !season || seasonDownloading) return;
    setSeasonDownloading(true);
    playTone("confirm");
    const preferred = prefs.defaultDownloadQuality === "ask" ? "360p" : prefs.defaultDownloadQuality;
    showToast(`Queuing Season ${season.season} (${season.maxEp} episodes)…`);
    try {
      const added = await webDownloadManager.enqueueSeason(
        detail,
        season.season,
        season.maxEp,
        preferred,
        prefs.defaultSubtitleLang,
      );
      showToast(added > 0 ? `Queued ${added} episodes for offline viewing.` : "Season episodes already downloaded.");
    } finally {
      setSeasonDownloading(false);
    }
  }, [detail, season, seasonDownloading, prefs.defaultDownloadQuality, prefs.defaultSubtitleLang, playTone]);

  const handleToggleWatchlist = useCallback(() => {
    if (!detail) return;
    playTone(saved ? "tap" : "confirm");
    void toggleWatchlist({
      subject_id: detail.subjectId,
      detail_path: detail.detailPath,
      media_type: detail.mediaType,
      title: detail.title,
      poster_url: detail.posterUrl,
    });
  }, [detail, saved, playTone, toggleWatchlist]);

  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  if (!detail) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 pb-12">
        <div className="h-[340px] rounded-[26px] bg-white/8 animate-pulse mb-6" />
        <div className="h-8 w-64 rounded bg-white/10 animate-pulse mb-3" />
        <div className="h-4 w-96 max-w-full rounded bg-white/6 animate-pulse" />
      </div>
    );
  }

  const synopsis = detail.description ?? "No synopsis was provided for this title.";
  const episodes = season ? Array.from({ length: season.maxEp }, (_, i) => i + 1) : [];
  const isSeries = detail.mediaType === "series";

  const activePct =
    activeDownloadJob && activeDownloadJob.totalBytes && activeDownloadJob.totalBytes > 0
      ? Math.round((activeDownloadJob.receivedBytes / activeDownloadJob.totalBytes) * 100)
      : 0;

  return (
    <div className="pb-16">
      {/* Cinematic Backdrop */}
      <div className="relative mx-4 sm:mx-6 lg:mx-8 rounded-[26px] overflow-hidden border border-white/12 bg-[#0E141E] h-[280px] sm:h-[380px]">
        <Poster
          uri={detail.backdropUrl ?? detail.posterUrl}
          alt={detail.title}
          initials={initialsFor(detail.title)}
          width={960}
          priority
          className="w-full h-full"
          imgClassName="object-[center_18%]"
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to top, #04060A 0%, rgba(4,6,10,0.65) 50%, rgba(4,6,10,0.2) 100%)",
          }}
        />
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="absolute top-4 left-4 w-11 h-11 rounded-full glass-panel-bright flex items-center justify-center text-white hover:bg-white/20 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Main Detail Content */}
      <div className="px-7 sm:px-10 lg:px-12 -mt-12 relative z-10 max-w-5xl">
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">{detail.title}</h1>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          {detail.releaseDate ? (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/15 text-[#A8B4C4]">
              {detail.releaseDate.slice(0, 4)}
            </span>
          ) : null}

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/15 text-[#A8B4C4]">
            {isSeries ? <Tv className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
            {isSeries ? "Series" : "Movie"}
          </span>

          {detail.rating ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-white/10 border border-white/15 text-white">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              {detail.rating}
            </span>
          ) : null}

          {detail.country ? (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/15 text-[#A8B4C4]">
              {detail.country}
            </span>
          ) : null}
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            disabled={resolving}
            onClick={() => void handlePlay({ resumeAt: resume && !resume.completed ? resume.position_seconds : 0 })}
            className="flex-1 sm:flex-none min-w-[200px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full ember-gradient text-white font-bold text-sm shadow-[0_8px_24px_rgba(255,94,58,0.35)] hover:brightness-110 disabled:opacity-60 transition"
          >
            <Play className="w-4 h-4 fill-white" />
            {resolving
              ? "Preparing…"
              : activeDownloadJob?.state === "completed"
                ? resume && !resume.completed
                  ? "Resume Offline"
                  : "Play Offline"
                : resume && !resume.completed
                  ? "Resume"
                  : "Play Now"}
          </button>

          <button
            type="button"
            onClick={handleToggleWatchlist}
            aria-label={saved ? "Remove from Watchlist" : "Add to Watchlist"}
            aria-pressed={saved}
            className={`w-12 h-12 rounded-full flex items-center justify-center border transition ${
              saved
                ? "bg-[#FF5E3A]/15 border-[#FF8256] text-[#FF8256]"
                : "bg-white/10 border-white/20 text-[#A8B4C4] hover:text-white"
            }`}
          >
            {saved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
          </button>

          <button
            type="button"
            disabled={resolving}
            onClick={() => void triggerDownloadFor(currentSeason ?? 0, currentSeason ? episode : 0)}
            aria-label={
              activeDownloadJob?.state === "completed"
                ? "Downloaded offline · View in Downloads"
                : activeDownloadJob?.state === "downloading"
                  ? "Downloading · Tap to pause"
                  : "Download for offline viewing"
            }
            className={`h-12 rounded-full border flex items-center justify-center gap-2 transition disabled:opacity-50 ${
              activeDownloadJob?.state === "completed"
                ? "px-4 bg-emerald-500/15 border-emerald-400/50 text-emerald-300"
                : activeDownloadJob && activeDownloadJob.state !== "failed"
                  ? "px-4 bg-[#FF5E3A]/15 border-[#FF8256] text-white"
                  : "w-12 bg-white/10 border-white/20 text-[#A8B4C4] hover:text-white"
            }`}
          >
            {activeDownloadJob?.state === "completed" ? (
              <>
                <Check className="w-4 h-4" />
                <span className="text-xs font-bold">Saved</span>
              </>
            ) : activeDownloadJob?.state === "downloading" ||
              activeDownloadJob?.state === "connecting" ||
              activeDownloadJob?.state === "queued" ? (
              <>
                <CircularProgress pct={activePct} active />
                <span className="text-xs font-mono font-bold">{activePct}%</span>
              </>
            ) : activeDownloadJob?.state === "paused" ? (
              <>
                <Pause className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono font-bold">{activePct}%</span>
              </>
            ) : (
              <Download className="w-5 h-5" />
            )}
          </button>

          {detail.trailerUrl ? (
            <button
              type="button"
              onClick={() => {
                playTone("tap");
                setTrailerOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-white/10 border border-white/20 text-xs font-bold text-white hover:bg-white/15 transition"
            >
              <Clapperboard className="w-4 h-4 text-[#FF8256]" />
              Trailer
            </button>
          ) : null}
        </div>

        {statusNotice ? (
          <div className="mb-4 px-4 py-2.5 rounded-2xl bg-[#FF5E3A]/15 border border-[#FF8256]/40 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-white">{statusNotice}</span>
            <button
              type="button"
              onClick={onGoDownloads}
              className="text-xs font-bold text-[#FF8256] hover:underline shrink-0"
            >
              View Downloads
            </button>
          </div>
        ) : null}

        {resolutionError ? <p className="text-sm font-medium text-red-400 mb-4">{resolutionError}</p> : null}

        {/* Genres */}
        {detail.genre ? (
          <div className="flex flex-wrap gap-2 mb-5">
            {detail.genre
              .split(",")
              .slice(0, 6)
              .map((g) => (
                <span
                  key={g}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-[#A8B4C4]"
                >
                  {g.trim()}
                </span>
              ))}
          </div>
        ) : null}

        {/* Synopsis Card */}
        <div className="glass-panel rounded-2xl p-5 mb-8">
          <p className={`text-sm text-[#A8B4C4] leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>{synopsis}</p>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-3 text-xs font-bold text-[#FF5E3A] hover:text-[#FF8256]"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        </div>

        {/* Episodes */}
        {isSeries && detail.seasons.length > 0 ? (
          <section className="mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-bold text-white">Episodes</h2>
              {season ? (
                <button
                  type="button"
                  disabled={seasonDownloading}
                  onClick={() => void handleDownloadSeason()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white disabled:opacity-50 transition"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5 text-[#FF8256]" />
                  {seasonDownloading ? "Queuing season…" : `Download Season ${season.season}`}
                </button>
              ) : null}
            </div>

            {detail.seasons.length > 1 ? (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-4">
                {detail.seasons.map((s) => {
                  const active = season?.season === s.season;
                  return (
                    <button
                      key={s.season}
                      type="button"
                      onClick={() => {
                        setSeason(s);
                        setEpisode(1);
                      }}
                      className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition ${
                        active
                          ? "ember-gradient border-[#FF8256] text-white"
                          : "bg-white/10 border-white/12 text-[#A8B4C4] hover:text-white"
                      }`}
                    >
                      Season {s.season}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {episodes.map((ep) => {
                const sNum = season!.season;
                const p = resumeFor(detail.subjectId, sNum, ep);
                const watched = p ? p.completed || p.position_seconds / Math.max(p.duration_seconds, 1) > 0.9 : false;
                const isCurrent = episode === ep;
                const epJob = jobMap.get(jobIdFor({ subjectId: detail.subjectId, season: sNum, episode: ep }));
                const epPct =
                  epJob && epJob.totalBytes && epJob.totalBytes > 0
                    ? Math.round((epJob.receivedBytes / epJob.totalBytes) * 100)
                    : 0;

                return (
                  <div
                    key={ep}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition ${
                      isCurrent ? "bg-white/12 border-[#FF8256]" : "glass-panel hover:bg-white/8"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setEpisode(ep);
                        void handlePlay({
                          resumeAt: p && !p.completed ? p.position_seconds : 0,
                          season: sNum,
                          episode: ep,
                        });
                      }}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                          isCurrent ? "bg-[#FF5E3A] text-white" : "bg-white/10 text-[#A8B4C4]"
                        }`}
                      >
                        {ep}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">Episode {ep}</p>
                        <p className="text-xs text-[#6B7787] truncate">
                          {epJob?.state === "completed"
                            ? "Offline ready"
                            : watched
                              ? "Completed"
                              : p
                                ? `${Math.floor(p.position_seconds / 60)}m watched`
                                : "Tap to play"}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void triggerDownloadFor(sNum, ep)}
                      aria-label={
                        epJob?.state === "completed"
                          ? `Episode ${ep} downloaded`
                          : epJob?.state === "downloading"
                            ? `Downloading Episode ${ep} ${epPct}%`
                            : `Download Episode ${ep}`
                      }
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 hover:bg-white/10 transition text-[#A8B4C4] hover:text-white"
                    >
                      {epJob?.state === "completed" ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : epJob?.state === "downloading" || epJob?.state === "queued" || epJob?.state === "connecting" ? (
                        <CircularProgress pct={epPct} active />
                      ) : epJob?.state === "paused" ? (
                        <Pause className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Cast */}
        {detail.cast.length > 0 ? (
          <section className="mb-8">
            <h2 className="text-lg font-bold text-white mb-3">Cast</h2>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {detail.cast.slice(0, 10).map((c, idx) => (
                <div key={`${c.name}-${idx}`} className="w-20 shrink-0 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full overflow-hidden border border-white/20 mb-2">
                    <Poster uri={c.avatarUrl} alt={c.name} initials={initialsFor(c.name)} width={160} className="w-full h-full" />
                  </div>
                  <p className="text-xs font-semibold text-white truncate w-full">{c.name}</p>
                  {c.character ? <p className="text-[11px] text-[#6B7787] truncate w-full">{c.character}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex items-center justify-center gap-2 text-xs text-[#6B7787] pt-4">
          <Monitor className="w-3.5 h-3.5" />
          <span>Offline downloads and watch history are stored locally in your device vault.</span>
        </div>
      </div>

      {/* Pre-Download Quality Sheet */}
      {qualityPicker ? (
        <DownloadQualitySheet
          title={detail.title}
          subtitle={qualityPicker.season > 0 ? `Season ${qualityPicker.season} · Episode ${qualityPicker.episode}` : "Full Movie"}
          sources={qualityPicker.sources}
          freeBytes={qualityPicker.freeBytes}
          preferredQuality={prefs.defaultDownloadQuality}
          onClose={() => setQualityPicker(null)}
          onStart={(pickedSource, remember) => {
            if (remember && pickedSource.resolution) {
              const res = pickedSource.resolution.toLowerCase();
              if (res.includes("1080")) updatePrefs({ defaultDownloadQuality: "1080p" });
              else if (res.includes("720")) updatePrefs({ defaultDownloadQuality: "720p" });
              else if (res.includes("480")) updatePrefs({ defaultDownloadQuality: "480p" });
              else if (res.includes("360")) updatePrefs({ defaultDownloadQuality: "360p" });
            }
            const target = qualityPicker;
            setQualityPicker(null);
            void webDownloadManager.enqueue(
              {
                subjectId: detail.subjectId,
                detailPath: detail.detailPath,
                season: target.season,
                episode: target.episode,
                title: detail.title,
                posterUrl: detail.posterUrl,
                mediaType: detail.mediaType,
                source: pickedSource,
                expectedBytes: pickedSource.sizeBytes,
              },
              prefs.defaultSubtitleLang,
            );
            playTone("confirm");
            showToast(
              target.season > 0
                ? `Downloading S${target.season} E${target.episode} (${pickedSource.resolution ?? "MP4"})`
                : `Downloading ${detail.title} (${pickedSource.resolution ?? "MP4"})`,
            );
          }}
        />
      ) : null}

      {/* Trailer Modal */}
      {trailerOpen && detail.trailerUrl ? (
        <div
          onClick={() => setTrailerOpen(false)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <div
            role="dialog"
            aria-label={`${detail.title} trailer`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl glass-panel-bright rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
              <span className="text-sm font-bold text-white truncate">{detail.title} — Trailer</span>
              <button
                type="button"
                onClick={() => setTrailerOpen(false)}
                aria-label="Close trailer"
                className="p-1.5 rounded-full bg-white/10 text-[#A8B4C4] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <video
              src={`/api/proxy/media?url=${encodeURIComponent(detail.trailerUrl)}`}
              controls
              autoPlay
              playsInline
              className="w-full aspect-video bg-black"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
