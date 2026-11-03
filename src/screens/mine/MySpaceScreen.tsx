import { useGate } from "@/components/auth/GateProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { LibraryTitle } from "@/state/LibraryContext";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { useAuth } from "@/hooks/useAuth";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { useLibrary } from "@/state/LibraryContext";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react-native";
import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function MySpaceScreen() {
  const { user, signOut } = useAuth();
  const { showGate } = useGate();
  const { watchlist, progress } = useLibrary();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const resumeList = progress.filter((p) => !p.completed && p.position_seconds > 5);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl }}
    >
      <Text style={styles.title}>My Space</Text>

      {user ? (
        <View style={styles.profileCard}>
          {user.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName} numberOfLines={1}>{user.name ?? "Viewer"}</Text>
            <Text style={styles.profileEmail} numberOfLines={1}>{user.email}</Text>
            <View style={styles.badgeRow}>
              <ShieldCheck size={12} color={palette.success} />
              <Text style={styles.badgeText}>Sessions stay on this device</Text>
            </View>
          </View>
          <Pressable onPress={() => void signOut()} style={styles.signOut}>
            <LogOut size={16} color={palette.danger} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.guestCard}>
          <Text style={styles.guestTitle}>You're watching as a guest</Text>
          <Text style={styles.guestBody}>
            Sign in with Google to keep your watchlist and resume points across this device and your TV. Playback
            never auto-starts — you're always in control of the tap.
          </Text>
          <Button
            label="Sign in with Google"
            onPress={() =>
              showGate({
                title: "One tap to sign in",
                message: "Google sign-in takes seconds. Your library syncs privately to your account.",
              })
            }
            variant="primary"
          />
        </View>
      )}

      <SectionHeading label="Continue watching" count={resumeList.length} />
      {resumeList.length === 0 ? (
        <Text style={styles.emptyLine}>Nothing in progress yet. Start anything and it lands here.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
          {resumeList.map((p) => (
            <Pressable
              key={`${p.subject_id}_${p.season_number ?? 0}_${p.episode_number ?? 0}`}
              onPress={() => {
                void (async () => {
                  // Re-enter through Details so Play is always an explicit user action.
                  navigation.navigate("Details", { detailPath: p.detail_path ?? "", subjectId: p.subject_id });
                })();
              }}
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

      <SectionHeading label="Devices" />
      <Pressable style={styles.deviceRow} onPress={() => navigation.navigate("Devices")}>
        <MonitorSmartphone size={20} color={palette.accentBright} />
        <View style={{ flex: 1 }}>
          <Text style={styles.deviceTitle}>TVs & linked devices</Text>
          <Text style={styles.deviceMeta}>Pair this account with a TV using a 6-digit code.</Text>
        </View>
        <Text style={styles.chev}>›</Text>
      </Pressable>
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
  avatarInitial: { color: palette.accentBright, fontSize: 22, fontWeight: "800" },
  profileName: { ...typeScale.headline, color: palette.textPrimary },
  profileEmail: { color: palette.textMuted, fontSize: 12 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  badgeText: { color: palette.success, fontSize: 11 },
  signOut: { padding: spacing.sm },
  guestCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  guestTitle: { ...typeScale.headline, color: palette.textPrimary },
  guestBody: { color: palette.textSecondary, lineHeight: 20 },
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
  deviceMeta: { color: palette.textMuted, fontSize: 12 },
  chev: { color: palette.textMuted, fontSize: 22 },
});
