import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * True when the OS "reduce motion" accessibility setting is on.
 *
 * Subscribes to live changes (RN 0.81 exposes `reduceMotionChanged`), so a user
 * who flips the setting while the app is open is respected immediately instead
 * of after a remount. Motion-driven components degrade to opacity/none.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        if (mounted) setReduced(Boolean(v));
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => {
      if (mounted) setReduced(Boolean(v));
    });

    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}
