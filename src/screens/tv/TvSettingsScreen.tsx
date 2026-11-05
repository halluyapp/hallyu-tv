import type { DisplayMode } from "@/design-system/stage";
import { palette, radius } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { readDeviceIdentity } from "@/services/device/device";
import { detectTelevision, deviceLabel } from "@/services/device/tvDetection";
import { useSound } from "@/services/sound/SoundContext";
import { useDisplayMode } from "@/state/DisplayModeContext";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import {
  checkForAppUpdates,
  downloadAndInstallUpdate,
  clearOldUpdates,
  type UpdateCheckResult,
} from "@/services/updater/appUpdater";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Check,
  ChevronLeft,
  DownloadCloud,
  Monitor,
  RefreshCw,
  Smartphone,
  Trash2,
  Tv,
} from "lucide-react-native";
import React, { useMemo, useState, useCallback } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const OPTIONS: { key: DisplayMode; label: string; hint: string; Icon: typeof Tv }[] = [
  { key: "tv", label: "TV Stage (Recommended)", hint: "10-foot remote experience with spatial targets", Icon: Tv },
  { key: "auto", label: "Auto", hint: "Adapts to screen size and device profile", Icon: Smartphone },
  { key: "tablet", label: "Tablet Canvas", hint: "Mid-size layout for tablets and foldable screens", Icon: Monitor },
];

