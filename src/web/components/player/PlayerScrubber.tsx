import { useState, type RefObject } from "react";

export function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

interface PlayerScrubberProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  position: number;
  duration: number;
  buffered: number;
  onSeek: (nextSeconds: number) => void;
}

export function PlayerScrubber({ position, duration, buffered, onSeek }: PlayerScrubberProps) {
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [draggingValue, setDraggingValue] = useState<number | null>(null);

  const effectivePos = draggingValue !== null ? draggingValue : position;
  const pct = duration > 0 ? Math.min(100, Math.max(0, (effectivePos / duration) * 100)) : 0;
  const bufPct = duration > 0 ? Math.min(100, Math.max(0, (buffered / duration) * 100)) : 0;

  const bubblePct = draggingValue !== null ? pct : hoverPct;
  const bubbleSeconds =
    bubblePct !== null && duration > 0 ? (bubblePct / 100) * duration : null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono text-[#A8B4C4] w-12 text-right tabular-nums">
        {formatClock(effectivePos)}
      </span>

      <div
        className="relative flex-1 h-7 flex items-center group"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width > 0) {
            setHoverPct(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
          }
        }}
        onMouseLeave={() => setHoverPct(null)}
      >
        {bubbleSeconds !== null && bubblePct !== null ? (
          <div
            className="pointer-events-none absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/90 border border-white/20 text-[11px] font-mono font-bold text-white shadow-lg"
            style={{ left: `${Math.min(96, Math.max(4, bubblePct))}%` }}
          >
            {formatClock(bubbleSeconds)}
          </div>
        ) : null}

        <div className="w-full h-1.5 group-hover:h-2 transition-all rounded-full bg-white/20 overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${bufPct}%` }} />
          <div className="absolute inset-y-0 left-0 ember-gradient" style={{ width: `${pct}%` }} />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute w-3.5 h-3.5 -ml-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,94,58,0.8)] opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${pct}%` }}
        />

        <input
          type="range"
          aria-label="Seek timeline"
          min={0}
          max={Math.max(1, duration)}
          step={0.5}
          value={effectivePos}
          onInput={(e) => setDraggingValue(Number((e.target as HTMLInputElement).value))}
          onChange={(e) => {
            const next = Number(e.target.value);
            setDraggingValue(null);
            onSeek(next);
          }}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>

      <span className="text-xs font-mono text-[#A8B4C4] w-12 tabular-nums">{formatClock(duration)}</span>
    </div>
  );
}
