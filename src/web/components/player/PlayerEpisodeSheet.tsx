import { useEffect, useState } from "react";
import { Check, Play, X } from "lucide-react";
import { fetchDetail } from "@/services/provider/adapter";
import type { SeasonInfo } from "@/types/provider";
import { webDownloadManager } from "@/web/services/downloads";
import { useLibrary } from "@/web/services/library";

interface PlayerEpisodeSheetProps {
  subjectId: string;
  detailPath: string;
  currentSeason: number;
  currentEpisode: number;
  initialSeasons?: SeasonInfo[];
  onSelectEpisode: (season: number, episode: number) => void;
  onClose: () => void;
}

export function PlayerEpisodeSheet({
  subjectId,
  detailPath,
  currentSeason,
  currentEpisode,
  initialSeasons,
  onSelectEpisode,
  onClose,
}: PlayerEpisodeSheetProps) {
  const { resumeFor } = useLibrary();
  const [seasons, setSeasons] = useState<SeasonInfo[]>(initialSeasons ?? []);
  const [selectedSeason, setSelectedSeason] = useState<number>(Math.max(1, currentSeason));
  const [loading, setLoading] = useState(!initialSeasons || initialSeasons.length === 0);

  useEffect(() => {
    if (initialSeasons && initialSeasons.length > 0) return;
    let cancelled = false;
    setLoading(true);
    void fetchDetail(detailPath)
      .then((d) => {
        if (cancelled) return;
        setSeasons(d.seasons);
        if (!d.seasons.some((s) => s.season === selectedSeason) && d.seasons[0]) {
          setSelectedSeason(d.seasons[0].season);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailPath, initialSeasons, selectedSeason]);

  const activeSeasonObj = seasons.find((s) => s.season === selectedSeason) ?? seasons[0];
  const epCount = activeSeasonObj?.maxEp ?? 0;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="absolute inset-0 z-30 bg-black/65 flex items-end sm:items-center justify-center p-4"
    >
      <div
        role="dialog"
        aria-label="Episodes"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg glass-panel-bright rounded-3xl p-5 max-h-[82vh] flex flex-col gap-3"
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <h2 className="text-base font-bold text-white">Episodes</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close episodes"
            className="p-1.5 rounded-full bg-white/10 text-[#A8B4C4] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {seasons.length > 1 ? (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 shrink-0">
            {seasons.map((s) => {
              const active = s.season === (activeSeasonObj?.season ?? selectedSeason);
              return (
                <button
                  key={s.season}
                  type="button"
                  onClick={() => setSelectedSeason(s.season)}
                  className={`shrink-0 px-3.5 py-1 rounded-full text-xs font-bold border ${
                    active ? "ember-gradient border-[#FF8256] text-white" : "bg-white/8 border-white/10 text-[#A8B4C4]"
                  }`}
                >
                  Season {s.season}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <p className="text-xs text-[#A8B4C4] py-4 text-center">Loading episode list…</p>
          ) : epCount === 0 ? (
            <p className="text-xs text-[#A8B4C4] py-4 text-center">No episodes found for this series.</p>
          ) : (
            Array.from({ length: epCount }, (_, i) => i + 1).map((ep) => {
              const sNum = activeSeasonObj!.season;
              const isPlayingNow = sNum === currentSeason && ep === currentEpisode;
              const prog = resumeFor(subjectId, sNum, ep);
              const pct =
                prog && prog.duration_seconds > 0
                  ? Math.min(100, Math.round((prog.position_seconds / prog.duration_seconds) * 100))
                  : 0;
              const offline = Boolean(webDownloadManager.getCompletedJob(subjectId, sNum, ep));

              return (
                <button
                  key={ep}
                  type="button"
                  onClick={() => {
                    onSelectEpisode(sNum, ep);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                    isPlayingNow
                      ? "bg-[#FF5E3A]/15 border-[#FF8256] text-white"
                      : "bg-white/5 border-white/10 text-[#A8B4C4] hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                      isPlayingNow ? "bg-[#FF5E3A] text-white" : "bg-white/10 text-white"
                    }`}
                  >
                    {isPlayingNow ? <Play className="w-3.5 h-3.5 fill-white ml-0.5" /> : ep}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white truncate">Episode {ep}</span>
                      {offline ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 shrink-0">
                          <Check className="w-3 h-3" />
                          Offline
                        </span>
                      ) : null}
                    </div>
                    {pct > 0 ? (
                      <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full ember-gradient" style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
