import { Poster, initialsFor } from "@/components/ui/Poster";
import { glass, liftShadow } from "@/design-system/depth";
import { motion } from "@/design-system/motion";
import type { Stage } from "@/design-system/stage";
import { palette } from "@/design-system/tokens";
import { canAffordAmbience } from "@/hooks/useDeviceTier";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/services/sound/SoundContext";
import type { CatalogueItem } from "@/types/provider";
import { LinearGradient } from "expo-linear-gradient";
import { Play } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

/**
 * HeroStage — the title that owns the wall.
 *
 * Three light layers (art, scrim, ember spill), a slow camera drift that never
 * stops, and a crossfade to the next featured title. The whole panel is one
 * pressable target, so a remote can open it with a single OK.
 */
export function HeroStage({
  items,
  stage,
  onOpen,
}: {
  items: CatalogueItem[];
  stage: Stage;
  onOpen: (item: CatalogueItem) => void;
}) {
  const reduced = useReducedMotion();
  const afford = canAffordAmbience();
  const { play } = useSound();
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  // Rotate the featured title. Paused for reduced motion and single-item sets.
  useEffect(() => {
    if (items.length < 2 || reduced) return;
    const timer = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 520, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setIndex((current) => (current + 1) % items.length);
        Animated.timing(fade, { toValue: 1, duration: 720, useNativeDriver: true }).start();
      });
    }, 11_000);
    return () => clearInterval(timer);
  }, [items.length, reduced, fade]);

  // Ken Burns: the still image is never completely still.
  useEffect(() => {
    if (reduced || !afford) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 16_000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 16_000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduced, afford]);

  // One arrival per screen: the hero content settles after the art.
  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    const anim = Animated.timing(enter, {
      toValue: 1,
      duration: motion.cinematic,
      delay: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [enter, reduced]);

  const current = items[index] ?? items[0];

  const open = useCallback(() => {
    if (!current) return;
    play("play");
    onOpen(current);
  }, [current, onOpen, play]);

  if (!current) return null;

  const radius = stage.focusRing * 7;
  const contentWidth = Math.min(stage.width * 0.62, stage.width - stage.gutter * 2);
  const enterY = enter.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  const artScale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.09] });

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${current.name}`}
      style={[
        styles.hero,
        liftShadow(2),
        {
          height: stage.heroHeight,
          marginHorizontal: stage.gutter,
          borderRadius: radius,
        },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, transform: [{ scale: artScale }] }]}>
        <Poster uri={current.posterUrl} style={StyleSheet.absoluteFill} initials={initialsFor(current.name)} />
      </Animated.View>

      {/* Vertical scrim: the art falls into the room, never into the copy. */}
      <LinearGradient
        colors={["rgba(8,10,13,0.02)", "rgba(8,10,13,0.48)", "rgba(8,10,13,0.99)"]}
        locations={[0.22, 0.62, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Left scrim for copy legibility. */}
      <LinearGradient
        colors={["rgba(8,10,13,0.92)", "rgba(8,10,13,0.35)", "rgba(8,10,13,0)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 0.8, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Ember spill from the bottom-right corner: the projector's light. */}
      <LinearGradient
        colors={["rgba(240,120,85,0.30)", "rgba(240,120,85,0)"]}
        start={{ x: 1, y: 1 }}
        end={{ x: 0.15, y: 0.1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Top hairline: a glass edge catching the room light. */}
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderTopWidth: 1, borderColor: glass.rim }]} pointerEvents="none" />

      <Animated.View
        style={{
          position: "absolute",
          left: stage.gutter * 1.15,
          bottom: stage.gutter * 0.95,
          width: contentWidth,
          opacity: enter,
          transform: [{ translateY: enterY }],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: stage.cardGap * 0.55 }}>
          <View
            style={{
              width: Math.max(4, stage.u * 0.7),
              height: Math.max(4, stage.u * 0.7),
              borderRadius: 99,
              backgroundColor: palette.accent,
              marginRight: stage.cardGap * 0.5,
            }}
          />
          <Text
            style={{
              color: palette.accentBright,
              fontSize: Math.max(10, Math.round(stage.metaSize * 0.95)),
              fontWeight: "800",
              letterSpacing: Math.max(1, stage.metaSize * 0.16),
              textTransform: "uppercase",
            }}
          >
            {index === 0 ? "Featured tonight" : "Up next"}
          </Text>
        </View>

        <Text
          numberOfLines={2}
          style={{
            color: palette.textPrimary,
            fontSize: stage.heroTitleSize,
            fontWeight: "800",
            letterSpacing: -stage.heroTitleSize * 0.025,
            lineHeight: Math.round(stage.heroTitleSize * 1.08),
          }}
        >
          {current.name}
        </Text>

        <Text
          numberOfLines={1}
          style={{
            color: palette.textSecondary,
            fontSize: Math.max(13, Math.round(stage.u * 2.45)),
            marginTop: stage.cardGap * 0.55,
          }}
        >
          {[current.year, current.genre?.split(",")[0], current.rating ? `IMDb ${current.rating}` : null]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: stage.cardGap * 1.1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: palette.accent,
              borderRadius: 999,
              paddingHorizontal: Math.max(20, stage.u * 3.2),
              paddingVertical: Math.max(10, stage.u * 1.35),
            }}
          >
            <Play size={Math.max(15, Math.round(stage.u * 2.7))} color={glass.ink} fill={glass.ink} />
            <Text style={{ color: glass.ink, fontWeight: "800", fontSize: Math.max(14, Math.round(stage.u * 2.6)), marginLeft: 8 }}>
              Open
            </Text>
          </View>
          <Text style={{ color: palette.textMuted, fontSize: Math.max(11, Math.round(stage.u * 2.1)), marginLeft: stage.cardGap * 1.2 }}>
            {`${index + 1} / ${items.length}`}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: "hidden",
    backgroundColor: palette.surface,
  },
});
