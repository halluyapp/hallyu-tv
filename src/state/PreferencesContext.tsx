import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IS_TV } from "@/config/appVariant";
import { getPerformanceProfile } from "@/hooks/useDeviceTier";

export type QualityPreference = "auto" | "1080p" | "720p" | "480p" | "360p";
export type SubtitleLanguagePref = "en" | "ko" | "zh" | "ja" | "es" | "fr" | "ar" | "id" | "off";

export interface ViewerPreferences {
  preferredQuality: QualityPreference;
  preferredSubtitleLang: SubtitleLanguagePref;
  subtitleScale: number;
  autoPlayNext: boolean;
  heroTrailerPreview: boolean;
  reduceMotion: boolean;
}

const PREFS_STORAGE_KEY = "hallyu.preferences.v1";

export function defaultPreferences(): ViewerPreferences {
  const lowRam = getPerformanceProfile().isLowRam;
  return {
    preferredQuality: "auto",
    preferredSubtitleLang: "en",
    subtitleScale: 1,
    autoPlayNext: true,
    heroTrailerPreview: IS_TV && !lowRam,
    reduceMotion: lowRam,
  };
}

const VALID_QUALITIES: QualityPreference[] = ["auto", "1080p", "720p", "480p", "360p"];
const VALID_LANGS: SubtitleLanguagePref[] = ["en", "ko", "zh", "ja", "es", "fr", "ar", "id", "off"];

export function normalizePreferences(raw: unknown): ViewerPreferences {
  const base = defaultPreferences();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  return {
    preferredQuality: VALID_QUALITIES.includes(r.preferredQuality as QualityPreference)
      ? (r.preferredQuality as QualityPreference)
      : base.preferredQuality,
    preferredSubtitleLang: VALID_LANGS.includes(r.preferredSubtitleLang as SubtitleLanguagePref)
      ? (r.preferredSubtitleLang as SubtitleLanguagePref)
      : base.preferredSubtitleLang,
    subtitleScale:
      typeof r.subtitleScale === "number" && r.subtitleScale >= 0.75 && r.subtitleScale <= 1.6
        ? r.subtitleScale
        : base.subtitleScale,
    autoPlayNext: typeof r.autoPlayNext === "boolean" ? r.autoPlayNext : base.autoPlayNext,
    heroTrailerPreview: typeof r.heroTrailerPreview === "boolean" ? r.heroTrailerPreview : base.heroTrailerPreview,
    reduceMotion: typeof r.reduceMotion === "boolean" ? r.reduceMotion : base.reduceMotion,
  };
}

export const LANGUAGE_LABELS: Record<SubtitleLanguagePref, string> = {
  en: "English",
  ko: "Korean",
  zh: "Chinese",
  ja: "Japanese",
  es: "Spanish",
  fr: "French",
  ar: "Arabic",
  id: "Indonesian",
  off: "Off by default",
};

export function languageMatchTokens(pref: SubtitleLanguagePref): string[] {
  switch (pref) {
    case "en":
      return ["english", "eng", "en"];
    case "ko":
      return ["korean", "kor", "ko"];
    case "zh":
      return ["chinese", "mandarin", "zh", "chi"];
    case "ja":
      return ["japanese", "jpn", "ja"];
    case "es":
      return ["spanish", "spa", "es"];
    case "fr":
      return ["french", "fra", "fr"];
    case "ar":
      return ["arabic", "ara", "ar"];
    case "id":
      return ["indonesian", "ind", "id", "bahasa"];
    case "off":
      return [];
  }
}

export function qualityPreferenceLabel(pref: QualityPreference, isTv = IS_TV): string {
  if (pref === "auto") return isTv ? "Auto HD (1080p)" : "Data Saver (360p)";
  return pref;
}

interface PreferencesContextValue {
  prefs: ViewerPreferences;
  updatePrefs: (patch: Partial<ViewerPreferences>) => Promise<void>;
  resetPrefs: () => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ViewerPreferences>(defaultPreferences);
  const prefsRef = useRef(prefs);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = normalizePreferences(JSON.parse(raw));
        prefsRef.current = parsed;
        setPrefs(parsed);
      })
      .catch(() => {});
  }, []);

  const updatePrefs = useCallback(async (patch: Partial<ViewerPreferences>) => {
    const next = normalizePreferences({ ...prefsRef.current, ...patch });
    prefsRef.current = next;
    setPrefs(next);
    try {
      await AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const resetPrefs = useCallback(async () => {
    const next = defaultPreferences();
    prefsRef.current = next;
    setPrefs(next);
    try {
      await AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const value = useMemo(() => ({ prefs, updatePrefs, resetPrefs }), [prefs, updatePrefs, resetPrefs]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    return {
      prefs: defaultPreferences(),
      updatePrefs: async () => {},
      resetPrefs: async () => {},
    };
  }
  return ctx;
}
