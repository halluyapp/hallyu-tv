import { LibraryTitle } from "@/state/LibraryContext";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
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
import { MonitorSmartphone, ShieldCheck, Vibrate, Volume2, VolumeX, Sparkles } from "lucide-react-native";
import React from "react";
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
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useDisplayMode();
  const stage = useStage();

  const resumeList = progress.filter((p) => !p.completed && p.position_seconds > 5);

  return (
    <View style={styles.root}>
      <AmbientGlow />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + spacing.xs, paddingBottom: 110 }}
      >
        <Text style={[styles.title, { paddingHorizontal: stage.gutter }]}>My Space</Text>

        {/* Liquid Glass Hero Identity Card */}
        <View style={[styles.profileCard, { marginHorizontal: stage.gutter }]}>
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
            <Text style={styles.profileName}>Local Cinema Vault</Text>
            <Text style={styles.profileEmail}>Private & decentralized • No account needed</Text>
            <View style={styles.badgeRow}>
              <Sparkles size={12} color={palette.accentBright} />
              <Text style={styles.badgeText}>Hardware Encrypted Local Storage</Text>
            </View>
          </View>
        </View>

        {/* Watchlist Section */}
        <SectionHeading label="Saved to Watchlist" count={watchlist.length} gutter={stage.gutter} />
        {watchlist.length === 0 ? (
          <Text style={[styles.emptyLine, { paddingHorizontal: stage.gutter }]}>
            Bookmarks and saved series appear here for instant access.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.hRow, { paddingHorizontal: stage.gutter }]}>
            {watchlist.map((item) => (
              <WatchlistTile
                key={item.subject_id}
                item={item}
                onPress={() => { if (item.detail_path) navigation.navigate("Details", { detailPath: item.detail_path, subjectId: item.subject_id }); }}
              />
            ))}
          </ScrollView>
        )}

        {/* Resume Section */}
        {resumeList.length > 0 ? (
          <>
            <SectionHeading label="Watching History" count={resumeList.length} gutter={stage.gutter} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.hRow, { paddingHorizontal: stage.gutter }]}>
              {resumeList.map((row) => (
                <Pressable
                  key={row.subject_id}
                  style={styles.resumeCard}
                  onPress={() => { if (row.detail_path) navigation.navigate("Details", { detailPath: row.detail_path, subjectId: row.subject_id }); }}
                >
                  <Poster uri={row.poster_url} style={styles.resumePoster} initials={initialsFor(row.title)} />
                  <Text numberOfLines={1} style={styles.resumeTitle}>{row.title}</Text>
                  <Text style={styles.resumeMeta}>{row.media_type === "series" ? `S${row.season_number} E${row.episode_number}` : "Film"}</Text>
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
          {soundEnabled ? <Volume2 size={20} color={palette.accentBright} /> : <VolumeX size={20} color={palette.textMuted} />}
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

        <SectionHeading label="Hardware Independence" gutter={stage.gutter} />
        <View style={[styles.deviceRow, { marginHorizontal: stage.gutter }]}>
          <MonitorSmartphone size={20} color={palette.accentBright} />
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceTitle}>Standalone APK Design</Text>
            <Text style={styles.deviceMeta}>This single APK runs natively on Android TV and Handheld Mobile devices.</Text>
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
});
