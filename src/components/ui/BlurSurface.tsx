import { materials, type MaterialName } from "@/design-system/materials";
import { effects } from "@/hooks/useDeviceTier";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * Real blur, rationed.
 *
 * A live blur pass is the most expensive thing this UI can do, so:
 *  - it is only rendered on device tiers that can afford it (`effects().blur`);
 *  - a module-level budget caps how many blurred surfaces may exist at once, so
 *    a screen with ten panels cannot accidentally create ten GPU passes;
 *  - the layered tint + edge light from `Glass` always renders underneath, so
 *    when blur is skipped the surface looks identical in structure, just
 *    without the refraction.
 *
 * Use this only for `primary` and `elevated` materials — the tab bar, player
 * chrome, and dialogs/sheets. Never inside a scrolling list.
 */

let activeSurfaces = 0;

export const BLUR_BUDGET = {
  get active() {
    return activeSurfaces;
  },
};

interface BlurSurfaceProps {
  children?: React.ReactNode;
  material?: Extract<MaterialName, "primary" | "elevated">;
  style?: StyleProp<ViewStyle>;
  radius: number;
}

export function BlurSurface({ children, material = "primary", style, radius }: BlurSurfaceProps) {
  const m = materials[material];
  const fx = effects();
  const holderRef = useRef<View>(null);
  const registered = useRef(false);
  const canRender = fx.blur && activeSurfaces < fx.blurSurfaces;

  useEffect(() => {
    if (!canRender) return;
    if (!registered.current) {
      activeSurfaces += 1;
      registered.current = true;
      if (__DEV__ && activeSurfaces > 4) {
        console.warn(`[glass] ${activeSurfaces} blurred surfaces active — budget is ${fx.blurSurfaces}`);
      }
    }
    return () => {
      if (registered.current) {
        activeSurfaces = Math.max(0, activeSurfaces - 1);
        registered.current = false;
      }
    };
  }, [canRender, fx.blurSurfaces]);

  return (
    <View ref={holderRef} style={[styles.clip, { borderRadius: radius }, style]}>
      {canRender ? (
        <BlurView
          intensity={material === "elevated" ? 40 : 55}
          tint="dark"
          experimentalBlurMethod={m.blurMethod === "dimezisBlurView" ? "dimezisBlurView" : "none"}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {/* Tint + light always render: the material must read as glass even with
          no blur underneath it. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: m.fill }]} />
      <LinearGradient
        pointerEvents="none"
        colors={[m.highlight[0], m.highlight[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.4 }}
        style={styles.edge}
      />
      <View style={[styles.border, { borderRadius: radius, borderColor: m.border }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  edge: { position: "absolute", top: 0, left: 0, right: 0, height: 1 },
  border: { ...StyleSheet.absoluteFillObject, borderWidth: 1 },
});
