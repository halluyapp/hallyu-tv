
import { LibraryTitle } from "@/state/LibraryContext";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { useLibrary } from "@/state/LibraryContext";
import { useSound } from "@/services/sound/SoundContext";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { MonitorSmartphone, ShieldCheck, Volume2, VolumeX } from "lucide-react-native";
import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function MySpaceScreen() {
  const { watchlist, progress } = useLibrary();
  const { enabled: soundEnabled, setEnabled: setSoundEnabled, play } = useSound();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const resumeList = progress.filter((p) => !p.completed && p.position_seconds > 5);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl }}
    >
      <Text style={styles.title}>My Space</Text>

      <View style={styles.profileCard}>
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <ShieldCheck size={24} color={palette.accentBright} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>Your device, your library</Text>
          <Text style={styles.profileEmail}>No account required</Text>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
          {resumeList.map((p) => (
            <Pressable
              key={`${p.subject_id}_${p.season_number ?? 0}_${p.episode_number ?? 0}`}
              onPress={() => navigation.navigate("Details", { detailPath: p.detail_path ?? "", subjectId: p.subject_id })}
              style={styles.resumeCard}
            >
              {p.poster_url ? <Image source={{ uri: p.poster_url }} style={styles.resumePoster} /> : <View style={[styles.resumePoster, { backgroundColor: palette.surfaceRaised }]} />}
              <Text style={styles.resumeTitle} numberOfLines={1}>{p.title}</Text>
              <Text style={styles.resumeMeta}>
                {p.media_type === "series" && p.season_number ? `S${p.season_number} E${p.episode_number} · ` : ""}
                {p.duration_seconds > 0 ? Math.round((p.position_seconds / p.duration_seconds) * 100) : 0}% watched
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <SectionHeading label="Watchlist" count={watchlist.length} />
      {watchlist.length === 0 ? (
        <Text style={styles.emptyLine}>Tap the bookmark on any title to save it here.</Text>
      ) : (
        <View style={styles.grid}>
          {watchlist.map((w) => (
            <WatchlistTile
              key={w.subject_id}
              item={w}
              onPress={() => navigation.navigate("Details", { detailPath: w.detail_path ?? "", subjectId: w.subject_id })}
            />
          ))}
        </View>
      )}

      <SectionHeading label="Preferences" />
      <View style={styles.deviceRow}>
        {soundEnabled ? (
          <Volume2 size={20} color={palette.accentBright} />
        ) : (
          <VolumeX size={20} color={palette.textMuted} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.deviceTitle}>Sound effects</Text>
          <Text style={styles.deviceMeta}>
            Soft glass-and-ember interface tones. Sound in titles always keeps its own audio.
          </Text>
        </View>
        <Switch
          value={soundEnabled}
          onValueChange={(v) => {
            setSoundEnabled(v);
            if (v) play("confirm");
          }}
          trackColor={{ false: palette.surfaceRaised, true: palette.accent }}
          thumbColor="#F4F2ED"
        />
      </View>

      <SectionHeading label="Independent devices" />
      <View style={styles.deviceRow}>
        <MonitorSmartphone size={20} color={palette.accentBright} />
        <View style={{ flex: 1 }}>
          <Text style={styles.deviceTitle}>TV and mobile work on their own</Text>
          <Text style={styles.deviceMeta}>Each device keeps its own library and downloads. No pairing or sign-in is needed.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function WatchlistTile({ item, onPress }: { item: LibraryTitle; onPress: () => void }) {
  const [failed, setFailed] = React.useState(false);
  const initials = item.title.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("");
  const width = 108;
  const height = Math.round((width * 3) / 2);
  return (
    <Pressable onPress={onPress} style={{ width }}>
      <View style={{ width, height, borderRadius: radius.md, overflow: "hidden", backgroundColor: palette.surface }}>
        {!failed && item.poster_url ? (
          <Image source={{ uri: item.poster_url }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceRaised }]}>
            <Text style={{ color: palette.textMuted, fontSize: 22, fontWeight: "800" }}>{initials}</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ color: palette.textPrimary, fontSize: 12, fontWeight: "600", marginTop: 4 }}>{item.title}</Text>
      <Text numberOfLines={1} style={{ color: palette.textMuted, fontSize: 10, marginTop: 2 }}>{item.media_type === "series" ? "Series" : "Movie"}</Text>
    </Pressable>
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
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: { backgroundColor: palette.accentSoft, alignItems: "center", justifyContent: "center" },
  profileName: { ...typeScale.headline, color: palette.textPrimary },
  profileEmail: { color: palette.textMuted, fontSize: 12 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  badgeText: { color: palette.success, fontSize: 11 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.xxl, marginBottom: spacing.md },
  sectionLabel: { ...typeScale.micro, color: palette.textSecondary },
  sectionCount: { ...typeScale.micro, color: palette.accent },
  emptyLine: { color: palette.textMuted, paddingHorizontal: spacing.xl, lineHeight: 19 },
  hRow: { paddingHorizontal: spacing.xl, gap: spacing.md },
  resumeCard: { width: 120, gap: 4 },
  resumePoster: { width: 120, height: 68, borderRadius: radius.sm, backgroundColor: palette.surfaceRaised },
  resumeTitle: { color: palette.textPrimary, fontSize: 12, fontWeight: "600", marginTop: 4 },
  resumeMeta: { color: palette.textMuted, fontSize: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.xl },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  deviceTitle: { ...typeScale.headline, color: palette.textPrimary },
  deviceMeta: { color: palette.textMuted, fontSize: 12, lineHeight: 17 },
});
