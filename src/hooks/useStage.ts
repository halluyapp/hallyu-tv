import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { resolveTier, stageMetrics, type Stage } from "@/design-system/stage";
import { deviceIsTelevision } from "@/services/device/device";
import { useDisplayMode } from "@/state/DisplayModeContext";

/**
 * The live stage: real viewport + television detection + the user's
 * display-mode override, resolved once per dimension change. Every screen and
 * component reads its sizes from here instead of hard-coding pixels.
 */
export function useStage(): Stage {
  const { width, height } = useWindowDimensions();
  const { mode } = useDisplayMode();
  const television = useMemo(() => deviceIsTelevision(), []);

  return useMemo(() => {
    const tier = resolveTier(width, height, television, mode);
    const remote = mode === "tv" || (mode === "auto" && television);
    return stageMetrics(width, height, tier, remote, mode);
  }, [width, height, mode, television]);
}

export type { Stage } from "@/design-system/stage";
