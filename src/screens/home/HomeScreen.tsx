import { PosterCard } from "@/components/ui/PosterCard";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { EmptyState, ErrorState, SkeletonRail } from "@/components/ui/States";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { useSound } from "@/services/sound/SoundContext";
import { CatalogueItem, HomeSection, ProviderError } from "@/types/provider";
import { fetchHome } from "@/services/provider/adapter";
import { useLibrary, ProgressRow } from "@/state/LibraryContext";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, Play } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList, TabParamList } from "@/navigation/RootNavigator";
import { APP_NAME } from "@/config/branding";

type Nav = NativeStackNavigationProp<RootStackParamList> & BottomTabNavigationProp<TabParamList, "Home">;

/** Editorial hero pulled from the first catalogue section. */
function Hero({ item, onPress, resume }: { item: CatalogueItem; onPress: () => void; resume: ProgressRow | null }) {
  const { play } = useSound();
  const open = useCallback(() => {
    play("tap");
    onPress();
  }, [play, onPress]);
  return (
    <Pressable onPress={open} style={styles.hero}>
      <Poster uri={item.posterUrl} style={StyleSheet.absoluteFill} initials={initialsFor(item.name)} />
      <AmbientGlow />
      <LinearGradient
        colors={["rgba(8,10,13,0.10)", "rgba(8,10,13,0.45)", "rgba(8,10,13,0.96)"]}
        locations={[0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroContent}>
        <View style={styles.heroBadgeRow}>
          <View style={styles.heroBadgeDot} />
          <Text style={styles.heroBadge}>{resume ? "Continue Watching" : "Featured"}</Text>
        </View>
        <Text style={styles.heroTitle}>{item.name}</Text>
        <Text style={styles.heroMeta}>
          {[item.year, item.genre?.split(",")[0], item.rating ? `IMDb ${item.rating}` : null].filter(Boolean).join(" · ")}
        </Text>
        <View style={styles.heroActions}>
          <Pressable style={styles.playBtn} onPress={open}>
            <Play size={14} color="#1A0E0A" fill="#1A0E0A" />
            <Text style={styles.playLabel}>{resume ? "Resume" : "View"}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function ContinueWatchingRail({ onOpen }: { onOpen: (p: ProgressRow) => void }) {
  const { progress } = useLibrary();
  const rows = progress.filter((p) => !p.completed && p.position_seconds > 5).slice(0, 10);
  if (rows.length === 0) return null;
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.railTitle}>Continue Watching</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl }}
        data={rows}
        keyExtractor={(p) => `${p.subject_id}_${p.season_number}_${p.episode_number}`}
        renderItem={({ item }) => (
          <Pressable style={styles.resumeCard} onPress={() => onOpen(item)}>
            <Poster uri={item.poster_url} style={StyleSheet.absoluteFill} initials={initialsFor(item.title)} />
            <View style={styles.resumeScrim} />
            <View style={styles.resumePlay}>
              <Play size={13} color={palette.textPrimary} fill={palette.textPrimary} />
            </View>
            <View style={styles.resumeBarTrack}>
              <View
                style={[
                  styles.resumeBar,
                  { width: `${Math.min(100, item.duration_seconds > 0 ? (item.position_seconds / item.duration_seconds) * 100 : 3)}%` },
                ]}
              />
            </View>
            <Text numberOfLines={1} style={styles.resumeTitle}>{item.title}</Text>
            <Text style={styles.resumeMeta}>
              {item.media_type === "series" && item.season_number ? `S${item.season_number} · E${item.episode_number ?? 1}` : "Movie"}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

export function HomeScreen() {
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation<Nav>();
  const { latestFor } = useLibrary();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchHome();
      setSections(data);
    } catch (err) {
      setError(err instanceof ProviderError ? err.message : "Could not reach the catalogue. Check your connection.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const heroItem = useMemo(() => sections?.find((s) => s.section === "Banner")?.items[0] ?? sections?.[0]?.items[0] ?? null, [sections]);
  const rails = useMemo(
    () => (sections ?? []).filter((s) => s.section !== "Banner" && s.items.length > 0),
    [sections],
  );

  const openDetails = useCallback(
    (item: CatalogueItem) => {
      navigation.navigate("Details", { detailPath: item.slug, subjectId: item.subjectId });
    },
    [navigation],
  );
  const openProgress = useCallback(
    (p: ProgressRow) => {
      navigation.navigate("Details", { detailPath: p.detail_path ?? "", subjectId: p.subject_id });
    },
    [navigation],
  );

  const heroProgress = heroItem ? latestFor(heroItem.subjectId) : null;
  const heroResume = heroProgress && !heroProgress.completed && heroProgress.position_seconds > 5 ? heroProgress : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>{APP_NAME}</Text>
        </View>
        <Pressable style={styles.searchBtn} onPress={() => navigation.navigate("Discover")} hitSlop={8}>
          <Search size={20} color={palette.textSecondary} />
        </Pressable>
      </View>

      {error && sections === null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : sections === null ? (
        <View style={{ marginTop: spacing.xl, gap: spacing.xl }}>
          <SkeletonRail itemWidth={width - spacing.xl * 2} count={1} />
          <SkeletonRail />
          <SkeletonRail />
        </View>
      ) : sections.length === 0 ? (
        <EmptyState title="Nothing here yet" message="The catalogue is empty right now. Pull to refresh later." />
      ) : (
        <FlatList
          data={rails}
          keyExtractor={(s) => s.section}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          ListHeaderComponent={
            heroItem ? (
              <View style={{ marginBottom: spacing.sm }}>
                <Hero item={heroItem} onPress={() => openDetails(heroItem)} resume={heroResume} />
                <ContinueWatchingRail onOpen={openProgress} />
              </View>
            ) : null
          }
          renderItem={({ item: rail }) => (
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.railHeader}>
                <View style={styles.railTick} />
                <Text style={styles.railTitle}>{rail.section}</Text>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: spacing.xl }}
                data={rail.items}
                keyExtractor={(i) => `${rail.section}_${i.subjectId}`}
                windowSize={5}
                initialNumToRender={8}
                maxToRenderPerBatch={12}
                removeClippedSubviews
                renderItem={({ item }) => <PosterCard item={item} onPress={() => openDetails(item)} />}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  brand: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  searchBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.glassFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStroke,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    height: 430,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: palette.surface,
  },
  heroBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.xs },
  heroBadgeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.accent },
  heroBadge: { ...typeScale.micro, color: palette.accent },
  heroContent: { position: "absolute", left: spacing.xl, right: spacing.xl, bottom: spacing.xl, gap: spacing.xs },
  heroTitle: { ...typeScale.display, color: palette.textPrimary },
  heroMeta: { ...typeScale.caption, color: palette.textSecondary, marginTop: 2 },
  heroActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  playLabel: { color: "#1A0E0A", fontWeight: "700", fontSize: 13 },
  railTitle: {
    ...typeScale.headline,
    color: palette.textPrimary,
  },
  resumeCard: {
    width: 150,
    height: 210,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: palette.surface,
    marginRight: spacing.md,
  },
  resumeScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,10,13,0.35)" },
  resumePlay: {
    position: "absolute",
    alignSelf: "center",
    top: 78,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(8,10,13,0.62)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStroke,
    alignItems: "center",
    justifyContent: "center",
  },
  railHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  railTick: { width: 3, height: 14, borderRadius: 2, backgroundColor: palette.accent },
  resumeBarTrack: {
    position: "absolute",
    bottom: 34,
    left: spacing.sm,
    right: spacing.sm,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(244,242,237,0.2)",
  },
  resumeBar: { height: 3, borderRadius: 2, backgroundColor: palette.accent },
  resumeTitle: { position: "absolute", bottom: 18, left: spacing.sm, right: spacing.sm, color: palette.textPrimary, fontSize: 12, fontWeight: "700" },
  resumeMeta: { position: "absolute", bottom: 4, left: spacing.sm, color: palette.textSecondary, fontSize: 10 },
});
