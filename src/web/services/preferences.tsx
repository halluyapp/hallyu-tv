import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type QualityPref = "auto" | "360p" | "480p" | "720p" | "1080p";
export type DownloadQualityPref = "ask" | "360p" | "480p" | "720p" | "1080p";
export type SubtitleStylePreset = "box" | "outline" | "pill";
export type CardDensity = "comfortable" | "compact";

export interface AppPreferences {
  defaultStreamQuality: QualityPref;
  defaultDownloadQuality: DownloadQualityPref;
  autoNextEpisode: boolean;
  defaultSubtitleLang: string;
  subtitleStyle: SubtitleStylePreset;
  subtitleScale: number;
  smartDownloads: boolean;
  smartDeleteWatched: boolean;
  cardDensity: CardDensity;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  defaultStreamQuality: "auto",
  defaultDownloadQuality: "ask",
  autoNextEpisode: true,
  defaultSubtitleLang: "en",
  subtitleStyle: "box",
  subtitleScale: 1,
  smartDownloads: true,
  smartDeleteWatched: false,
  cardDensity: "comfortable",
};

const STORAGE_KEY = "hallyu.preferences.v1";

export function normalizePreferences(raw: unknown): AppPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES };
  const r = raw as Record<string, unknown>;
  const streamQ = r.defaultStreamQuality;
  const dlQ = r.defaultDownloadQuality;
  const subStyle = r.subtitleStyle;
  const density = r.cardDensity;
  const scale = typeof r.subtitleScale === "number" && Number.isFinite(r.subtitleScale) ? r.subtitleScale : 1;
  return {
    defaultStreamQuality:
      streamQ === "auto" || streamQ === "360p" || streamQ === "480p" || streamQ === "720p" || streamQ === "1080p"
        ? streamQ
        : "auto",
    defaultDownloadQuality:
      dlQ === "ask" || dlQ === "360p" || dlQ === "480p" || dlQ === "720p" || dlQ === "1080p" ? dlQ : "ask",
    autoNextEpisode: typeof r.autoNextEpisode === "boolean" ? r.autoNextEpisode : true,
    defaultSubtitleLang:
      typeof r.defaultSubtitleLang === "string" && r.defaultSubtitleLang.length > 0 ? r.defaultSubtitleLang : "en",
    subtitleStyle: subStyle === "box" || subStyle === "outline" || subStyle === "pill" ? subStyle : "box",
    subtitleScale: Math.min(1.4, Math.max(0.75, scale)),
    smartDownloads: typeof r.smartDownloads === "boolean" ? r.smartDownloads : true,
    smartDeleteWatched: typeof r.smartDeleteWatched === "boolean" ? r.smartDeleteWatched : false,
    cardDensity: density === "compact" ? "compact" : "comfortable",
  };
}

export function streamQualityPreferenceValue(pref: QualityPref): string | null {
  return pref === "auto" ? null : pref;
}

export function preferredSubtitleWords(lang: string): string[] {
  switch (lang) {
    case "off":
      return [];
    case "es":
      return ["spanish", "español", "es", "spa"];
    case "fr":
      return ["french", "français", "fr", "fre"];
    case "ar":
      return ["arabic", "ar", "ara"];
    case "id":
      return ["indonesian", "indonesia", "id", "ind"];
    case "ko":
      return ["korean", "ko", "kor"];
    case "en":
    default:
      return ["english", "en", "eng"];
  }
}

interface PreferencesContextValue {
  prefs: AppPreferences;
  updatePrefs: (patch: Partial<AppPreferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<AppPreferences>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return normalizePreferences(JSON.parse(saved));
    } catch {}
    return { ...DEFAULT_PREFERENCES };
  });

  const updatePrefs = useCallback((patch: Partial<AppPreferences>) => {
    setPrefs((curr) => {
      const next = normalizePreferences({ ...curr, ...patch });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const value = useMemo(() => ({ prefs, updatePrefs }), [prefs, updatePrefs]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) return { prefs: DEFAULT_PREFERENCES, updatePrefs: () => {} };
  return ctx;
}
