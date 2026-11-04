import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * True when the OS "reduce motion" accessibility setting is on. Motion-driven
 * components must degrade to opacity/none when this is true — movement is
 * enhancement, never a requirement.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Queried on mount; RN does not expose a cross-platform change event for
    // this setting, so a remount (e.g. re-entering a screen) refreshes it.
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        if (mounted) setReduced(Boolean(v));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  return reduced;
}
