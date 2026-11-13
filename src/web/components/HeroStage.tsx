import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Film, Info, Play, Sparkles, Star, Tv } from "lucide-react";
import type { CatalogueItem } from "@/types/provider";
import { useLibrary } from "@/web/services/library";
import { useSound } from "@/web/services/sound";
import { Poster, initialsFor } from "./Poster";

interface HeroStageProps {
  items: CatalogueItem[];
  onOpen: (item: CatalogueItem) => void;
  onPlay?: (item: CatalogueItem) => void;
}

export function HeroStage({ items, onOpen, onPlay }: HeroStageProps) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const { play } = useSound();
  const { inWatchlist, toggleWatchlist } = useLibrary();

  useEffect(() => {
    if (items.length < 2 || hovered) return;
    const timer = window.setInterval(() => {
      setIndex((curr) => (curr + 1) % items.length);
    }, 8500);
    return () => window.clearInterval(timer);
  }, [items.length, hovered]);

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [items.length, index]);

  const active = items[index] ?? items[0];
  if (!active) return null;

  const isSeries = active.mediaType === "series";
  const title = active.displayName ?? active.name;
  const saved = inWatchlist(active.subjectId);

  const goPrev = () => {
    play("tab");
    setIndex((curr) => (curr - 1 + items.length) % items.length);
  };

  const goNext = () => {
    play("tab");
    setIndex((curr) => (curr + 1) % items.length);
  };

  return (
    <section
      aria-label="Featured showcase"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        const end = e.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start === null || end === undefined || items.length < 2) return;
        const dx = end - start;
        if (dx > 48) goPrev();
        else if (dx < -48) goNext();
      }}
      className="relative mx-4 sm:mx-6 lg:mx-8 mb-6 rounded-[26px] overflow-hidden border border-white/15 bg-[#0E141E] shadow-[0_24px_64px_rgba(0,0,0,0.65)] group"
      style={{ minHeight: "clamp(320px, 46vh, 460px)" }}
    >
      <div className="absolute inset-0 overflow-hidden">
        <Poster
          uri={active.posterUrl}
          alt={title}
          initials={initialsFor(title)}
          width={960}
          priority
          className="w-full h-full"
          imgClassName="object-[center_18%] transition-transform duration-700 group-hover:scale-[1.03]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, #04060A 0%, rgba(4,6,10,0.88) 32%, rgba(4,6,10,0.38) 65%, rgba(4,6,10,0.18) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to right, rgba(4,6,10,0.86) 0%, rgba(4,6,10,0.4) 55%, transparent 100%)",
          }}
        />
      </div>

      {items.length > 1 ? (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous featured title"
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 border border-white/15 items-center justify-center text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next featured title"
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 border border-white/15 items-center justify-center text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      ) : null}

      <div className="relative z-10 flex flex-col justify-end h-full min-h-[320px] sm:min-h-[380px] p-5 sm:p-8 lg:p-10 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-[#FF5E3A]/15 border border-[#FF5E3A]/45 text-[#FF5E3A]">
            <Sparkles className="w-3 h-3" />
            Featured
          </span>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/10 border border-white/15 text-[#A8B4C4]">
            {isSeries ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
            {isSeries ? "Series" : "Movie"}
          </span>

          {active.rating ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/10 border border-white/15 text-white">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              {active.rating}
            </span>
          ) : null}

          {active.year ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/10 border border-white/15 text-[#A8B4C4]">
              {active.year}
            </span>
          ) : null}
        </div>

        <h1 className="text-2xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight text-white leading-[1.12] mb-4 line-clamp-2">
          {title}
        </h1>

        {active.description ? (
          <p className="text-sm text-[#A8B4C4] line-clamp-2 mb-5 max-w-xl hidden sm:block">
            {active.description}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                play("play");
                if (onPlay) onPlay(active);
                else onOpen(active);
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full ember-gradient text-white font-bold text-sm shadow-[0_8px_24px_rgba(255,94,58,0.4)] hover:brightness-110 active:scale-[0.98] transition"
            >
              <Play className="w-4 h-4 fill-white" />
              Watch Now
            </button>

            <button
              type="button"
              onClick={() => {
                play("tap");
                onOpen(active);
              }}
              aria-label={`Details for ${title}`}
              className="inline-flex items-center gap-1.5 px-4 py-3 rounded-full bg-white/12 hover:bg-white/20 border border-white/15 text-white font-semibold text-sm transition"
            >
              <Info className="w-4 h-4" />
              <span>Details</span>
            </button>

            <button
              type="button"
              onClick={() => {
                play(saved ? "tap" : "confirm");
                void toggleWatchlist({
                  subject_id: active.subjectId,
                  detail_path: active.slug,
                  media_type: active.mediaType,
                  title,
                  poster_url: active.posterUrl,
                });
              }}
              aria-label={saved ? `Remove ${title} from watchlist` : `Save ${title} to watchlist`}
              aria-pressed={saved}
              className={`w-11 h-11 rounded-full flex items-center justify-center border transition ${
                saved
                  ? "bg-[#FF5E3A]/20 border-[#FF8256] text-[#FF8256]"
                  : "bg-white/10 border-white/20 text-white hover:bg-white/20"
              }`}
            >
              {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            </button>
          </div>

          {items.length > 1 ? (
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Featured slides">
              {items.map((slide, i) => (
                <button
                  key={slide.subjectId}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Show featured item ${i + 1}: ${slide.displayName ?? slide.name}`}
                  onClick={() => {
                    play("tab");
                    setIndex(i);
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-7 bg-[#FF5E3A]" : "w-2 bg-white/25 hover:bg-white/45"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
