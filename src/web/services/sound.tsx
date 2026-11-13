import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type SoundName = "tap" | "confirm" | "play" | "tab" | "error" | "complete";

const SOURCES: Record<SoundName, string> = {
  tap: "/assets/sounds/soft_glass_tap.mp3",
  confirm: "/assets/sounds/warm_chime_confirm.mp3",
  play: "/assets/sounds/curtain_whoosh_swell.mp3",
  tab: "/assets/sounds/tab_nav_tick.mp3",
  error: "/assets/sounds/soft_bass_error.mp3",
  complete: "/assets/sounds/success_bell_chime.mp3",
};

const BASE_VOLUME: Record<SoundName, number> = {
  tap: 0.55,
  confirm: 0.7,
  play: 0.75,
  tab: 0.4,
  error: 0.6,
  complete: 0.7,
};

const ENABLED_KEY = "hallyu.sound.enabled";
const VOLUME_KEY = "hallyu.sound.volume";

interface SoundContextType {
  enabled: boolean;
  volume: number;
  setEnabled: (on: boolean) => void;
  setVolume: (v: number) => void;
  play: (name: SoundName, intensity?: number) => void;
}

const SoundContext = createContext<SoundContextType | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(ENABLED_KEY);
      return saved === "1";
    } catch {
      return false;
    }
  });

  const [volume, setVolumeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      const parsed = saved !== null ? Number(saved) : 1;
      return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
    } catch {
      return 1;
    }
  });

  const enabledRef = useRef(enabled);
  const volumeRef = useRef(volume);
  const poolRef = useRef<Partial<Record<SoundName, HTMLAudioElement>>>({});

  enabledRef.current = enabled;
  volumeRef.current = volume;

  const setEnabled = useCallback((on: boolean) => {
    enabledRef.current = on;
    setEnabledState(on);
    try {
      localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
    } catch {}
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    volumeRef.current = clamped;
    setVolumeState(clamped);
    try {
      localStorage.setItem(VOLUME_KEY, String(clamped));
    } catch {}
  }, []);

  const play = useCallback((name: SoundName, intensity?: number) => {
    if (!enabledRef.current || typeof Audio === "undefined") return;
    try {
      let audio = poolRef.current[name];
      if (!audio) {
        audio = new Audio(SOURCES[name]);
        audio.preload = "auto";
        poolRef.current[name] = audio;
      }
      const base = BASE_VOLUME[name] * volumeRef.current;
      const finalVol = typeof intensity === "number" ? Math.min(1, Math.max(0, base * intensity)) : base;
      audio.volume = finalVol;
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Ignore browser autoplay restrictions silently.
      });
    } catch {
      // Never let optional audio feedback break UI interaction.
    }
  }, []);

  useEffect(() => {
    const pool = poolRef.current;
    return () => {
      for (const key of Object.keys(pool) as SoundName[]) {
        try {
          pool[key]?.pause();
        } catch {}
      }
    };
  }, []);

  const value = useMemo(
    () => ({ enabled, volume, setEnabled, setVolume, play }),
    [enabled, volume, setEnabled, setVolume, play],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextType {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    return {
      enabled: false,
      volume: 1,
      setEnabled: () => {},
      setVolume: () => {},
      play: () => {},
    };
  }
  return ctx;
}
