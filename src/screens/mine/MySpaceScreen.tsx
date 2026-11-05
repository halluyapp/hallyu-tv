import { Poster } from "@/components/ui/Poster";
import { palette, radius, spacing, gradients } from "@/design-system/tokens";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { useLibrary } from "@/state/LibraryContext";
import { useDisplayMode } from "@/state/DisplayModeContext";
import { useStage } from "@/hooks/useStage";
import type { DisplayMode } from "@/design-system/stage";
import { useSound } from "@/services/sound/SoundContext";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import {
  Vibrate,
  Volume2,
  VolumeX,
  DownloadCloud,
  RefreshCw,
  Trash2,
  HardDrive,
} from "lucide-react-native";
import {
  checkForAppUpdates,
  downloadAndInstallUpdate,
  clearOldUpdates,
  type UpdateCheckResult,
} from "@/services/updater/appUpdater";
import { ActivityIndicator, Alert } from "react-native";
import React, { useState, useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DISPLAY_OPTIONS: { key: DisplayMode; label: string; hint: string }[] = [
  { key: "auto", label: "Automatic", hint: "Adapts to screen size and device profile" },
    { key: "tablet", label: "Tablet", hint: "Multi-column landscape interface" },
];

export function MySpaceScreen() {
  const { watchlist, progress } = useLibrary();
  const { enabled: soundEnabled, setEnabled: setSoundEnabled, hapticsEnabled, setHapticsEnabled, volume, setVolume, play } = useSound();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useDisplayMode();
  const stage = useStage();

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    play("tap");
    try {
      const res = await checkForAppUpdates("mobile");
      setUpdateInfo(res);
      if (res.hasUpdate && res.manifest) {
        Alert.alert(
          "Update Available",
          `A new Hallyu Mobile version (${res.manifest.version}) is available. Would you like to install it?`
        );
      } else {
        Alert.alert("Up to Date", `Hallyu Mobile (${res.currentVersion}) is on the latest version.`);
      }
    } catch {
      Alert.alert("Update Check Failed", "Could not check for releases right now.");
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
        Alert.alert("Download Notice", res.error || "Could not complete update installation.");
      }
    } catch {
      Alert.alert("Install Error", "Failed to launch package installer.");
    } finally {
      setDownloadingUpdate(false);
    }
  }, [updateInfo, play]);

  const handleClearCache = useCallback(async () => {
    Alert.alert(
      "Clear Cached Data",
      "This removes temporary stream and update cache files from device storage.",
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

  const resumeList = progress;

  return (
    <View style={styles.root}>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + 90,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Profile Banner */}
        <View style={styles.profileHeader}>
          <LinearGradient
            colors={gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarGlow}
          >
            <View style={styles.avatarInner}>
              <HardDrive size={24} color={palette.accentBright} />
            </View>
          </LinearGradient>

          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.profileName}>Hallyu Mobile</Text>
            <Text style={styles.profileSub}>Independent Touch Edition · app.hallyu.mobile</Text>
          </View>
        </View>

        {/* Local Storage & Library Card */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{watchlist.length}</Text>
            <Text style={styles.statLabel}>Watchlist</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{resumeList.length}</Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </View>
          <View style={styles.statDivider} />
          <Pressable style={styles.statItem} onPress={handleClearCache}>
            <Trash2 size={20} color={palette.textSecondary} style={{ marginBottom: 4 }} />
            <Text style={styles.statLabel}>Clean Cache</Text>
          </Pressable>
        </View>

        {/* Watchlist Section */}
        <SectionHeading label="Saved to Watchlist" count={watchlist.length} gutter={stage.gutter} />
        {watchlist.length === 0 ? (
          <Text style={[styles.emptyHint, { marginHorizontal: stage.gutter }]}>
            No saved titles yet. Tap the bookmark icon on any movie or series to save it here.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.horizontalRail, { paddingHorizontal: stage.gutter }]}
          >
            {watchlist.map((item) => (
              <Pressable
                key={item.subject_id}
                onPress={() => {
                  play("tap");
                  navigation.navigate("Details", { detailPath: item.detail_path || "", subjectId: item.subject_id });
                }}
                style={styles.posterWrapper}
              >
                <Poster
                  uri={item.poster_url}
                  style={{ width: stage.posterWidth * 0.72, height: stage.posterHeight * 0.72, borderRadius: radius.sm }}
                  initials={item.title.slice(0, 2).toUpperCase()}
                />
                <Text style={styles.posterTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Watching History */}
        {resumeList.length > 0 && (
          <>
            <SectionHeading label="Watching History" count={resumeList.length} gutter={stage.gutter} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.horizontalRail, { paddingHorizontal: stage.gutter }]}
            >
              {resumeList.map((row) => (
                <Pressable
                  key={`${row.subject_id}-${row.season_number}-${row.episode_number}`}
                  onPress={() => {
                    play("tap");
                    navigation.navigate("Details", { detailPath: row.detail_path || "", subjectId: row.subject_id });
                  }}
                  style={styles.posterWrapper}
                >
                  <Poster
                    uri={row.poster_url}
                    style={{ width: stage.posterWidth * 0.72, height: stage.posterHeight * 0.72, borderRadius: radius.sm }}
                    initials={row.title.slice(0, 2).toUpperCase()}
                  />
                  <Text style={styles.posterTitle} numberOfLines={1}>
                    {row.title}
                  </Text>
                  <Text style={styles.posterSub}>
                    {row.media_type === "series" ? `S${row.season_number} E${row.episode_number}` : "Movie"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* Display Experience */}
        <SectionHeading label="Display Experience" gutter={stage.gutter} />
        <View style={[styles.optionsGroup, { marginHorizontal: stage.gutter }]}>
          {DISPLAY_OPTIONS.map((opt) => {
            const active = mode === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  play("tap");
                  setMode(opt.key);
                }}
                style={[styles.radioRow, active && styles.radioRowActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.radioLabel, active && { color: palette.accentBright }]}>{opt.label}</Text>
                  <Text style={styles.radioHint}>{opt.hint}</Text>
                </View>
                <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                  {active && <View style={styles.radioInner} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Audio & Feedback */}
        <SectionHeading label="Interface Audio & Haptics" gutter={stage.gutter} />
        <View style={[styles.optionsGroup, { marginHorizontal: stage.gutter }]}>
          <View style={styles.settingRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {soundEnabled ? <Volume2 size={20} color={palette.accent} /> : <VolumeX size={20} color={palette.textMuted} />}
              <Text style={styles.settingLabel}>Navigation Sounds</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={(val) => {
                setSoundEnabled(val);
                if (val) play("tap");
              }}
              trackColor={{ false: palette.surfaceRaised, true: palette.accent }}
              thumbColor={palette.textPrimary}
            />
          </View>

          {soundEnabled && (
            <View style={[styles.settingRow, { paddingTop: 4 }]}>
              <Text style={styles.sliderLabel}>Volume: {Math.round(volume * 100)}%</Text>
              <Slider
                style={{ width: "55%", height: 36 }}
                minimumValue={0}
                maximumValue={1}
                value={volume}
                onSlidingComplete={setVolume}
                minimumTrackTintColor={palette.accent}
                maximumTrackTintColor={palette.surfaceRaised}
                thumbTintColor={palette.accentBright}
              />
            </View>
          )}

          <View style={styles.settingRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Vibrate size={20} color={hapticsEnabled ? palette.accent : palette.textMuted} />
              <Text style={styles.settingLabel}>Haptic Feedback</Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={(val) => {
                setHapticsEnabled(val);
                if (val) play("tap");
              }}
              trackColor={{ false: palette.surfaceRaised, true: palette.accent }}
              thumbColor={palette.textPrimary}
            />
          </View>
        </View>

        {/* In-App Updates Section */}
        <SectionHeading label="Hallyu Mobile In-App Updates" gutter={stage.gutter} />
        <View style={[styles.optionsGroup, { marginHorizontal: stage.gutter }]}>
          <View style={{ gap: 6, marginBottom: 12 }}>
            <Text style={styles.updaterTitle}>Automatic Direct APK Releases</Text>
            <Text style={styles.updaterDesc}>
              Hallyu Mobile checks specifically for mobile releases with package identity app.hallyu.mobile.
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={handleCheckUpdate}
              disabled={checkingUpdate || downloadingUpdate}
              style={[styles.updaterButton, { flex: 1 }]}
            >
              {checkingUpdate ? (
                <ActivityIndicator size="small" color={palette.accentBright} />
              ) : (
                <RefreshCw size={16} color={palette.accentBright} />
              )}
              <Text style={styles.updaterButtonText}>Check for Updates</Text>
            </Pressable>

            {updateInfo?.hasUpdate && updateInfo.manifest && (
              <Pressable
                onPress={handleInstallUpdate}
                disabled={downloadingUpdate}
                style={[styles.updaterButton, styles.updaterButtonAccent, { flex: 1 }]}
              >
                {downloadingUpdate ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <DownloadCloud size={16} color="#fff" />
                )}
                <Text style={[styles.updaterButtonText, { color: "#fff" }]}>
                  {downloadingUpdate ? "Downloading..." : "Update Now"}
                </Text>
              </Pressable>
            )}
          </View>

          {downloadingUpdate && (
            <View style={{ marginTop: 12, gap: 4 }}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.round(updateProgress * 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(updateProgress * 100)}% downloaded</Text>
            </View>
          )}

          {updateInfo?.manifest && (
            <View style={styles.releaseNotesBox}>
              <Text style={styles.releaseNotesTitle}>Available: v{updateInfo.manifest.version}</Text>
              <Text style={styles.releaseNotesBody} numberOfLines={4}>
                {updateInfo.manifest.releaseNotes || "Performance enhancements and bug fixes."}
              </Text>
            </View>
          )}
        </View>

        {/* App Info Footer */}
        <SectionHeading label="App Identity & Architecture" gutter={stage.gutter} />
        <View style={[styles.optionsGroup, { marginHorizontal: stage.gutter, gap: 8 }]}>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Edition</Text>
            <Text style={styles.infoVal}>Hallyu Mobile</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Package ID</Text>
            <Text style={styles.infoVal}>app.hallyu.mobile</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Architecture</Text>
            <Text style={styles.infoVal}>Pure Local Storage · No Cloud Accounts</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Streaming Source</Text>
            <Text style={styles.infoVal}>Direct Moviebox Resolver</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHeading({ label, count, gutter }: { label: string; count?: number; gutter: number }) {
  return (
    <View style={[styles.sectionHeading, { marginHorizontal: gutter }]}>
      <Text style={styles.sectionHeadingText}>{label}</Text>
      {count !== undefined && <Text style={styles.sectionHeadingBadge}>{count}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  container: { gap: spacing.md },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    backgroundColor: palette.surfaceGlass,
    borderRadius: radius.card,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarGlow: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: { color: palette.textPrimary, fontSize: 17, fontWeight: "800" },
  profileSub: { color: palette.textMuted, fontSize: 12 },
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: palette.surfaceGlass,
    borderRadius: radius.card,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statItem: { alignItems: "center", flex: 1 },
  statNumber: { color: palette.accentBright, fontSize: 18, fontWeight: "800" },
  statLabel: { color: palette.textSecondary, fontSize: 11, fontWeight: "600", marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: palette.glassStroke },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionHeadingText: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  sectionHeadingBadge: {
    color: palette.accentBright,
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(255, 94, 58, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  emptyHint: { color: palette.textMuted, fontSize: 13, lineHeight: 18 },
  horizontalRail: { gap: spacing.sm },
  posterWrapper: { width: 100, gap: 4 },
  posterTitle: { color: palette.textPrimary, fontSize: 11, fontWeight: "600" },
  posterSub: { color: palette.textMuted, fontSize: 10 },
  optionsGroup: {
    backgroundColor: palette.surfaceGlass,
    borderRadius: radius.card,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  radioRowActive: {},
  radioLabel: { color: palette.textPrimary, fontSize: 14, fontWeight: "600" },
  radioHint: { color: palette.textMuted, fontSize: 11, marginTop: 2 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: palette.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: { borderColor: palette.accentBright },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accentBright },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  settingLabel: { color: palette.textPrimary, fontSize: 14, fontWeight: "500" },
  sliderLabel: { color: palette.textMuted, fontSize: 12 },
  updaterTitle: { color: palette.textPrimary, fontSize: 14, fontWeight: "700" },
  updaterDesc: { color: palette.textMuted, fontSize: 12, lineHeight: 16 },
  updaterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
  },
  updaterButtonAccent: {
    backgroundColor: palette.accent,
    borderColor: palette.accentBright,
  },
  updaterButtonText: { color: palette.accentBright, fontSize: 13, fontWeight: "700" },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.surfaceRaised,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: palette.accentBright },
  progressText: { color: palette.textMuted, fontSize: 11, textAlign: "right" },
  releaseNotesBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.3)",
    gap: 4,
  },
  releaseNotesTitle: { color: palette.accentBright, fontSize: 12, fontWeight: "700" },
  releaseNotesBody: { color: palette.textSecondary, fontSize: 11, lineHeight: 15 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoKey: { color: palette.textMuted, fontSize: 12 },
  infoVal: { color: palette.textPrimary, fontSize: 12, fontWeight: "600" },
});
