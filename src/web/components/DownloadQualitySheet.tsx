import { useState } from "react";
import { ArrowDownToLine, Captions, Check, HardDrive, X } from "lucide-react";
import type { StreamSource } from "@/types/provider";
import { selectableSources } from "@/services/provider/streams";
import { formatBytes } from "@/utils/format";

function qualityHint(resolution: string | null): string {
  const r = (resolution ?? "").toLowerCase();
  if (r.includes("1080")) return "Sharpest Full HD · Best on Wi-Fi";
  if (r.includes("720")) return "Crisp HD · Balanced storage";
  if (r.includes("480")) return "Standard · Fast download";
  if (r.includes("360")) return "Data Saver · Lightest size";
  return "MP4 offline package";
}

interface DownloadQualitySheetProps {
  title: string;
  subtitle?: string | null;
  sources: StreamSource[];
  freeBytes: number | null;
  preferredQuality: string;
  onStart: (source: StreamSource, rememberDefault: boolean) => void;
  onClose: () => void;
}

export function DownloadQualitySheet({
  title,
  subtitle,
  sources,
  freeBytes,
  preferredQuality,
  onStart,
  onClose,
}: DownloadQualitySheetProps) {
  const options = selectableSources(sources).filter((s) => !s.format.toUpperCase().includes("HLS"));
  const initialIndex = Math.max(
    0,
    options.findIndex((o) =>
      preferredQuality !== "ask"
        ? (o.resolution ?? "").toLowerCase().includes(preferredQuality.toLowerCase())
        : (o.resolution ?? "").toLowerCase().includes("360"),
    ),
  );
  const [selectedIdx, setSelectedIdx] = useState(initialIndex);
  const [remember, setRemember] = useState(false);

  const chosen = options[selectedIdx] ?? options[0] ?? null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
    >
      <div
        role="dialog"
        aria-label="Download quality"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md glass-panel-bright rounded-3xl p-5 space-y-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF8256]">Download for Offline</p>
            <h2 className="text-base font-extrabold text-white truncate mt-0.5">{title}</h2>
            {subtitle ? <p className="text-xs text-[#A8B4C4] truncate">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close download options"
            className="p-1.5 rounded-full bg-white/10 text-[#A8B4C4] hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {options.length === 0 ? (
          <p className="text-sm text-[#A8B4C4] py-4 text-center">No MP4 download streams available for this item.</p>
        ) : (
          <div className="space-y-2 max-h-[45vh] overflow-y-auto">
            {options.map((opt, idx) => {
              const active = idx === selectedIdx;
              return (
                <button
                  key={`${opt.url}-${idx}`}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={`w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl border text-left transition ${
                    active
                      ? "bg-[#FF5E3A]/15 border-[#FF8256] text-white"
                      : "bg-white/5 border-white/10 text-[#A8B4C4] hover:bg-white/10"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">{opt.resolution ?? opt.format}</p>
                    <p className="text-xs text-[#6B7787]">{qualityHint(opt.resolution)}</p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-xs font-mono font-semibold text-white">
                      {opt.sizeBytes ? formatBytes(opt.sizeBytes) : "MP4"}
                    </span>
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                        active ? "bg-[#FF5E3A] border-[#FF8256] text-white" : "border-white/25"
                      }`}
                    >
                      {active ? <Check className="w-3 h-3" /> : null}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-[#A8B4C4] px-1">
          <span className="inline-flex items-center gap-1.5">
            <Captions className="w-3.5 h-3.5 text-[#FF8256]" />
            Subtitles bundled automatically
          </span>
          {freeBytes !== null ? (
            <span className="inline-flex items-center gap-1 font-mono">
              <HardDrive className="w-3.5 h-3.5" />
              {formatBytes(freeBytes)} free
            </span>
          ) : null}
        </div>

        <label className="flex items-center gap-2.5 text-xs text-[#A8B4C4] cursor-pointer px-1">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="accent-[#FF5E3A] w-4 h-4 rounded"
          />
          <span>Always use {chosen?.resolution ?? "this quality"} for quick downloads</span>
        </label>

        {chosen ? (
          <button
            type="button"
            onClick={() => onStart(chosen, remember)}
            className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-full ember-gradient text-white font-bold text-sm shadow-[0_8px_24px_rgba(255,94,58,0.35)] hover:brightness-110 transition"
          >
            <ArrowDownToLine className="w-4 h-4" />
            Download {chosen.resolution ?? "MP4"}
            {chosen.sizeBytes ? ` (${formatBytes(chosen.sizeBytes)})` : ""}
          </button>
        ) : null}
      </div>
    </div>
  );
}
