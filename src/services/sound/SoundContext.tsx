import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Hallyu TV UI sound engine — the "Emberlight" audio layer.
 *
 * Six bundled, generated tones cover the whole interface: glass taps, warm
 * confirmations, the cinematic play swell, tab ticks, soft errors, and the
 * download-complete bell. Playback is fire-and-forget: it never blocks the
 * UI thread, never throws, and is silently skipped when the user has muted
 * sound effects or the provider has not mounted yet.
 */

export type SoundName = "tap" | "confirm" | "play" | "tab" | "error" | "complete";

const SOURCES: Record<SoundName, number> = {
  tap: require("../../../assets/sounds/soft_glass_tap.mp3"),
  confirm: require("../../../assets/sounds/warm_chime_confirm.mp3"),
  play: require("../../../assets/sounds/curtain_whoosh_swell.mp3"),
  tab: require("../../../assets/sounds/tab_nav_tick.mp3"),
  error: require("../../../assets/sounds/soft_bass_error.mp3"),
  complete: require("../../../assets/sounds/success_bell_chime.mp3"),
};

/** Per-tone loudness so quiet interface sounds stay quiet. */
const VOLUME: Record<SoundName, number> = {
  tap: 0.55,
  confirm: 0.7,
  play: 0.75,
  tab: 0.4,
  error: 0.6,
  complete: 0.7,
};

const STORAGE_KEY = "@hallyu/sound_effects_enabled";

interface SoundContextType {
  /** Whether sound effects are currently enabled. */
  enabled: boolean;
  /** Persist the preference; applies immediately. */
  setEnabled: (on: boolean) => void;
  /** Play a UI tone. Fire-and-forget; safe to call from any handler. */
  play: (name: SoundName) => void;
}

const SoundContext = createContext<SoundContextType | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(true);
  const playersRef = useRef<Partial<Record<SoundName, AudioPlayer>>>({});
  const enabledRef = useRef(true);

  // Restore the persisted preference once.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === "0") {
          enabledRef.current = false;
          setEnabledState(false);
        } else if (v === "1") {
          enabledRef.current = true;
          setEnabledState(true);
        }
      })
      .catch(() => {});
  }, []);

  const getPlayer = useCallback((name: SoundName): AudioPlayer | null => {
    try {
      let p = playersRef.current[name];
      if (!p) {
        p = createAudioPlayer(SOURCES[name]);
        p.volume = VOLUME[name];
        playersRef.current[name] = p;
      }
      return p;
    } catch {
      return null;
    }
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabledRef.current) return;
      try {
        const p = getPlayer(name);
        if (!p) return;
        p.seekTo(0);
        p.play();
      } catch {
        // Sound must never break an interaction.
      }
    },
    [getPlayer],
  );

  const setEnabled = useCallback((on: boolean) => {
    enabledRef.current = on;
    setEnabledState(on);
    AsyncStorage.setItem(STORAGE_KEY, on ? "1" : "0").catch(() => {});
  }, []);

  useEffect(() => {
    const players = playersRef.current;
    return () => {
      for (const key of Object.keys(players) as SoundName[]) {
        try {
          players[key]?.release();
        } catch {}
      }
      playersRef.current = {};
    };
  }, []);

  const value = useMemo(() => ({ enabled, setEnabled, play }), [enabled, setEnabled, play]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  // A missing provider (e.g. an early error screen) must not crash the UI.
  if (!ctx) return { enabled: false, setEnabled: () => {}, play: () => {} } satisfies SoundContextType;
  return ctx;
}
