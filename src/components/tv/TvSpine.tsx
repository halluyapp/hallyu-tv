import { APP_NAME, APP_TAGLINE } from "@/config/branding";
import { glowShadow } from "@/design-system/depth";
import type { Stage } from "@/design-system/stage";
import { palette, gradients, radius } from "@/design-system/tokens";
import { useSound } from "@/services/sound/SoundContext";
import { LucideIcon } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export interface SpineItem {
  key: string;
  label: string;
  icon: LucideIcon;
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
          paddingHorizontal: Math.max(14, stage.gutter * 0.5),
          paddingTop: stage.gutter,
          paddingBottom: stage.gutter,
        },
      ]}
    >
      {/* Brand Header */}
      <View style={{ paddingHorizontal: stage.cardGap * 0.6, marginBottom: stage.cardGap * 1.5 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <LinearGradient
            colors={gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 14, height: 14, borderRadius: 7 }}
          />
          <Text
            style={{
              color: palette.textPrimary,
              fontSize: Math.round(stage.railTitleSize * 1.25),
              fontWeight: "800",
              letterSpacing: -0.5,
            }}
          >
            {APP_NAME}
          </Text>
        </View>
        <Text
          style={{
            color: palette.textMuted,
            fontSize: Math.max(10, stage.metaSize),
            marginTop: 4,
            fontWeight: "500",
          }}
        >
          {APP_TAGLINE}
        </Text>
      </View>

      {/* Navigation Spine Items */}
      <View style={{ gap: stage.cardGap * 0.7, flex: 1 }}>
        {items.map((item, index) => (
          <SpineButton
            key={item.key}
            item={item}
            stage={stage}
            active={item.key === active}
            preferredFocus={index === 0 && active === item.key}
          />
        ))}
      </View>

      {/* TV Mode Indicator Footer */}
      <View
        style={{
          paddingHorizontal: stage.cardGap * 0.6,
          paddingVertical: 8,
          backgroundColor: palette.glassFill,
          borderColor: palette.glassStroke,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
        }}
      >
        <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: "600" }}>
          10-FOOT CINEMA MODE
        </Text>
      </View>
    </View>
  );
}

function SpineButton({
  item,
  stage,
  active,
  preferredFocus,
}: {
  item: SpineItem;
  stage: Stage;
  active: boolean;
  preferredFocus: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const { play } = useSound();
  const Icon = item.icon;

  return (
    <Pressable
      onPress={() => {
        play("tab");
        item.onPress();
      }}
      onFocus={() => {
        setFocused(true);
        play("tab");
      }}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferredFocus}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      style={[
        styles.button,
        {
          height: stage.controlSize,
          borderRadius: radius.md,
          backgroundColor: active
            ? palette.glassFillStrong
            : focused
            ? palette.glassFillUltra
            : "transparent",
          borderColor: focused
            ? palette.accentBright
            : active
            ? palette.glassStrokeBright
            : "transparent",
          borderWidth: focused ? 2 : active ? StyleSheet.hairlineWidth : 0,
        },
        focused ? glowShadow(palette.accent, 20) : null,
      ]}
    >
      {active && (
        <LinearGradient
          colors={gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.activeBar}
        />
      )}

      <Icon
        size={Math.round(stage.u * 4.6)}
        color={focused || active ? palette.accentBright : palette.textSecondary}
      />

      <Text
        style={[
          styles.buttonLabel,
          {
            fontSize: stage.bodySize,
            color: focused || active ? palette.textPrimary : palette.textSecondary,
            fontWeight: active || focused ? "700" : "500",
          },
        ]}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  spine: {
    backgroundColor: "rgba(9, 13, 20, 0.88)",
    borderRightColor: palette.glassStroke,
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: "space-between",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    position: "relative",
    overflow: "hidden",
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: "20%",
    bottom: "20%",
    width: 3.5,
    borderRadius: 2,
  },
  buttonLabel: {
    letterSpacing: -0.2,
  },
});
