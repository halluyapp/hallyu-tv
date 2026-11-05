import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { IS_TV } from "@/config/appVariant";
import { resolveTier, stageMetrics, type Stage } from "@/design-system/stage";
import { deviceIsTelevision } from "@/services/device/device";
import { useDisplayMode } from "@/state/DisplayModeContext";

/**
 * The live stage: real viewport + build variant + television detection + user
 * display-mode override. In the dedicated `tv` APK (`IS_TV === true`), 10-foot
 * stage metrics are guaranteed even on 960x540dp Android TV boxes.
 */
export function useStage(): Stage {
  const { width, height } = useWindowDimensions();
  const { mode } = useDisplayMode();
  const television = useMemo(() => IS_TV || deviceIsTelevision(), []);

  return useMemo(() => {
    const effectiveMode = IS_TV ? "tv" : mode;
    const tier = resolveTier(width, height, television, effectiveMode);
    const remote = IS_TV || effectiveMode === "tv" || (effectiveMode === "auto" && television);
    return stageMetrics(width, height, tier, remote, effectiveMode);
  }, [width, height, mode, television]);
}

export type { Stage } from "@/design-system/stage";
