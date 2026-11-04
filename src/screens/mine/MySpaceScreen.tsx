import { Poster, initialsFor } from "@/components/ui/Poster";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { APP_NAME, APP_VERSION } from "@/config/branding";
import { effects } from "@/hooks/useDeviceTier";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { useLibrary, type LibraryTitle } from "@/state/LibraryContext";
import { useSound } from "@/services/sound/SoundContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Slider from "@react-native-community/slider";
import { ChevronRight, MonitorSmartphone, Play, ShieldCheck, Trash2, Vibrate, Volume2, VolumeX } from "lucide-react-native";
import React, { useCallback } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chrome } from "@/design-system/gradients";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Profile / My Space.
 *
 * The watchlist used to be rendered with `.map()` inside a ScrollView — up to
 * 500 poster cards mounted simultaneously. It is now a virtualised grid. Every
 * control on this screen changes something real; there are no decorative
 * toggles.
 */
export function MySpaceScreen() {
  const { watchlist, progress, toggleWatchlist, clearProgress } = useLibrary();
  const { enabled: soundEnabled, setEnabled: setSoundEnabled, volume, setVolume, hapticsEnabled, setHapticsEnabled, play } = useSound();
  const reducedMotion = useReducedMotion();
  const fx = effects();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const resumeList = progress.filter((p) => !p.completed && p.position_seconds > 5);

  const openTitle = useCallback(
    (subjectId: string, detailPath: string | null) => {
      navigation.navigate("Details", { detailPath: detailPath ?? "", subjectId });
    },
    [navigation],
  );

  const header = (
    <>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <ShieldCheck size={24} color={palette.cyan} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>Your device, your library</Text>
          <Text style={styles.profileMeta}>No account required</Text>
          <View style={styles.badgeRow}>
            <ShieldCheck size={12} color={palette.success} />
            <Text style={styles.badgeText}>Watchlist and progress stay on this device</Text>
          </View>
        </View>
      </View>

      <SectionHeading label="Continue watching" count={resumeList.length} />
      {resumeList.length === 0 ? (
        <Text style={styles.emptyLine}>Nothing in progress yet. Start anything and it lands here.</Text>
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hRow}
          data={resumeList}
          keyExtractor={(p) => `${p.subject_id}_${p.season_number ?? 0}_${p.episode_number ?? 0}`}
          initialNumToRender={6}
          windowSize={5}
          renderItem={({ item: p }) => (
            <Pressable
              style={styles.resumeCard}
              onPress={() => openTitle(p.subject_id, p.detail_path)}
              accessibilityRole="button"
              accessibilityLabel={`${p.title}, ${Math.round((p.position_seconds / Math.max(p.duration_seconds, 1)) * 100)} percent watched`}
            >
              <View style={styles.resumePosterWrap}>
                <Poster uri={p.poster_url} style={StyleSheet.absoluteFill} initials={initialsFor(p.title)} borderRadius={0} />
                <View style={styles.resumePlay}>
                  <Play size={12} color={palette.textPrimary} fill={palette.textPrimary} />
                </View>
              </View>
              <Text style={styles.resumeTitle} numberOfLines={1}>
                {p.title}
              </Text>
              <Text style={styles.resumeMeta}>
                {p.media_type === "series" && p.season_number ? `S${p.season_number} E${p.episode_number} · ` : ""}
                {p.duration_seconds > 0 ? Math.round((p.position_seconds / p.duration_seconds) * 100) : 0}% watched
              </Text>
            </Pressable>
          )}
        />
      )}

      <SectionHeading label="Watchlist" count={watchlist.length} />
      {watchlist.length === 0 ? (
        <Text style={styles.emptyLine}>Tap the bookmark on any title to save it here.</Text>
      ) : null}
    </>
  );

  const footer = (
    <>
      <SectionHeading label="Preferences" />

      <View style={styles.settingRow}>
        {soundEnabled ? <Volume2 size={20} color={palette.accentBright} /> : <VolumeX size={20} color={palette.textMuted} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.settingTitle}>Sound effects</Text>
          <Text style={styles.settingMeta}>Short interface tones. A title's own audio is unaffected.</Text>
        </View>
        <Switch
          value={soundEnabled}
          onValueChange={(v) => {
            setSoundEnabled(v);
            if (v) play("confirm");
          }}
          trackColor={{ false: palette.surfaceRaised, true: palette.accent }}
          thumbColor={palette.textPrimary}
          accessibilityLabel="Sound effects"
        />
      </View>

      {soundEnabled ? (
        <View style={styles.settingRow}>
          <Volume2 size={20} color={palette.accentBright} />
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Sound volume</Text>
            <Text style={styles.settingMeta}>Interface tones always stay quieter than the titles you watch.</Text>
          </View>
          <Slider
            style={{ width: 110, height: 40 }}
            minimumValue={0}
            maximumValue={1}
            value={volume}
            onSlidingComplete={setVolume}
            minimumTrackTintColor={palette.accent}
            maximumTrackTintColor={palette.surfaceRaised}
            thumbTintColor={palette.cyan}
            accessibilityLabel="Sound effect volume"
          />
        </View>
      ) : null}

      <View style={styles.settingRow}>
        <Vibrate size={20} color={hapticsEnabled ? palette.accentBright : palette.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={styles.settingTitle}>Haptics</Text>
          <Text style={styles.settingMeta}>A gentle buzz on meaningful actions. Never on TV.</Text>
        </View>
        <Switch
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
          trackColor={{ false: palette.surfaceRaised, true: palette.accent }}
          thumbColor={palette.textPrimary}
          accessibilityLabel="Haptic feedback"
        />
      </View>

      <View style={styles.settingRow}>
        <MonitorSmartphone size={20} color={palette.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={styles.settingTitle}>Motion</Text>
          <Text style={styles.settingMeta}>
            {reducedMotion ? "Reduced — following your device's accessibility setting." : "Full — follows your device's accessibility setting."}
          </Text>
        </View>
      </View>

      {resumeList.length > 0 ? (
        <Pressable
          style={styles.settingRow}
          onPress={() => {
            void clearProgress(resumeList[0]!.subject_id);
            play("tap");
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear the most recent resume point"
        >
          <Trash2 size={20} color={palette.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Clear a resume point</Text>
            <Text style={styles.settingMeta}>Removes the most recent “Continue watching” entry from this device.</Text>
          </View>
          <ChevronRight size={18} color={palette.textMuted} />
        </Pressable>
      ) : null}

      <SectionHeading label="About" />
      <View style={styles.aboutCard}>
        <Text style={styles.aboutLine}>
          {APP_NAME} · v{APP_VERSION}
        </Text>
        <Text style={styles.aboutMeta}>
          Playback, watchlist and downloads are stored only on this device. No account, no pairing, no cross-device sync.
        </Text>
        <Text style={styles.aboutMeta}>
          Device capability profile: {fx.tier}. {fx.blur ? "Glass blur enabled." : "Glass blur disabled to keep scrolling smooth on this device."}
        </Text>
      </View>
    </>
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 130 }}
      showsVerticalScrollIndicator={false}
    >
      {header}
      {watchlist.length > 0 ? (
        <FlatList
          data={watchlist}
          numColumns={3}
          scrollEnabled={false}
          keyExtractor={(w) => w.subject_id}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.xl }}
          contentContainerStyle={{ gap: spacing.lg }}
          initialNumToRender={fx.listInitial + 3}
          maxToRenderPerBatch={fx.listBatch}
          windowSize={fx.listWindow}
          renderItem={({ item }) => <WatchlistTile item={item} onPress={() => openTitle(item.subject_id, item.detail_path)} onRemove={() => void toggleWatchlist(item)} />}
        />
      ) : null}
      {footer}
    </ScrollView>
  );
}

