import type { DisplayMode } from "@/design-system/stage";
import { palette, radius } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { readDeviceIdentity } from "@/services/device/device";
import { detectTelevision, deviceLabel } from "@/services/device/tvDetection";
import { useSound } from "@/services/sound/SoundContext";
import { useDisplayMode } from "@/state/DisplayModeContext";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Check, ChevronLeft, Monitor, Smartphone, Tv } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const OPTIONS: { key: DisplayMode; label: string; hint: string; Icon: typeof Tv }[] = [
  { key: "auto", label: "Auto", hint: "Phone, tablet or television — detected from this device", Icon: Smartphone },
  { key: "tv", label: "TV Stage", hint: "10-foot remote experience with spatial targets", Icon: Tv },
  { key: "tablet", label: "Tablet Canvas", hint: "Mid-size layout for tablets and foldable screens", Icon: Monitor },
];

export function TvSettingsScreen() {
  const navigation = useNavigation<Nav>();
  const stage = useStage();
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useDisplayMode();
  const { play } = useSound();
  const [focused, setFocused] = useState<DisplayMode | "back" | null>(null);

  const identity = useMemo(() => readDeviceIdentity(), []);
  const television = useMemo(() => detectTelevision(identity), [identity]);
  const detectedLabel = television ? "Television" : stage.tier === "compact" ? "Phone" : "Tablet or monitor";
  const overrideLabel = mode === "auto" ? "Auto" : mode === "tv" ? "TV override" : "Tablet override";

  return (
    <View
      style={[
        styles.root,
        { paddingTop: Math.max(insets.top, Math.round(stage.gutter * 0.4)), paddingBottom: insets.bottom },
      ]}
    >
      <AmbientGlow />

      <View style={[styles.header, { paddingHorizontal: stage.gutter, gap: stage.cardGap }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          onFocus={() => setFocused("back")}
          onBlur={() => setFocused(null)}
          hasTVPreferredFocus
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[
            styles.backBtn,
            {
              width: stage.controlSize,
              height: stage.controlSize,
              borderRadius: stage.controlSize / 2,
              borderColor: focused === "back" ? palette.accentBright : palette.glassStrokeBright,
            },
            focused === "back" && styles.focusedGlow,
          ]}
        >
          <ChevronLeft size={Math.round(stage.u * 2.8)} color="#FFFFFF" />
        </Pressable>
        <Text style={{ color: "#FFFFFF", fontSize: stage.railTitleSize, fontWeight: "800" }}>Display</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: stage.gutter,
          paddingTop: stage.gutter * 0.6,
          paddingBottom: stage.gutter * 2,
          gap: stage.cardGap,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: stage.titleSize, fontWeight: "800" }}>Screen Layout</Text>
        <Text
          style={{
            color: palette.textSecondary,
            fontSize: stage.bodySize,
            lineHeight: Math.round(stage.bodySize * 1.5),
            maxWidth: Math.round(stage.width * 0.72),
          }}
        >
          Changing this switches the entire UI immediately without reloading or losing state. Choose Auto to let
          Hallyu TV adapt seamlessly to your hardware.
        </Text>

        <View
          style={[
            styles.detected,
            {
              marginTop: stage.cardGap,
              padding: Math.round(stage.cardGap * 1.2),
              borderRadius: radius.card,
            },
          ]}
        >
          <Text style={{ color: palette.accentBright, fontSize: stage.metaSize, letterSpacing: 0.8, fontWeight: "700" }}>
            HARDWARE IDENTITY
          </Text>
          <Text style={{ color: "#FFFFFF", fontSize: stage.bodySize, fontWeight: "700", marginTop: 4 }}>
            {deviceLabel(identity)} · {detectedLabel}
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: stage.metaSize, marginTop: 2 }}>
            {stage.width}×{stage.height} viewport · {overrideLabel}
          </Text>
        </View>

        <View style={{ marginTop: stage.rowGap * 0.5, gap: stage.cardGap }}>
          {OPTIONS.map((option) => {
            const selected = mode === option.key;
            const lit = focused === option.key;
            const Icon = option.Icon;
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  play("tap");
                  setMode(option.key);
                }}
                onFocus={() => setFocused(option.key)}
                onBlur={() => setFocused(null)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Layout: ${option.label}. ${option.hint}`}
                style={[
                  styles.optionCard,
                  {
                    minHeight: stage.controlSize,
                    padding: Math.round(stage.cardGap * 1.1),
                    borderRadius: radius.card,
                    borderColor: lit ? palette.accentBright : selected ? palette.accent : palette.glassStroke,
                    backgroundColor: lit
                      ? "rgba(255, 94, 58, 0.2)"
                      : selected
                        ? "rgba(255, 94, 58, 0.12)"
                        : palette.surfaceGlass,
                    gap: stage.cardGap,
                  },
                  lit && styles.focusedGlow,
                ]}
              >
                <Icon size={Math.round(stage.u * 3.4)} color={selected ? palette.accentBright : palette.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#FFFFFF", fontSize: stage.bodySize, fontWeight: "700" }}>
                    {option.label}
                  </Text>
                  <Text style={{ color: palette.textSecondary, fontSize: stage.metaSize, marginTop: 2 }}>
                    {option.hint}
                  </Text>
                </View>
                {selected ? (
                  <Check size={Math.round(stage.u * 3)} color={palette.accentBright} strokeWidth={2.4} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: { flexDirection: "row", alignItems: "center" },
  backBtn: {
    backgroundColor: palette.glassFillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  detected: {
    borderColor: palette.glassStrokeBright,
    backgroundColor: palette.surfaceGlass,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  focusedGlow: {
    transform: [{ scale: 1.02 }],
    shadowColor: palette.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
});
