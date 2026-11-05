import { LibraryTitle } from "@/state/LibraryContext";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { GoogleSignInButton } from "@/components/ui/GoogleSignInButton";
import { palette, radius, spacing, gradients } from "@/design-system/tokens";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { useLibrary } from "@/state/LibraryContext";
import { useDisplayMode } from "@/state/DisplayModeContext";
import { useStage } from "@/hooks/useStage";
import type { DisplayMode } from "@/design-system/stage";
import { useSound } from "@/services/sound/SoundContext";
import { useAuth } from "@/services/auth/AuthContext";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import {
  MonitorSmartphone,
  ShieldCheck,
  Vibrate,
  Volume2,
  VolumeX,
  DownloadCloud,
  RefreshCw,
  Cloud,
  CheckCircle2,
  LogOut,
  Tv,
  Smartphone,
  Unlink,
} from "lucide-react-native";
import { checkForAppUpdates, startUpdateDownload, type UpdateCheckResult } from "@/services/updater/appUpdater";
import { ActivityIndicator, Alert, TextInput } from "react-native";
import React, { useState, useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DISPLAY_OPTIONS: { key: DisplayMode; label: string; hint: string }[] = [
  { key: "auto", label: "Auto", hint: "Adaptive screen" },
  { key: "tv", label: "TV Stage", hint: "10-foot remote" },
  { key: "tablet", label: "Tablet", hint: "Spatial canvas" },
];

export function MySpaceScreen() {
  const { watchlist, progress } = useLibrary();
  const {
    enabled: soundEnabled,
    setEnabled: setSoundEnabled,
    volume,
    setVolume,
    hapticsEnabled,
    setHapticsEnabled,
    play,
  } = useSound();
  const {
    user,
    isSyncing,
    signInWithGoogle,
    signOut,
    syncCloudWatchlist,
    pairedDevices,
    pairTvWithPin,
    unpairDevice,
  } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useDisplayMode();
  const stage = useStage();

  const [tvPinInput, setTvPinInput] = useState("");
  const [isPairingTv, setIsPairingTv] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);

  const handleGoogleSignIn = useCallback(async () => {
    setIsSigningIn(true);
    play("confirm");
    try {
      await signInWithGoogle();
      Alert.alert("Signed In", "Welcome to Hallyu TV Cloud! Your Watchlist is now synced.");
    } catch {
      Alert.alert("Sign In Failed", "Could not complete Google Sign-In.");
    } finally {
      setIsSigningIn(false);
    }
  }, [signInWithGoogle, play]);

  const handleSignOut = useCallback(async () => {
    play("tap");
    await signOut();
    Alert.alert("Signed Out", "Switched back to local guest mode.");
  }, [signOut, play]);

  const handleSyncCloud = useCallback(async () => {
    play("tap");
    await syncCloudWatchlist();
    Alert.alert("Cloud Sync Complete", "Your Watchlist and playback history are synced.");
  }, [syncCloudWatchlist, play]);

  const handlePairTv = useCallback(async () => {
    if (!tvPinInput.trim()) {
      Alert.alert("Enter PIN", "Please enter the 6-digit PIN displayed on your Android TV screen.");
      return;
    }
    setIsPairingTv(true);
    play("confirm");
    try {
      const res = await pairTvWithPin(tvPinInput);
      if (res.success) {
        setTvPinInput("");
        Alert.alert(
          "Android TV Connected",
          "Your phone is now linked with your TV. Your Watchlist and playback continue seamlessly."
        );
      } else {
        Alert.alert("Pairing Error", res.error || "Could not link device.");
      }
    } finally {
      setIsPairingTv(false);
    }
  }, [tvPinInput, pairTvWithPin, play]);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    play("tap");
    try {
      const res = await checkForAppUpdates();
      setUpdateInfo(res);
      if (!res.hasUpdate) {
        Alert.alert("Up to Date", `You are running the latest version (v${res.currentVersion}).`);
      }
    } finally {
      setCheckingUpdate(false);
    }
  }, [play]);

  const handleDownloadUpdate = useCallback(async () => {
    if (!updateInfo?.latestRelease) return;
    setDownloadingUpdate(true);
    play("confirm");
    try {
      const uri = await startUpdateDownload(updateInfo.latestRelease, (p) => setUpdateProgress(p));
      if (uri) {
        Alert.alert("Update Downloaded", "New Universal APK is ready. Tap to install.", [{ text: "Install" }]);
      }
    } catch {
      Alert.alert("Update Failed", "Could not download update.");
    } finally {
      setDownloadingUpdate(false);
    }
  }, [updateInfo, play]);

  const resumeList = progress.filter((p) => !p.completed && p.position_seconds > 5);

  return (
    <View style={styles.root}>
      <AmbientGlow />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + spacing.xs, paddingBottom: 110 }}
      >
        <Text style={[styles.title, { paddingHorizontal: stage.gutter }]}>My Space</Text>

        {/* Cloud Identity & Profile Card */}
        {user ? (
          <View style={[styles.profileCard, { marginHorizontal: stage.gutter }]}>
            <View style={styles.avatar}>
              <LinearGradient
                colors={gradients.accent}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "800" }}>
                {user.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{user.name}</Text>
              <Text style={styles.profileEmail}>{user.email}</Text>
              <View style={styles.badgeRow}>
                <CheckCircle2 size={12} color="#34A853" />
                <Text style={[styles.badgeText, { color: "#34A853" }]}>Google Account · Cloud Synced</Text>
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Pressable
                onPress={handleSyncCloud}
                disabled={isSyncing}
                style={[styles.smallActionBtn, { backgroundColor: "rgba(255, 94, 58, 0.18)" }]}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color={palette.accentBright} />
                ) : (
                  <Cloud size={14} color={palette.accentBright} />
                )}
              </Pressable>
              <Pressable onPress={handleSignOut} style={styles.smallActionBtn}>
                <LogOut size={14} color={palette.textSecondary} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.profileCard,
              {
                marginHorizontal: stage.gutter,
                flexDirection: "column",
                alignItems: "stretch",
                gap: spacing.md,
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={styles.avatar}>
                <LinearGradient
                  colors={gradients.accent}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <ShieldCheck size={26} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>Local Cinema Mode</Text>
                <Text style={styles.profileEmail}>Private & decentralized • Sign in to sync across TV & Phone</Text>
              </View>
            </View>

            <GoogleSignInButton
              onPress={handleGoogleSignIn}
              loading={isSigningIn}
              label="Sign in with Google to Sync"
            />
          </View>
        )}

        {/* Android TV Pairing Section */}
        <SectionHeading label="Android TV Device Pairing" gutter={stage.gutter} />
        <View style={[styles.deviceRow, { marginHorizontal: stage.gutter, flexDirection: "column", alignItems: "stretch", gap: spacing.md }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Tv size={22} color={palette.accentBright} />
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceTitle}>Pair with Android TV</Text>
              <Text style={styles.deviceMeta}>
                Enter the 6-digit PIN displayed on your television to link your phone and sync your Watchlist.
              </Text>
            </View>
          </View>

          <View style={styles.pairingInputRow}>
            <TextInput
              value={tvPinInput}
              onChangeText={setTvPinInput}
              placeholder="e.g. 749 218"
              placeholderTextColor={palette.textMuted}
              keyboardType="number-pad"
              maxLength={7}
              style={styles.pinInput}
            />
            <Pressable
              onPress={handlePairTv}
              disabled={isPairingTv}
              style={[styles.pairBtn, isPairingTv && { opacity: 0.6 }]}
            >
              {isPairingTv ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.pairBtnText}>Pair TV</Text>
              )}
            </Pressable>
          </View>

          {/* List of Paired TV Devices */}
          {pairedDevices.length > 0 ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Text style={{ color: palette.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
                Connected Devices
              </Text>
              {pairedDevices.map((dev) => (
                <View key={dev.id} style={styles.pairedDeviceItem}>
                  <Smartphone size={16} color={palette.accentBright} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>{dev.name}</Text>
                    <Text style={{ color: palette.textMuted, fontSize: 10 }}>Linked · Watchlist Synced</Text>
                  </View>
                  <Pressable onPress={() => unpairDevice(dev.id)} style={{ padding: 4 }}>
                    <Unlink size={16} color={palette.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Watchlist Section */}
        <SectionHeading label="Saved to Watchlist" count={watchlist.length} gutter={stage.gutter} />
        {watchlist.length === 0 ? (
          <Text style={[styles.emptyLine, { paddingHorizontal: stage.gutter }]}>
            Bookmarks and saved series appear here for instant access.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.hRow, { paddingHorizontal: stage.gutter }]}
          >
            {watchlist.map((item) => (
              <WatchlistTile
                key={item.subject_id}
                item={item}
                onPress={() => {
                  if (item.detail_path)
                    navigation.navigate("Details", { detailPath: item.detail_path, subjectId: item.subject_id });
                }}
              />
            ))}
          </ScrollView>
        )}

        {/* Resume Section */}
        {resumeList.length > 0 ? (
          <>
            <SectionHeading label="Watching History" count={resumeList.length} gutter={stage.gutter} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.hRow, { paddingHorizontal: stage.gutter }]}
            >
              {resumeList.map((row) => (
                <Pressable
                  key={row.subject_id}
                  style={styles.resumeCard}
                  onPress={() => {
                    if (row.detail_path)
                      navigation.navigate("Details", { detailPath: row.detail_path, subjectId: row.subject_id });
                  }}
                >
                  <Poster uri={row.poster_url} style={styles.resumePoster} initials={initialsFor(row.title)} />
                  <Text numberOfLines={1} style={styles.resumeTitle}>
                    {row.title}
                  </Text>
                  <Text style={styles.resumeMeta}>
                    {row.media_type === "series" ? `S${row.season_number} E${row.episode_number}` : "Film"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Layout & Stage Mode Selector */}
        <SectionHeading label="Display Experience" gutter={stage.gutter} />
        <View style={[styles.segment, { paddingHorizontal: stage.gutter }]}>
          {DISPLAY_OPTIONS.map((opt) => {
            const isActive = mode === opt.key;
            return (
              <Pressable
                key={opt.key}
                style={[styles.segmentBtn, isActive && styles.segmentBtnActive]}
                onPress={() => {
                  setMode(opt.key);
                  play("tap");
                }}
              >
                {isActive && (
                  <LinearGradient
                    colors={gradients.accent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                )}
                <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>{opt.label}</Text>
                <Text style={[styles.segmentHint, isActive && styles.segmentHintActive]}>{opt.hint}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Spatial Audio & Haptic Feedback */}
        <SectionHeading label="Haptics & Interface Audio" gutter={stage.gutter} />

        <View style={[styles.deviceRow, { marginHorizontal: stage.gutter }]}>
          {soundEnabled ? (
            <Volume2 size={20} color={palette.accentBright} />
          ) : (
            <VolumeX size={20} color={palette.textMuted} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceTitle}>Interface Sound FX</Text>
            <Text style={styles.deviceMeta}>Spatial glass clicks, transport feedback and completion chimes.</Text>
          </View>
          <Switch
            value={soundEnabled}
            onValueChange={setSoundEnabled}
            trackColor={{ false: "rgba(255,255,255,0.12)", true: palette.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        {soundEnabled ? (
          <View style={[styles.sliderCard, { marginHorizontal: stage.gutter }]}>
            <Text style={styles.deviceMeta}>Sound Effects Volume ({Math.round(volume * 100)}%)</Text>
            <Slider
              style={{ height: 32, marginTop: spacing.xs }}
              minimumValue={0}
              maximumValue={1}
              value={volume}
              onSlidingComplete={setVolume}
              minimumTrackTintColor={palette.accent}
              maximumTrackTintColor="rgba(255, 255, 255, 0.16)"
              thumbTintColor={palette.accentBright}
            />
          </View>
        ) : null}

        <View style={[styles.deviceRow, { marginHorizontal: stage.gutter, marginTop: spacing.md }]}>
          <Vibrate size={20} color={hapticsEnabled ? palette.accentBright : palette.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceTitle}>Liquid Haptics</Text>
            <Text style={styles.deviceMeta}>Subtle tactile vibrations on key gestures and scrubber moves.</Text>
          </View>
          <Switch
            value={hapticsEnabled}
            onValueChange={setHapticsEnabled}
            trackColor={{ false: "rgba(255,255,255,0.12)", true: palette.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* In-App Updates & Releases */}
        <SectionHeading label="In-App Updates & Releases" gutter={stage.gutter} />
        <View
          style={[
            styles.deviceRow,
            { marginHorizontal: stage.gutter, flexDirection: "column", alignItems: "stretch", gap: spacing.md },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <DownloadCloud size={20} color={palette.accentBright} />
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceTitle}>Software Version</Text>
              <Text style={styles.deviceMeta}>
                {updateInfo?.hasUpdate
                  ? `Update v${updateInfo.latestRelease?.version} available (Current: v${updateInfo.currentVersion})`
                  : updateInfo
                  ? `Latest version v${updateInfo.currentVersion} installed`
                  : "Check for new Universal APK builds and compatibility updates."}
              </Text>
            </View>
            <Pressable
              onPress={handleCheckUpdate}
              disabled={checkingUpdate || downloadingUpdate}
              style={[styles.actionBtn, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}
              accessibilityRole="button"
            >
              {checkingUpdate ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <RefreshCw size={13} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Check</Text>
                </View>
              )}
            </Pressable>
          </View>

          {updateInfo?.hasUpdate && updateInfo.latestRelease ? (
            <View style={styles.updateCard}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.updateBadge}>New Version {updateInfo.latestRelease.version}</Text>
                {downloadingUpdate ? (
                  <Text style={styles.updateProgressText}>{Math.round(updateProgress * 100)}%</Text>
                ) : null}
              </View>
              {updateInfo.latestRelease.body ? (
                <Text style={styles.updateNotes} numberOfLines={3}>
                  {updateInfo.latestRelease.body}
                </Text>
              ) : null}
              <Pressable
                onPress={handleDownloadUpdate}
                disabled={downloadingUpdate}
                style={[styles.downloadBtn, downloadingUpdate && { opacity: 0.6 }]}
                accessibilityRole="button"
              >
                {downloadingUpdate ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.downloadBtnText}>Download & Install Update</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>

        <SectionHeading label="Hardware Independence" gutter={stage.gutter} />
        <View style={[styles.deviceRow, { marginHorizontal: stage.gutter }]}>
          <MonitorSmartphone size={20} color={palette.accentBright} />
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceTitle}>Standalone Universal APK</Text>
            <Text style={styles.deviceMeta}>
              This single APK runs natively across Android TV and Handheld Mobile devices with shared liquid glass styling.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function WatchlistTile({ item, onPress }: { item: LibraryTitle; onPress: () => void }) {
  const width = 110;
  const height = Math.round((width * 3) / 2);
  return (
    <Pressable onPress={onPress} style={{ width }}>
      <View style={{ width, height, borderRadius: radius.md, overflow: "hidden", backgroundColor: palette.surface }}>
        <Poster uri={item.poster_url} style={StyleSheet.absoluteFill} initials={initialsFor(item.title)} />
      </View>
      <Text numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600", marginTop: 6 }}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={{ color: palette.textMuted, fontSize: 10, marginTop: 2 }}>
        {item.media_type === "series" ? "Series" : "Movie"}
      </Text>
    </Pressable>
  );
}

function SectionHeading({ label, count, gutter }: { label: string; count?: number; gutter: number }) {
  return (
    <View style={[styles.sectionHeading, { paddingHorizontal: gutter }]}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {typeof count === "number" && count > 0 ? <Text style={styles.sectionCount}>{count}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  title: { color: "#FFFFFF", fontWeight: "800", fontSize: 24, letterSpacing: -0.6, marginBottom: spacing.md },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: palette.surfaceGlass,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  profileName: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  profileEmail: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  badgeText: { color: palette.accentBright, fontSize: 11, fontWeight: "600" },
  smallActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.glassFillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStrokeBright,
    alignItems: "center",
    justifyContent: "center",
  },
  pairingInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pinInput: {
    flex: 1,
    height: 48,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassStrokeBright,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 2,
    paddingHorizontal: 16,
  },
  pairBtn: {
    height: 48,
    paddingHorizontal: 20,
    backgroundColor: palette.accent,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  pairBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  pairedDeviceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: palette.glassFillStrong,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStroke,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionLabel: { color: palette.textSecondary, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionCount: { color: palette.accentBright, fontSize: 12, fontWeight: "700" },
  emptyLine: { color: palette.textMuted, lineHeight: 19 },
  hRow: { gap: spacing.md },
  resumeCard: { width: 120, gap: 4 },
  resumePoster: { width: 120, height: 72, borderRadius: radius.sm, backgroundColor: palette.surfaceRaised },
  resumeTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "600", marginTop: 4 },
  resumeMeta: { color: palette.textMuted, fontSize: 10 },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: palette.surfaceGlass,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  sliderCard: {
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  deviceTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  deviceMeta: { color: palette.textMuted, fontSize: 12, lineHeight: 17 },
  segment: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  segmentBtn: {
    flex: 1,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 2,
    overflow: "hidden",
    position: "relative",
  },
  segmentBtnActive: { borderColor: palette.accentBright },
  segmentLabel: { color: palette.textSecondary, fontSize: 13, fontWeight: "700" },
  segmentLabelActive: { color: "#FFFFFF" },
  segmentHint: { color: palette.textMuted, fontSize: 10 },
  segmentHintActive: { color: "#FFFFFF" },
  actionBtn: {
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
  },
  actionBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  updateCard: {
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.accentBright,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  updateBadge: { color: palette.accentBright, fontSize: 13, fontWeight: "700" },
  updateProgressText: { color: palette.textSecondary, fontSize: 12, fontWeight: "600" },
  updateNotes: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },
  downloadBtn: {
    backgroundColor: palette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  downloadBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
