import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Hallyu TV SoundEngine — the interface feedback layer.
 *
 * Seven bundled, generated tones cover the whole interface: glass taps, warm
 * confirmations, the cinematic play swell, tab ticks, soft errors, the
 * download-complete bell, and the quiet TV focus tick. Sound is optional
 * feedback, never the navigation system: every cue has a visible equivalent,
 * playback is fire-and-forget, never throws, and is silently skipped when
 * disabled or the provider has not mounted.
 * Haptics are a separate preference and skip TV devices entirely.
 */

export type SoundName = "tap" | "confirm" | "play" | "tab" | "error" | "complete" | "focus";

export interface PlayOptions {
  /** 0..1 multiplier applied on top of the tone's own loudness. */
  intensity?: number;
}

const SOURCES: Record<SoundName, number> = {
  tap: require("../../../assets/sounds/soft_glass_tap.mp3"),
  confirm: require("../../../assets/sounds/warm_chime_confirm.mp3"),
  play: require("../../../assets/sounds/curtain_whoosh_swell.mp3"),
  tab: require("../../../assets/sounds/tab_nav_tick.mp3"),
  error: require("../../../assets/sounds/soft_bass_error.mp3"),
  complete: require("../../../assets/sounds/success_bell_chime.mp3"),
  // Focus movement reuses the quiet glass tap at a much lower loudness — no new
  // asset, and d-pad scrolling never turns into a rattle of separate tones.
  focus: require("../../../assets/sounds/soft_glass_tap.mp3"),
};

/** Per-tone loudness so quiet interface sounds stay quiet (focus < select). */
const BASE_VOLUME: Record<SoundName, number> = {
  tap: 0.55,
  confirm: 0.7,
  play: 0.75,
  tab: 0.4,
  error: 0.6,
  complete: 0.7,
  focus: 0.22,
};

/** Which tones earn a haptic on handheld devices. */
const HAPTIC_TONE: Partial<Record<SoundName, () => Promise<void>>> = {
  confirm: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  complete: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  play: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
};

const ENABLED_KEY = "@hallyu/sound_effects_enabled";
const VOLUME_KEY = "@hallyu/sound_volume";
const HAPTICS_KEY = "@hallyu/haptics_enabled";

interface SoundContextType {
  /** Whether sound effects are currently enabled. */
  enabled: boolean;
  /** Global loudness multiplier, 0..1. */
  volume: number;
  /** Whether haptic feedback is currently enabled (handheld only). */
  hapticsEnabled: boolean;
  /** Persist the enable preference; applies immediately. */
  setEnabled: (on: boolean) => void;
  /** Persist the loudness preference; applies immediately. */
  setVolume: (v: number) => void;
  /** Persist the haptics preference; applies immediately. */
  setHapticsEnabled: (on: boolean) => void;
  /** Play a UI tone. Fire-and-forget; safe to call from any handler. */
  play: (name: SoundName, options?: PlayOptions) => void;
}

const SoundContext = createContext<SoundContextType | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(true);
  const [volume, setVolumeState] = useState(1);
  const [hapticsEnabled, setHapticsState] = useState(true);
  const playersRef = useRef<Partial<Record<SoundName, AudioPlayer>>>({});
  const enabledRef = useRef(true);
  const volumeRef = useRef(1);
  const hapticsRef = useRef(true);

  // Restore persisted preferences once.
  useEffect(() => {
    AsyncStorage.multiGet([ENABLED_KEY, VOLUME_KEY, HAPTICS_KEY])
      .then((rows) => {
        const [enabledRaw, volumeRaw, hapticsRaw] = rows.map(([_, v]) => v);
        if (enabledRaw === "0" || enabledRaw === "1") {
          const on = enabledRaw === "1";
          enabledRef.current = on;
          setEnabledState(on);
        }
        if (volumeRaw !== null) {
          const v = Math.min(1, Math.max(0, Number(volumeRaw)));
          if (Number.isFinite(v)) {
            volumeRef.current = v;
            setVolumeState(v);
          }
        }
        if (hapticsRaw === "0" || hapticsRaw === "1") {
          const on = hapticsRaw === "1";
          hapticsRef.current = on;
          setHapticsState(on);
        }
      })
      .catch(() => {});
  }, []);

  const applyVolume = useCallback((p: AudioPlayer, name: SoundName) => {
    p.volume = Math.min(1, Math.max(0, BASE_VOLUME[name] * volumeRef.current));
  }, []);

  const getPlayer = useCallback(
    (name: SoundName): AudioPlayer | null => {
      try {
        let p = playersRef.current[name];
        if (!p) {
          p = createAudioPlayer(SOURCES[name]);
          playersRef.current[name] = p;
        }
        applyVolume(p, name);
        return p;
      } catch {
        return null;
      }
    },
    [applyVolume],
  );

  const play = useCallback(
    (name: SoundName, options?: PlayOptions) => {
      if (!enabledRef.current) return;
      try {
        const p = getPlayer(name);
        if (!p) return;
        const intensity = options?.intensity;
        const base = BASE_VOLUME[name] * volumeRef.current;
        p.volume = typeof intensity === "number" ? Math.min(1, Math.max(0, base * intensity)) : base;
        p.seekTo(0);
        p.play();
      } catch {
        // Sound must never break an interaction.
      }
      // Paired haptic — a separate preference, skipped on TV (no tactile surface).
      if (!Platform.isTV && hapticsRef.current) {
        const haptic = HAPTIC_TONE[name];
        if (haptic) haptic().catch(() => {});
      }
    },
    [getPlayer],
  );

  const setEnabled = useCallback((on: boolean) => {
    enabledRef.current = on;
    setEnabledState(on);
    AsyncStorage.setItem(ENABLED_KEY, on ? "1" : "0").catch(() => {});
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    volumeRef.current = clamped;
    setVolumeState(clamped);
    AsyncStorage.setItem(VOLUME_KEY, String(clamped)).catch(() => {});
  }, []);

  const setHapticsEnabled = useCallback((on: boolean) => {
    hapticsRef.current = on;
    setHapticsState(on);
    AsyncStorage.setItem(HAPTICS_KEY, on ? "1" : "0").catch(() => {});
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

  const value = useMemo(
    () => ({ enabled, volume, hapticsEnabled, setEnabled, setVolume, setHapticsEnabled, play }),
    [enabled, volume, hapticsEnabled, setEnabled, setVolume, setHapticsEnabled, play],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  // A missing provider (e.g. an early error screen) must not crash the UI.
  if (!ctx)
    return {
      enabled: false,
      volume: 1,
      hapticsEnabled: false,
      setEnabled: () => {},
      setVolume: () => {},
      setHapticsEnabled: () => {},
      play: () => {},
    } satisfies SoundContextType;
  return ctx;
}
