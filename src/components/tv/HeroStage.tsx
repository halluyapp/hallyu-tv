import { Poster, initialsFor } from "@/components/ui/Poster";
import { liftShadow, glowShadow } from "@/design-system/depth";
import { motion } from "@/design-system/motion";
import type { Stage } from "@/design-system/stage";
import { palette, gradients, radius } from "@/design-system/tokens";
import { canAffordAmbience } from "@/hooks/useDeviceTier";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/services/sound/SoundContext";
import type { CatalogueItem } from "@/types/provider";
import { LinearGradient } from "expo-linear-gradient";
import { Play, Star, Sparkles, Tv, Film } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

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
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (items.length < 2 || reduced) return;
    const timer = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 450, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setIndex((current) => (current + 1) % items.length);
        Animated.timing(fade, { toValue: 1, duration: 650, useNativeDriver: true }).start();
      });
    }, 9000);
    return () => clearInterval(timer);
  }, [items.length, reduced, fade]);

  useEffect(() => {
    if (reduced || !afford) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 14000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 14000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, afford, drift]);

  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    const anim = Animated.timing(enter, {
      toValue: 1,
      duration: motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [enter, reduced]);

  const active = items[index] ?? items[0];
  if (!active) return null;

  const handleOpen = useCallback(() => {
    play("tap");
    onOpen(active);
  }, [play, onOpen, active]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    play("tab");
  }, [play]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  const isSeries = active.mediaType === "series";

  return (
    <Animated.View
      style={[
        styles.root,
        {
          height: stage.heroHeight,
          marginHorizontal: stage.gutter,
          marginBottom: stage.rowGap * 0.9,
          borderRadius: radius.sheet,
          opacity: enter,
          transform: [{ translateY }],
        },
        isFocused ? glowShadow(palette.accent, 28) : liftShadow(3),
      ]}
    >
      <Pressable
        onPress={handleOpen}
        onFocus={handleFocus}
        onBlur={handleBlur}
        accessibilityRole="button"
        accessibilityLabel={`Featured: ${active.name}`}
        style={[
          styles.pressable,
          {
            borderRadius: radius.sheet,
            borderColor: isFocused ? palette.accentBright : palette.glassStroke,
            borderWidth: isFocused ? Math.max(2, stage.focusRing) : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, transform: [{ scale }, { translateX }] }]}>
          <Poster uri={active.posterUrl} style={StyleSheet.absoluteFill} initials={initialsFor(active.name)} />
        </Animated.View>

        {/* Ambient Cinema Scrims */}
        <LinearGradient
          colors={["transparent", "rgba(4, 6, 10, 0.45)", "rgba(4, 6, 10, 0.94)", "#04060A"]}
          locations={[0, 0.45, 0.8, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <LinearGradient
          colors={["rgba(4, 6, 10, 0.85)", "rgba(4, 6, 10, 0.4)", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 0.85, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* Liquid glass specular top sheen */}
        <LinearGradient
          colors={gradients.glassSheen}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 0.6 }}
          style={styles.topSheen}
          pointerEvents="none"
        />

        {/* Floating Glass Metadata Container */}
        <View style={[styles.floatingCard, { padding: stage.cardGap * 1.2 }]}>
          {/* Glass Badges */}
          <View style={styles.badgeRow}>
            <View style={styles.featuredBadge}>
              <Sparkles size={11} color="#FF5E3A" />
              <Text style={styles.featuredText}>FEATURED</Text>
            </View>

            <View style={styles.glassPill}>
              {isSeries ? <Tv size={11} color={palette.textSecondary} /> : <Film size={11} color={palette.textSecondary} />}
              <Text style={styles.pillText}>{isSeries ? "Series" : "Movie"}</Text>
            </View>

            {active.rating ? (
              <View style={styles.glassPill}>
                <Star size={11} color="#FBBF24" fill="#FBBF24" />
                <Text style={[styles.pillText, { color: "#FFFFFF", fontWeight: "700" }]}>{active.rating}</Text>
              </View>
            ) : null}

            {active.year ? (
              <View style={styles.glassPill}>
                <Text style={styles.pillText}>{active.year}</Text>
              </View>
            ) : null}
          </View>

          {/* Title with cinematic typography */}
          <Text
            numberOfLines={2}
            style={[
              styles.heroTitle,
              {
                fontSize: stage.heroTitleSize,
                lineHeight: Math.round(stage.heroTitleSize * 1.15),
              },
            ]}
          >
            {active.name}
          </Text>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <LinearGradient
              colors={gradients.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.watchButton,
                {
                  height: Math.max(38, stage.controlSize * 0.75),
                  paddingHorizontal: stage.cardGap * 1.2,
                  borderRadius: radius.pill,
                },
              ]}
            >
              <Play size={Math.max(14, stage.u * 3.5)} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={[styles.watchText, { fontSize: Math.max(13, stage.bodySize) }]}>Watch Now</Text>
            </LinearGradient>

            {/* Carousel Laser Indicators */}
            {items.length > 1 ? (
              <View style={styles.indicatorRow}>
                {items.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.indicatorBar,
                      {
                        width: i === index ? 24 : 8,
                        backgroundColor: i === index ? palette.accent : "rgba(255, 255, 255, 0.2)",
                      },
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    position: "relative",
  },
  pressable: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  topSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
  },
  floatingCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "flex-end",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 94, 58, 0.16)",
    borderColor: "rgba(255, 94, 58, 0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
  },
  featuredText: {
    color: "#FF5E3A",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  glassPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
  },
  pillText: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  watchButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: palette.accent,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  watchText: {
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  indicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  indicatorBar: {
    height: 4,
    borderRadius: 2,
  },
});