function WatchlistTile({ item, onPress, onRemove }: { item: LibraryTitle; onPress: () => void; onRemove: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={item.title}>
        <Poster uri={item.poster_url} style={styles.watchPoster} initials={initialsFor(item.title)} fallbackLabel={item.title} />
      </Pressable>
      <Text numberOfLines={1} style={styles.watchTitle}>
        {item.title}
      </Text>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${item.title} from watchlist`}>
        <Text style={styles.watchRemove}>Remove</Text>
      </Pressable>
    </View>
  );
}

function SectionHeading({ label, count }: { label: string; count?: number }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {typeof count === "number" && count > 0 ? <Text style={styles.sectionCount}>{count}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  title: { ...typeScale.display, color: palette.textPrimary, paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.accentSoft, alignItems: "center", justifyContent: "center" },
  profileName: { ...typeScale.headline, color: palette.textPrimary },
  profileMeta: { ...typeScale.caption, color: palette.textMuted, marginTop: 1 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  badgeText: { color: palette.success, fontSize: 11, flex: 1 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.xl, marginBottom: spacing.md },
  sectionLabel: { ...typeScale.micro, color: palette.textSecondary },
  sectionCount: { ...typeScale.micro, color: palette.accentBright },
  emptyLine: { ...typeScale.caption, color: palette.textMuted, paddingHorizontal: spacing.xl, lineHeight: 19 },
  hRow: { paddingHorizontal: spacing.xl, gap: spacing.md },
  resumeCard: { width: 118 },
  resumePosterWrap: { width: 118, height: 168, borderRadius: radius.md, overflow: "hidden", backgroundColor: palette.surface },
  resumePlay: {
    position: "absolute",
    alignSelf: "center",
    top: 66,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: chrome.scrimSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  resumeTitle: { color: palette.textPrimary, fontSize: 12, fontWeight: "600", marginTop: 6 },
  resumeMeta: { color: palette.textMuted, fontSize: 10, marginTop: 2 },
  watchPoster: { width: "100%", aspectRatio: 2 / 3 },
  watchTitle: { color: palette.textPrimary, fontSize: 12, fontWeight: "600", marginTop: 5 },
  watchRemove: { color: palette.textMuted, fontSize: 10, marginTop: 2 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 64,
  },
  settingTitle: { ...typeScale.headline, color: palette.textPrimary },
  settingMeta: { ...typeScale.caption, color: palette.textMuted, marginTop: 2, lineHeight: 17 },
  aboutCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 6,
  },
  aboutLine: { ...typeScale.headline, color: palette.textPrimary },
  aboutMeta: { ...typeScale.caption, color: palette.textMuted, lineHeight: 18 },
});
