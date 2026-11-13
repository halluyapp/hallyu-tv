import { AlertCircle, Film, RefreshCw } from "lucide-react";

export function SkeletonRail({ count = 6 }: { count?: number }) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 mb-8">
      <div className="h-5 w-40 rounded-full bg-white/10 animate-pulse mb-4" />
      <div className="flex gap-3 sm:gap-4 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="shrink-0 w-[136px] sm:w-[158px] lg:w-[172px]">
            <div className="aspect-[2/3] w-full rounded-2xl bg-white/8 border border-white/8 animate-pulse" />
            <div className="h-3.5 w-3/4 rounded bg-white/10 animate-pulse mt-2.5" />
            <div className="h-2.5 w-1/2 rounded bg-white/6 animate-pulse mt-1.5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 mx-auto max-w-md">
      <div className="w-14 h-14 rounded-full glass-panel-bright flex items-center justify-center mb-4 text-[#A8B4C4]">
        <Film className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-bold text-white mb-1.5">{title}</h3>
      <p className="text-sm text-[#A8B4C4] leading-relaxed">{message}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 px-5 py-2.5 rounded-full ember-gradient text-white text-sm font-bold hover:brightness-110 transition"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 mx-auto max-w-md">
      <div className="w-14 h-14 rounded-full bg-red-500/15 border border-red-500/35 flex items-center justify-center mb-4 text-red-400">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-bold text-white mb-1.5">Connection interrupted</h3>
      <p className="text-sm text-[#A8B4C4] leading-relaxed mb-5">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full ember-gradient text-white text-sm font-bold hover:brightness-110 transition"
      >
        <RefreshCw className="w-4 h-4" />
        Try again
      </button>
    </div>
  );
}
