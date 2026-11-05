import { Star } from "lucide-react-native";
import React, { memo, useCallback, useRef, useState } from "react";
import { Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { motion } from "@/design-system/motion";
import { palette, radius } from "@/design-system/tokens";
import { useSound } from "@/services/sound/SoundContext";
import type { CatalogueItem } from "@/types/provider";

interface GlassPosterCardProps {
  item: CatalogueItem;
  width: number;
  height?: number;
  showCaption?: boolean;
  /** Category Tag override e.g. 'K-Drama' when known, else 'Series' / 'Movie'. */
  badgeLabel?: string;
  hasTVPreferredFocus?: boolean;
  onPress: (item: CatalogueItem) => void;
  onFocusItem?: (item: CatalogueItem, index?: number) => void;
  index?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * 1:1 Liquid Glass Poster Card matching `tv-01`, `tv-02`, `tv-04`, `mobile-01`, `mobile-02`:
 * - Rounded 2:3 cinema artwork with 1px specular glass edge highlight
 * - Single clean top-left frosted glass media badge ('Series' or 'Movie')
 * - Top-right gold star rating pill ONLY when real rating data is present
 * - Luminous pearl + warm coral-ember 10-foot focus halo on Android TV
 */
export const GlassPosterCard = memo(function GlassPosterCard({
  item,
  width,
  height,
  showCaption = true,
  badgeLabel,
  hasTVPreferredFocus = false,
  onPress,
  onFocusItem,
  index,
  style,
}: GlassPosterCardProps) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const { play } = useSound();
  const cardHeight = height ?? Math.round(width * 1.48);

  const ratingNum = item.rating ? parseFloat(item.rating) : NaN;
  const displayRating = Number.isFinite(ratingNum) && ratingNum > 0 ? ratingNum.toFixed(1) : null;
  const typeLabel = badgeLabel ?? (item.mediaType === "series" ? "Series" : "Movie");
  const subtitleParts = [item.year, item.genre?.split(",")[0]?.trim()].filter(Boolean);

  const handleFocus = useCallback(() => {
    setFocused(true);
    Animated.timing(scale, { toValue: 1.05, duration: motion.instant, useNativeDriver: true }).start();
    play("tap", { intensity: 0.3 });
    onFocusItem?.(item, index);
  }, [index, item, onFocusItem, play, scale]);

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
        accessibilityLabel={`${item.name}, ${typeLabel}${displayRating ? `, rated ${displayRating}` : ""}`}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPressIn={() => {
          if (!focused) Animated.timing(scale, { toValue: 0.97, duration: motion.instant, useNativeDriver: true }).start();
        }}
        onPressOut={() => {
          Animated.timing(scale, { toValue: focused ? 1.05 : 1, duration: motion.instant, useNativeDriver: true }).start();
        }}
        onPress={() => {
          play("confirm");
          onPress(item);
        }}
      >
        <View
          style={[
            styles.frame,
            {
              width,
              height: cardHeight,
              borderRadius: radius.card,
              borderColor: focused ? "#FFF5EE" : palette.glassStroke,
              borderWidth: focused ? 2.5 : 1,
            },
            focused && styles.focusedHalo,
          ]}
        >
          <Poster
            uri={item.posterUrl}
            initials={initialsFor(item.name)}
            style={{ width: "100%", height: "100%" }}
          />

          <View style={styles.badgeRow} pointerEvents="none">
            <View style={styles.typePill}>
              <Text style={styles.typeText}>{typeLabel}</Text>
            </View>
            {displayRating ? (
              <View style={styles.ratingPill}>
                <Star size={10} color={palette.gold} fill={palette.gold} />
                <Text style={styles.ratingText}>{displayRating}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {showCaption ? (
          <View style={styles.captionWrap}>
            <Text numberOfLines={1} style={[styles.title, focused && styles.titleFocused]}>
              {item.name}
            </Text>
            {subtitleParts.length > 0 ? (
              <Text numberOfLines={1} style={styles.meta}>
                {subtitleParts.join(" · ")}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    backgroundColor: palette.surfaceRaised,
    position: "relative",
  },
  focusedHalo: {
    shadowColor: palette.accent,
    shadowOpacity: 0.72,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  badgeRow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  typePill: {
    backgroundColor: "rgba(10, 14, 22, 0.72)",
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeText: {
    color: "#F3F6FA",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(10, 14, 22, 0.76)",
    borderColor: "rgba(246, 196, 83, 0.35)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ratingText: {
    color: "#FFF7E0",
    fontSize: 10,
    fontWeight: "800",
  },
  captionWrap: {
    marginTop: 7,
    paddingHorizontal: 2,
  },
  title: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.15,
  },
  titleFocused: {
    color: "#FFF4EC",
  },
  meta: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
});
