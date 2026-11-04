import type { DisplayMode } from "@/design-system/stage";
import { palette } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { readDeviceIdentity } from "@/services/device/device";
import { detectTelevision, deviceLabel } from "@/services/device/tvDetection";
import { useSound } from "@/services/sound/SoundContext";
import { useDisplayMode } from "@/state/DisplayModeContext";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Check, ChevronLeft, Monitor, Smartphone, Tv } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const OPTIONS: { key: DisplayMode; label: string; hint: string; Icon: typeof Tv }[] = [
  { key: "auto", label: "Auto", hint: "Phone, tablet or television — detected from this device", Icon: Smartphone },
  { key: "tv", label: "TV", hint: "10-foot stage with remote-sized targets", Icon: Tv },
  { key: "tablet", label: "Tablet", hint: "Mid-size layout for tablets and monitors", Icon: Monitor },
];

/**
 * Display settings, reachable from inside the television layout itself.
 *
 * The TV stack has no profile tab, so without this screen a phone that was
 * switched to TV mode had no way back. Every option here is a normal focusable
 * target, so it works with a remote and with a finger.
 */
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
      <View style={[styles.header, { paddingHorizontal: stage.gutter, gap: stage.cardGap }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          onFocus={() => setFocused("back")}
          onBlur={() => setFocused(null)}
          hasTVPreferredFocus
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: stage.controlSize,
            height: stage.controlSize,
            borderRadius: stage.controlSize / 2,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: stage.focusRing,
            borderColor: focused === "back" ? palette.accent : "transparent",
          }}
        >
          <ChevronLeft size={Math.round(stage.u * 2.8)} color={palette.textPrimary} />
        </Pressable>
        <Text style={{ color: palette.textPrimary, fontSize: stage.railTitleSize, fontWeight: "800" }}>Display</Text>
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
        <Text style={{ color: palette.textPrimary, fontSize: stage.titleSize, fontWeight: "800" }}>Screen layout</Text>
        <Text
          style={{
            color: palette.textSecondary,
            fontSize: stage.bodySize,
            lineHeight: Math.round(stage.bodySize * 1.5),
            maxWidth: Math.round(stage.width * 0.72),
          }}
        >
          Changing this switches the whole app immediately — nothing restarts and nothing is lost. Choose Auto to let
          Hallyu TV match the device it is running on.
        </Text>

        <View
          style={[
            styles.detected,
            {
              marginTop: stage.cardGap,
              padding: Math.round(stage.cardGap * 1.2),
              borderRadius: Math.round(stage.focusRing * 4),
            },
          ]}
        >
          <Text style={{ color: palette.textMuted, fontSize: stage.metaSize, letterSpacing: 0.8 }}>DETECTED</Text>
          <Text style={{ color: palette.textPrimary, fontSize: stage.bodySize, fontWeight: "700", marginTop: 4 }}>
            {deviceLabel(identity)} · {detectedLabel}
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: stage.metaSize, marginTop: 2 }}>
            {stage.width}×{stage.height} · {overrideLabel}
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
                style={{
                  minHeight: stage.controlSize,
                  padding: Math.round(stage.cardGap * 1.1),
                  borderRadius: Math.round(stage.focusRing * 4),
                  borderWidth: stage.focusRing,
                  borderColor: lit ? palette.accent : selected ? palette.accentBright : "transparent",
                  backgroundColor: lit ? "rgba(255,122,26,0.14)" : "rgba(255,255,255,0.03)",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: stage.cardGap,
                }}
              >
                <Icon size={Math.round(stage.u * 3.4)} color={selected ? palette.accentBright : palette.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.textPrimary, fontSize: stage.bodySize, fontWeight: "700" }}>
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
  detected: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
});
