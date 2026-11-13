import { useEffect, useRef, useState } from "react";

export function initialsFor(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "HT";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
}

export function buildOptimizedImageUrl(uri: string, width = 360, quality = 78): string {
  if (!uri.startsWith("http://") && !uri.startsWith("https://")) return uri;
  const w = Math.min(1280, Math.max(80, Math.round(width)));
  return `/api/proxy/image?url=${encodeURIComponent(uri)}&w=${w}&q=${quality}`;
}

interface PosterProps {
  uri: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  initials?: string;
  /** Target display width in CSS pixels; proxy serves an appropriately scaled WebP/JPEG thumbnail. */
  width?: number;
  /** Prioritize loading & decode for above-the-fold Hero/Backdrop posters. */
  priority?: boolean;
}

export function Poster({
  uri,
  alt,
  className = "",
  imgClassName = "",
  initials,
  width = 340,
  priority = false,
}: PosterProps) {
  const [stage, setStage] = useState<"proxy" | "direct" | "fallback">(() => (uri ? "proxy" : "fallback"));
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const lastTargetRef = useRef<string | null>(null);

  useEffect(() => {
    const nextStage: "proxy" | "fallback" = uri ? "proxy" : "fallback";
    const key = uri ? `${uri}::${width}` : null;
    if (lastTargetRef.current !== key) {
      lastTargetRef.current = key;
      setStage(nextStage);
      const el = imgRef.current;
      // Avoid hiding already-cached images behind a stale opacity-0 transition when re-sorting or switching back.
      setLoaded(Boolean(el && el.complete && el.naturalWidth > 0 && el.dataset.target === key));
    }
  }, [uri, width]);

  const src = uri ? (stage === "proxy" ? buildOptimizedImageUrl(uri, width) : uri) : "";
  const targetKey = uri ? `${uri}::${width}` : "";

  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  if (!uri || stage === "fallback") {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-[#141C2B] via-[#0E141E] to-[#04060A] text-[#A8B4C4] font-extrabold tracking-wider select-none ${className}`}
        aria-label={alt}
      >
        <span className="text-lg opacity-80">{initials ?? initialsFor(alt)}</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#141C2B] ${className}`}>
      {!loaded ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent animate-pulse"
        />
      ) : null}
      <img
        ref={imgRef}
        data-target={targetKey}
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (stage === "proxy") {
            setLoaded(false);
            setStage("direct");
          } else {
            setStage("fallback");
          }
        }}
        className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"} ${imgClassName}`}
      />
    </div>
  );
}
