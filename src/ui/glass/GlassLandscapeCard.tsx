import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useRef, useState } from "react";
import { Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { motion } from "@/design-system/motion";
import { gradients, palette, radius } from "@/design-system/tokens";
import { useSound } from "@/services/sound/SoundContext";

interface GlassProgressBarProps {
  /** 0..1 progress fraction */
  progress: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export const GlassProgressBar = memo(function GlassProgressBar({
  progress,
  height = 5,
  style,
}: GlassProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return (
    <View style={[styles.track, { height, borderRadius: height }, style]}>
      {clamped > 0 ? (
        <LinearGradient
          colors={gradients.progressFill}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.fill, { width: `${Math.max(4, Math.round(clamped * 100))}%`, borderRadius: height }]}
        />
      ) : null}
    </View>
  );
});

interface GlassLandscapeCardProps {
  title: string;
  subtitle: string;
  rightMeta?: string;
  imageUri: string | null | undefined;
  progress: number;
  width: number;
  height?: number;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onFocusCard?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * 1:1 16:9 Frosted Liquid Glass Landscape Card used for 'Continue Watching'
 * (`tv-01`, `mobile-01`) and horizontal TV Episode rails (`tv-03`).
 */
export const GlassLandscapeCard = memo(function GlassLandscapeCard({
  title,
  subtitle,
  rightMeta,
  imageUri,
  progress,
  width,
  height,
  hasTVPreferredFocus = false,
  onPress,
  onLongPress,
  onFocusCard,
  style,
}: GlassLandscapeCardProps) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const { play } = useSound();
  const cardHeight = height ?? Math.round(width * 0.565);

  const handleFocus = useCallback(() => {
    setFocused(true);
    Animated.timing(scale, { toValue: 1.045, duration: motion.instant, useNativeDriver: true }).start();
    play("tap", { intensity: 0.3 });
    onFocusCard?.();
  }, [onFocusCard, play, scale]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    Animated.timing(scale, { toValue: 1, duration: motion.instant, useNativeDriver: true }).start();
  }, [scale]);

  return (
    <Animated.View style={[{ width, transform: [{ scale }] }, style]}>
      <Pressable
        focusable
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${subtitle}`}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPressIn={() => {
          if (!focused) Animated.timing(scale, { toValue: 0.97, duration: motion.instant, useNativeDriver: true }).start();
        }}
        onPressOut={() => {
          Animated.timing(scale, { toValue: focused ? 1.045 : 1, duration: motion.instant, useNativeDriver: true }).start();
        }}
        onPress={() => {
          play("confirm");
          onPress();
        }}
        onLongPress={onLongPress}
      >
        <View
          style={[
            styles.card,
            {
              width,
              height: cardHeight,
              borderRadius: radius.card,
              borderColor: focused ? "#FFF5EE" : palette.glassStrokeBright,
              borderWidth: focused ? 2.5 : 1,
            },
            focused && styles.focusedHalo,
          ]}
        >
          <Poster uri={imageUri} initials={initialsFor(title)} style={StyleSheet.absoluteFill} />

          {/* Frosted Liquid Glass bottom info strip */}
          <LinearGradient
            colors={["transparent", "rgba(10, 14, 22, 0.72)", "rgba(12, 18, 28, 0.92)"]}
            locations={[0, 0.45, 1]}
            style={styles.bottomStrip}
          >
            <View style={styles.metaRow}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.cardTitle}>
                  {title}
                </Text>
                <Text numberOfLines={1} style={styles.cardSub}>
                  {subtitle}
                </Text>
              </View>
              {rightMeta ? <Text style={styles.rightMeta}>{rightMeta}</Text> : null}
            </View>
            <GlassProgressBar progress={progress} height={4} style={styles.progressBar} />
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  track: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
  card: {
    overflow: "hidden",
    backgroundColor: palette.surfaceRaised,
    justifyContent: "flex-end",
  },
  focusedHalo: {
    shadowColor: palette.accent,
    shadowOpacity: 0.68,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  bottomStrip: {
    paddingHorizontal: 12,
    paddingTop: 22,
    paddingBottom: 10,
    borderTopColor: "rgba(255, 255, 255, 0.10)",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    color: palette.textPrimary,
    fontSize: 13.5,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  cardSub: {
    color: palette.textSecondary,
    fontSize: 11.5,
    fontWeight: "600",
    marginTop: 1,
  },
  rightMeta: {
    color: palette.pearlSoft,
    fontSize: 11,
    fontWeight: "700",
  },
  progressBar: {
    marginTop: 7,
  },
});
