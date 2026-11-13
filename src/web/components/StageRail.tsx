import { useRef } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useSound } from "@/web/services/sound";
import { Poster, initialsFor } from "./Poster";

export interface RailEntry {
  key: string;
  posterUrl: string | null;
  title: string;
  meta: string | null;
  progress: number | null;
  onPress: () => void;
  onPlay?: () => void;
}

interface StageRailProps {
  label: string;
  entries: RailEntry[];
  onSeeAll?: () => void;
  compact?: boolean;
}

export function StageRail({ label, entries, onSeeAll, compact = false }: StageRailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { play } = useSound();

  if (entries.length === 0) return null;

  const scrollBy = (dir: number) => {
    scrollerRef.current?.scrollBy({ left: dir * 480, behavior: "smooth" });
  };

  const thumbWidth = compact ? 260 : 340;

  return (
    <section
      className="mb-8"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 300px" }}
    >
      <div className="flex items-center px-4 sm:px-6 lg:px-8 mb-3 gap-2.5">
        <span className="w-1 h-5 rounded-full ember-gradient shrink-0" aria-hidden="true" />
        <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">{label}</h2>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/10 border border-white/10 text-[#A8B4C4]">
          {entries.length}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label={`Scroll ${label} left`}
              className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-[#A8B4C4] hover:text-white transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label={`Scroll ${label} right`}
              className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-[#A8B4C4] hover:text-white transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {onSeeAll ? (
            <button
              type="button"
              onClick={() => {
                play("tap");
                onSeeAll();
              }}
              aria-label={`See all ${label}`}
              className="text-xs font-bold text-[#FF5E3A] hover:text-[#FF8256] px-2 py-1 rounded-md transition"
            >
              See all
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar px-4 sm:px-6 lg:px-8 py-1.5 scroll-smooth"
      >
        {entries.map((entry) => (
          <div
            key={entry.key}
            className={`group shrink-0 relative transition-transform duration-200 hover:-translate-y-1 ${
              compact ? "w-[116px] sm:w-[136px]" : "w-[136px] sm:w-[158px] lg:w-[172px]"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                play("tap");
                entry.onPress();
              }}
              aria-label={`${entry.title}${entry.meta ? `, ${entry.meta}` : ""}`}
              className="w-full text-left"
            >
              <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E141E] border border-white/12 group-hover:border-[#FF8256]/70 group-hover:shadow-[0_12px_30px_rgba(255,94,58,0.2)] transition-all">
                <Poster
                  uri={entry.posterUrl}
                  alt={entry.title}
                  initials={initialsFor(entry.title)}
                  width={thumbWidth}
                  className="w-full h-full"
                />
                {entry.progress !== null && entry.progress > 0 ? (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-black/75">
                    <div
                      className="h-full ember-gradient"
                      style={{ width: `${Math.min(100, Math.max(4, entry.progress))}%` }}
                    />
                  </div>
                ) : null}
              </div>
              <p className="mt-2 px-0.5 text-[13px] font-semibold text-white truncate group-hover:text-[#FF8256] transition-colors">
                {entry.title}
              </p>
              {entry.meta ? (
                <p className="px-0.5 text-[11px] font-medium text-[#6B7787] truncate">{entry.meta}</p>
              ) : null}
            </button>

            {entry.onPlay ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  play("play");
                  entry.onPlay?.();
                }}
                aria-label={`Resume ${entry.title}`}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/75 border border-white/25 flex items-center justify-center text-white hover:bg-[#FF5E3A] hover:border-[#FF8256] transition shadow-lg"
              >
                <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