export function TvSettingsScreen() {
  const navigation = useNavigation<Nav>();
  const stage = useStage();
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useDisplayMode();
  const { play } = useSound();
  const [focused, setFocused] = useState<string | null>(null);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);

  const identity = useMemo(() => readDeviceIdentity(), []);
  const television = useMemo(() => detectTelevision(identity), [identity]);
  const detectedLabel = television ? "Television / Android TV" : stage.tier === "compact" ? "Phone" : "Tablet or monitor";

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    play("tap");
    try {
      const res = await checkForAppUpdates("tv");
      setUpdateInfo(res);
      if (res.hasUpdate && res.manifest) {
        Alert.alert(
          "Update Available",
          `A new Hallyu TV version (${res.manifest.version}) is available. Select 'Install Update' to upgrade.`
        );
      } else {
        Alert.alert("Up to Date", `Hallyu TV (${res.currentVersion}) is on the latest release.`);
      }
    } catch {
      Alert.alert("Update Notice", "Could not check for releases right now.");
    } finally {
      setCheckingUpdate(false);
    }
  }, [play]);

  const handleInstallUpdate = useCallback(async () => {
    if (!updateInfo?.manifest) return;
    setDownloadingUpdate(true);
    setUpdateProgress(0);
    play("confirm");
    try {
      const res = await downloadAndInstallUpdate(updateInfo.manifest, (prog) => {
        setUpdateProgress(prog);
      });
      if (!res.success) {
        Alert.alert("Update Error", res.error || "Failed to download update APK.");
      }
    } catch {
      Alert.alert("Install Error", "Failed to launch package installer.");
    } finally {
      setDownloadingUpdate(false);
    }
  }, [updateInfo, play]);

  const handleClearCache = useCallback(async () => {
    Alert.alert(
      "Clear Storage Cache",
      "Remove temporary video buffers and downloaded release packages?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearOldUpdates();
            play("confirm");
            Alert.alert("Storage Cleaned", "Temporary cache has been cleared.");
          },
        },
      ]
    );
  }, [play]);

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
        <Text style={{ color: "#FFFFFF", fontSize: stage.railTitleSize, fontWeight: "800" }}>Settings</Text>
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
        <Text style={{ color: "#FFFFFF", fontSize: stage.titleSize, fontWeight: "800" }}>TV Preferences & Updates</Text>
        <Text
          style={{
            color: palette.textSecondary,
            fontSize: stage.bodySize,
            lineHeight: Math.round(stage.bodySize * 1.5),
            maxWidth: Math.round(stage.width * 0.72),
          }}
        >
          Independent Android TV edition with direct Zarhosting streaming and native in-app updates.
        </Text>

        {/* In-App TV Updates Section */}
        <View style={[styles.cardGroup, { padding: stage.cardGap * 1.2, gap: 10 }]}>
          <Text style={{ color: palette.accentBright, fontSize: stage.metaSize, fontWeight: "700", letterSpacing: 0.8 }}>
            HALLYU TV IN-APP UPDATES
          </Text>
          <Text style={{ color: palette.textSecondary, fontSize: stage.metaSize }}>
            Checks for Hallyu TV releases (package: app.hallyutv.dev) with automatic APK verification.
          </Text>

          <View style={{ flexDirection: "row", gap: stage.cardGap, marginTop: 4 }}>
            <Pressable
              onPress={handleCheckUpdate}
              onFocus={() => setFocused("check-update")}
              onBlur={() => setFocused(null)}
              disabled={checkingUpdate || downloadingUpdate}
              accessibilityRole="button"
              accessibilityLabel="Check for updates"
              style={[
                styles.actionBtn,
                {
                  borderColor: focused === "check-update" ? palette.accentBright : palette.glassStrokeBright,
                  backgroundColor: focused === "check-update" ? "rgba(255, 94, 58, 0.25)" : palette.glassFillStrong,
                },
                focused === "check-update" && styles.focusedGlow,
              ]}
            >
              {checkingUpdate ? (
                <ActivityIndicator size="small" color={palette.accentBright} />
              ) : (
                <RefreshCw size={Math.round(stage.u * 3)} color={palette.accentBright} />
              )}
              <Text style={{ color: palette.accentBright, fontSize: stage.bodySize, fontWeight: "700" }}>
                Check for Updates
              </Text>
            </Pressable>

            {updateInfo?.hasUpdate && updateInfo.manifest && (
              <Pressable
                onPress={handleInstallUpdate}
                onFocus={() => setFocused("install-update")}
                onBlur={() => setFocused(null)}
                disabled={downloadingUpdate}
                accessibilityRole="button"
                accessibilityLabel="Install update"
                style={[
                  styles.actionBtn,
                  {
                    borderColor: focused === "install-update" ? palette.accentBright : palette.accent,
                    backgroundColor: palette.accent,
                  },
                  focused === "install-update" && styles.focusedGlow,
                ]}
              >
                {downloadingUpdate ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <DownloadCloud size={Math.round(stage.u * 3)} color="#fff" />
                )}
                <Text style={{ color: "#fff", fontSize: stage.bodySize, fontWeight: "700" }}>
                  {downloadingUpdate ? "Downloading..." : "Install Update"}
                </Text>
              </Pressable>
            )}
          </View>

          {downloadingUpdate && (
            <View style={{ marginTop: 8, gap: 4 }}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.round(updateProgress * 100)}%` }]} />
              </View>
              <Text style={{ color: palette.textMuted, fontSize: stage.metaSize, textAlign: "right" }}>
                {Math.round(updateProgress * 100)}% downloaded
              </Text>
            </View>
          )}

          {updateInfo?.manifest && (
            <View style={{ marginTop: 6, padding: 8, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: radius.sm }}>
              <Text style={{ color: palette.accentBright, fontSize: stage.metaSize, fontWeight: "700" }}>
                Latest: v{updateInfo.manifest.version}
              </Text>
              <Text style={{ color: palette.textSecondary, fontSize: stage.metaSize, marginTop: 2 }}>
                {updateInfo.manifest.releaseNotes}
              </Text>
            </View>
          )}
        </View>

        {/* Storage Maintenance */}
        <Pressable
          onPress={handleClearCache}
          onFocus={() => setFocused("clear-cache")}
          onBlur={() => setFocused(null)}
          accessibilityRole="button"
          accessibilityLabel="Clear temporary cache"
          style={[
            styles.optionCard,
            {
              minHeight: stage.controlSize,
              padding: Math.round(stage.cardGap * 1.1),
              borderRadius: radius.card,
              borderColor: focused === "clear-cache" ? palette.accentBright : palette.glassStroke,
              backgroundColor: focused === "clear-cache" ? "rgba(255, 94, 58, 0.2)" : palette.surfaceGlass,
              gap: stage.cardGap,
            },
            focused === "clear-cache" && styles.focusedGlow,
          ]}
        >
          <Trash2 size={Math.round(stage.u * 3.4)} color={palette.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#FFFFFF", fontSize: stage.bodySize, fontWeight: "700" }}>
              Clean Storage & Updates Cache
            </Text>
            <Text style={{ color: palette.textSecondary, fontSize: stage.metaSize, marginTop: 2 }}>
              Reclaim internal flash memory on Android TV box
            </Text>
          </View>
        </Pressable>

        {/* Hardware Identity Info Card */}
        <View
          style={[
            styles.detected,
            {
              padding: Math.round(stage.cardGap * 1.2),
              borderRadius: radius.card,
            },
          ]}
        >
          <Text style={{ color: palette.accentBright, fontSize: stage.metaSize, letterSpacing: 0.8, fontWeight: "700" }}>
            HARDWARE IDENTITY & PACKAGE
          </Text>
          <Text style={{ color: "#FFFFFF", fontSize: stage.bodySize, fontWeight: "700", marginTop: 4 }}>
            {deviceLabel(identity)} · {detectedLabel}
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: stage.metaSize, marginTop: 2 }}>
            Package: app.hallyutv.dev · {stage.width}×{stage.height} Stage
          </Text>
        </View>

        {/* Screen Layout Selection */}
        <View style={{ marginTop: stage.rowGap * 0.3, gap: stage.cardGap }}>
          <Text style={{ color: "#FFFFFF", fontSize: stage.railTitleSize, fontWeight: "700", marginBottom: 4 }}>
            Screen Layout Mode
          </Text>
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
  cardGroup: {
    backgroundColor: palette.surfaceGlass,
    borderRadius: radius.card,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
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
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.surfaceRaised,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: palette.accentBright },
});
