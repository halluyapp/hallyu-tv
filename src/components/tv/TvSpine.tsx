import { APP_NAME, APP_TAGLINE } from "@/config/branding";
import { glass } from "@/design-system/depth";
import { motion } from "@/design-system/motion";
import type { Stage } from "@/design-system/stage";
import { palette } from "@/design-system/tokens";
import { Home } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

/**
 * TvSpine — the vertical navigation rail.
 *
 * It is always expanded (animating layout width on a TV box is a frame-drop
 * generator), and each key lights up from within: the ember fill grows under
 * the label instead of a border appearing around it, so nothing reflows when
 * focus moves.
 */

export interface SpineItem {
  key: string;
  label: string;
  icon: typeof Home;
  onPress: () => void;
}

interface TvSpineProps {
  stage: Stage;
  items: SpineItem[];
  active: string;
}

export function TvSpine({ stage, items, active }: TvSpineProps) {
  return (
    <View
      style={[
        styles.spine,
        {
          width: stage.spineWidth,
          paddingHorizontal: Math.max(12, stage.gutter * 0.6),
          paddingTop: stage.gutter,
          paddingBottom: stage.gutter,
        },
      ]}
    >
      <View style={{ paddingHorizontal: stage.cardGap * 0.6 }}>
        <Text
          style={{
            color: palette.accent,
            fontSize: Math.round(stage.railTitleSize * 1.35),
            fontWeight: "800",
            letterSpacing: stage.railTitleSize * 0.28,
          }}
        >
          {APP_NAME.toUpperCase()}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            color: palette.textMuted,
            fontSize: stage.metaSize,
            lineHeight: stage.metaSize * 1.45,
            marginTop: stage.cardGap * 0.6,
          }}
        >
          {APP_TAGLINE}
        </Text>
      </View>

      <View style={{ marginTop: stage.gutter, gap: stage.cardGap }}>
        {items.map((item, index) => (
          <SpineButton
            key={item.key}
            item={item}
            stage={stage}
            active={active === item.key}
            preferred={index === 0 && active === item.key}
          />
        ))}
      </View>
    </View>
  );
}

function SpineButton({
  item,
  stage,
  active,
  preferred,
}: {
  item: SpineItem;
  stage: Stage;
  active: boolean;
  preferred: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const lit = useRef(new Animated.Value(active ? 1 : 0)).current;
  const radius = Math.round(stage.controlSize * 0.45);
  const Icon = item.icon;

  useEffect(() => {
    Animated.timing(lit, {
      toValue: focused || active ? 1 : 0,
      duration: motion.fast,
      useNativeDriver: true,
    }).start();
  }, [lit, focused, active]);

  const edge = lit.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Pressable
      onPress={item.onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferred}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      style={{ justifyContent: "center" }}
    >
      <View
        style={{
          height: stage.controlSize,
          borderRadius: radius,
          paddingHorizontal: stage.cardGap,
          flexDirection: "row",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: glass.ember, opacity: edge, borderRadius: radius },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: "28%",
            bottom: "28%",
            width: 3,
            borderRadius: 2,
            backgroundColor: palette.accent,
            opacity: edge,
          }}
        />
        <Icon
          size={Math.round(stage.u * 3.1)}
          color={focused || active ? palette.accentBright : palette.textSecondary}
          strokeWidth={1.9}
        />
        <Text
          numberOfLines={1}
          style={{
            color: focused || active ? palette.textPrimary : palette.textSecondary,
            fontSize: Math.round(stage.u * 2.55),
            fontWeight: "700",
            marginLeft: stage.cardGap,
          }}
        >
          {item.label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  spine: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: glass.rim,
    backgroundColor: "rgba(10,13,17,0.55)",
  },
});
