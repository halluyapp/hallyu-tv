import { useMemo } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { resolveTier, stageMetrics, type Stage } from "@/design-system/stage";
import { useDisplayMode } from "@/state/DisplayModeContext";

/**
 * The live stage: real viewport + platform TV signal + the user's display-mode
 * override, resolved once per dimension change. Every screen and component
 * reads its sizes from here instead of hard-coding pixels.
 */
export function useStage(): Stage {
  const { width, height } = useWindowDimensions();
  const { mode } = useDisplayMode();

  return useMemo(() => {
    const tier = resolveTier(width, height, Platform.isTV, mode);
    const remote = mode === "tv" || (mode === "auto" && Platform.isTV);
    return stageMetrics(width, height, tier, remote, mode);
  }, [width, height, mode]);
}

export type { Stage } from "@/design-system/stage";
