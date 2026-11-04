import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { EmptyState, ErrorState, SkeletonRail } from "@/components/ui/States";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { effects } from "@/hooks/useDeviceTier";
import { APP_NAME } from "@/config/branding";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchHome } from "@/services/provider/adapter";
import { resolveStreams } from "@/services/provider/adapter";
import { selectSource } from "@/services/provider/streams";
import { isResumable, primaryActionLabel, resumeTargetFor } from "@/services/library/resume";
import { useSound } from "@/services/sound/SoundContext";
import { useLibrary, type ProgressRow } from "@/state/LibraryContext";
import { CatalogueItem, HomeSection, ProviderError } from "@/types/provider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Info, Play, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { cardScrim, chrome, heroScrim } from "@/design-system/gradients";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const RAIL_POSTER_W = 124;

export function HomeScreen() {
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const navigation = useNavigation<Nav>();
  const { latestFor } = useLibrary();
  const { play } = useSound();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fx = effects();

  // Abort in-flight catalogue work when the screen goes away.
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (opts: { force?: boolean; background?: boolean } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!opts.background) setError(null);
      try {
        const data = await fetchHome({
          signal: controller.signal,
          force: opts.force,
          onBackground: (fresh) => setSections(fresh),
        });
        if (!controller.signal.aborted) setSections(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        // A background revalidation failure keeps whatever is on screen.
        if (opts.background) return;
        setError(err instanceof ProviderError ? err.message : "Could not reach the catalogue. Check your connection.");
      }
    },
    [],
  );

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ force: true });
    setRefreshing(false);
  }, [load]);

  const heroItem = useMemo(
    () => sections?.find((s) => s.section === "Banner")?.items[0] ?? sections?.[0]?.items[0] ?? null,
    [sections],
  );
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

  /**
   * Resume really resumes. This used to navigate to Details while the button
   * said "Resume" — the single most misleading control in the app.
   */
  const resumeRow = useCallback(
    async (row: ProgressRow) => {
      // A row without a slug cannot be resolved. Never navigate to Details with
      // an empty path — that screen would immediately fail its catalogue call.
      if (!row.detail_path) return;
      setStarting(true);
      try {
        const se = row.season_number ?? 0;
        const ep = row.episode_number ?? 0;
        const res = await resolveStreams(row.subject_id, row.detail_path, se, ep);
        const picked = selectSource(res.sources, null);
        if (!picked) throw new Error("empty");
        play("play");
        navigation.navigate("Player", {
          subjectId: row.subject_id,
          detailPath: row.detail_path,
          title: row.title,
          posterUrl: row.poster_url,
          mediaType: row.media_type,
          season: se,
          episode: ep,
          resumeAt: Math.floor(row.position_seconds),
          sources: res.sources,
          nextEpisode: null,
        });
      } catch {
        // Resuming failed: fall back to Details rather than dead-ending, and let
        // the user press play there (which re-resolves and reports the reason).
        navigation.navigate("Details", { detailPath: row.detail_path, subjectId: row.subject_id });
      } finally {
        setStarting(false);
      }
    },
    [navigation, play],
  );

  const heroProgress = heroItem ? latestFor(heroItem.subjectId) : null;
  // Resume needs a slug to re-resolve streams. Without one the button must say
  // "Play" and open Details rather than promising a resume it cannot perform.
  const heroLabel: "Resume" | "Play" = heroProgress?.detail_path ? primaryActionLabel(heroProgress) : "Play";
  const heroTarget = heroItem
    ? resumeTargetFor(heroProgress, heroItem.mediaType === "series" ? 1 : 0, heroItem.mediaType === "series" ? 1 : 0)
    : null;

  const onHeroPrimary = useCallback(async () => {
    if (!heroItem || !heroTarget) return;
    if (heroLabel === "Resume" && heroProgress?.detail_path) {
      await resumeRow(heroProgress);
      return;
    }
    // No progress yet: open Details, where the first Play resolves the stream.
    play("tap");
    openDetails(heroItem);
  }, [heroItem, heroTarget, heroLabel, heroProgress, resumeRow, play, openDetails]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Text style={styles.brand}>{APP_NAME}</Text>
        <Pressable
          style={styles.searchBtn}
          onPress={() => navigation.navigate("Search")}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Search titles"
        >
          <Search size={19} color={palette.textSecondary} />
        </Pressable>
      </View>

      {error && sections === null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : sections === null ? (
        <View style={{ marginTop: spacing.xl, gap: spacing.xl }}>
          <SkeletonRail itemWidth={width - spacing.xl * 2} count={1} />
          <SkeletonRail count={4} />
          <SkeletonRail count={4} />
        </View>
      ) : sections.length === 0 ? (
        <EmptyState title="Nothing here yet" message="The catalogue is empty right now. Pull to refresh in a moment." />
      ) : (
        <FlatList
          data={rails}
          keyExtractor={(s) => s.section}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
          contentContainerStyle={{ paddingBottom: 120 }}
          windowSize={fx.listWindow + 2}
          removeClippedSubviews
          ListHeaderComponent={
            heroItem ? (
              <View style={{ marginBottom: spacing.md }}>
                <Hero
                  item={heroItem}
                  label={heroLabel}
                  starting={starting}
                  onPrimary={() => void onHeroPrimary()}
                  onDetails={() => openDetails(heroItem)}
                />
                <ContinueWatching onOpen={(row) => void resumeRow(row)} />
              </View>
            ) : null
          }
          renderItem={({ item: rail }) => (
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.railHeader}>
                <View style={styles.railTick} />
                <Text style={styles.railTitle}>{rail.section}</Text>
                <Text style={styles.railCount}>{rail.items.length}</Text>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
                data={rail.items}
                keyExtractor={(i) => `${rail.section}_${i.subjectId}`}
                windowSize={fx.listWindow}
                initialNumToRender={fx.listInitial}
                maxToRenderPerBatch={fx.listBatch}
                removeClippedSubviews
                renderItem={({ item }) => <RailTile item={item} onPress={() => openDetails(item)} />}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

/** Cinematic hero: full-bleed artwork, one honest primary action. */
function Hero({
  item,
  label,
  starting,
  onPrimary,
  onDetails,
}: {
  item: CatalogueItem;
  label: "Resume" | "Play";
  starting: boolean;
  onPrimary: () => void;
  onDetails: () => void;
}) {
  return (
    <View style={styles.hero}>
      <Poster uri={item.posterUrl} style={StyleSheet.absoluteFill} initials={initialsFor(item.name)} priority="high" fallbackLabel={item.name} />
      <AmbientGlow />
      <LinearGradient
        colors={heroScrim}
        locations={[0.22, 0.55, 0.85, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroContent}>
        <View style={styles.heroBadgeRow}>
          <View style={styles.heroBadgeDot} />
          <Text style={styles.heroBadge}>{label === "Resume" ? "Continue watching" : "Featured tonight"}</Text>
        </View>
        <Text numberOfLines={2} style={styles.heroTitle}>
          {item.name}
        </Text>
        <Text style={styles.heroMeta}>
          {[item.year, item.genre?.split(",")[0], item.rating ? `★ ${item.rating}` : null, item.mediaType === "series" ? "Series" : "Movie"]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>
        <View style={styles.heroActions}>
          <Pressable
            style={styles.primaryBtn}
            onPress={onPrimary}
            disabled={starting}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${item.name}`}
          >
            <Play size={16} color={palette.textOnAccent} fill={palette.textOnAccent} />
            <Text style={styles.primaryLabel}>{starting ? "Opening…" : label}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onDetails} accessibilityRole="button" accessibilityLabel={`More about ${item.name}`}>
            <Info size={16} color={palette.textPrimary} />
            <Text style={styles.secondaryLabel}>Details</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Continue watching: tapping a card resumes that episode. */
function ContinueWatching({ onOpen }: { onOpen: (row: ProgressRow) => void }) {
  const { progress } = useLibrary();
  // One shared rule for "resumable" — the rail must not invent its own threshold.
  const rows = useMemo(
    () => progress.filter((p) => isResumable(p) && Boolean(p.detail_path)).slice(0, 12),
    [progress],
  );
  if (rows.length === 0) return null;

  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.railHeader}>
        <View style={[styles.railTick, { backgroundColor: palette.cyan }]} />
        <Text style={styles.railTitle}>Continue watching</Text>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
        data={rows}
        keyExtractor={(p) => `${p.subject_id}_${p.season_number}_${p.episode_number}`}
        renderItem={({ item }) => {
          const pct = item.duration_seconds > 0 ? Math.min(100, (item.position_seconds / item.duration_seconds) * 100) : 3;
          return (
            <Pressable
              style={styles.resumeCard}
              onPress={() => onOpen(item)}
              accessibilityRole="button"
              accessibilityLabel={`Resume ${item.title}`}
            >
              <Poster uri={item.poster_url} style={StyleSheet.absoluteFill} initials={initialsFor(item.title)} borderRadius={0} />
              <LinearGradient
                colors={cardScrim}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.resumePlay}>
                <Play size={13} color={palette.textPrimary} fill={palette.textPrimary} />
              </View>
              <View style={styles.resumeBarTrack}>
                <View style={[styles.resumeBar, { width: `${pct}%` }]} />
              </View>
              <Text numberOfLines={1} style={styles.resumeTitle}>
                {item.title}
              </Text>
              <Text style={styles.resumeMeta}>
                {item.media_type === "series" && item.season_number ? `S${item.season_number} · E${item.episode_number ?? 1}` : "Movie"}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function RailTile({ item, onPress }: { item: CatalogueItem; onPress: () => void }) {
  const height = Math.round((RAIL_POSTER_W * 3) / 2);
  return (
    <Pressable
      style={styles.railTile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.year ? `, ${item.year}` : ""}`}
    >
      <Poster uri={item.posterUrl} style={{ width: RAIL_POSTER_W, height }} initials={initialsFor(item.name)} fallbackLabel={item.name} />
      <Text numberOfLines={1} style={styles.tileTitle}>
        {item.name}
      </Text>
      <Text style={styles.tileMeta}>
        {[item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  brand: { ...typeScale.title, color: palette.textPrimary, letterSpacing: 3, textTransform: "uppercase", flex: 1 },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    height: 440,
    marginHorizontal: spacing.lg,
    borderRadius: radius.hero,
    overflow: "hidden",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassStroke,
  },
  heroBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.xs },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.cyan },
  heroBadge: { ...typeScale.micro, color: palette.cyan },
  heroContent: { position: "absolute", left: spacing.xl, right: spacing.xl, bottom: spacing.xl, gap: spacing.xs },
  heroTitle: { ...typeScale.hero, color: palette.textPrimary },
  heroMeta: { ...typeScale.caption, color: palette.textSecondary, marginTop: 2 },
  heroActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 12,
    minHeight: 44,
  },
  primaryLabel: { ...typeScale.headline, color: palette.textOnAccent },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: palette.glassFillStrong,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 44,
  },
  secondaryLabel: { ...typeScale.headline, color: palette.textPrimary },
  railHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  railTick: { width: 3, height: 16, borderRadius: 2, backgroundColor: palette.accent },
  railTitle: { ...typeScale.title, color: palette.textPrimary, flex: 1 },
  railCount: { ...typeScale.caption, color: palette.textMuted },
  railTile: { width: RAIL_POSTER_W },
  tileTitle: { color: palette.textPrimary, fontSize: 13, fontWeight: "600", marginTop: spacing.sm },
  tileMeta: { color: palette.textMuted, fontSize: 11, marginTop: 2 },
  resumeCard: {
    width: 156,
    height: 210,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassStroke,
  },
  resumePlay: {
    position: "absolute",
    alignSelf: "center",
    top: 76,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: chrome.scrimSoft,
    borderWidth: 1,
    borderColor: palette.glassStrokeStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  resumeBarTrack: {
    position: "absolute",
    bottom: 36,
    left: spacing.sm,
    right: spacing.sm,
    height: 3,
    borderRadius: 2,
    backgroundColor: chrome.trackDim,
  },
  resumeBar: { height: 3, borderRadius: 2, backgroundColor: palette.cyan },
  resumeTitle: { position: "absolute", bottom: 18, left: spacing.sm, right: spacing.sm, color: palette.textPrimary, fontSize: 12, fontWeight: "700" },
  resumeMeta: { position: "absolute", bottom: 4, left: spacing.sm, color: palette.textSecondary, fontSize: 10 },
});
