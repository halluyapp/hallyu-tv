import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DisplayMode } from "@/design-system/stage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * The screen you are looking at cannot always be trusted to describe itself.
 * An Android box rendering 1080p on a television can report a non-TV UI mode,
 * which is how a 55" panel ends up with a phone layout. This override is the
 * escape hatch: "auto" trusts the platform and the viewport, "tv" forces the
 * 10-foot stage, "tablet" forces the mid tier.
 */

const KEY = "hallyu.displayMode.v1";

interface DisplayModeValue {
  mode: DisplayMode;
  ready: boolean;
  setMode: (mode: DisplayMode) => void;
}

const DisplayModeContext = createContext<DisplayModeValue>({
  mode: "auto",
  ready: false,
  setMode: () => {},
});

function isMode(value: string | null): value is DisplayMode {
  return value === "auto" || value === "tv" || value === "tablet";
}

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<DisplayMode>("auto");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(KEY)
      .then((value) => {
        if (mounted && isMode(value)) setModeState(value);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback((next: DisplayMode) => {
    setModeState(next);
    void AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => ({ mode, ready, setMode }), [mode, ready, setMode]);

  return <DisplayModeContext.Provider value={value}>{children}</DisplayModeContext.Provider>;
}

export function useDisplayMode(): DisplayModeValue {
  return useContext(DisplayModeContext);
}
