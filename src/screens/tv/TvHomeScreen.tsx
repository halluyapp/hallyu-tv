import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { TvTile } from "@/components/tv/TvTile";
import { palette, radius, spacing, tvSafeArea, tvTypeScale } from "@/design-system/tokens";
import { effects } from "@/hooks/useDeviceTier";
import { APP_NAME } from "@/config/branding";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchHome, resolveStreams } from "@/services/provider/adapter";
import { isResumable } from "@/services/library/resume";
import { selectSource } from "@/services/provider/streams";
import { useSound } from "@/services/sound/SoundContext";
import { useLibrary, type ProgressRow } from "@/state/LibraryContext";
import { CatalogueItem, HomeSection, ProviderError } from "@/types/provider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Download, Home as HomeIcon, RefreshCw, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { chrome, heroScrimSoft, heroScrimSoftPositions } from "@/design-system/gradients";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TILE_W = 232;
const PITCH = TILE_W + spacing.xl;
const RAIL_H = Math.round((TILE_W * 3) / 2) + 46;

/**
 * The 10-foot home.
 *
 * Cinematic hero, virtualised shelves, a spatial side rail, and explicit focus
 * management. Focus state lives here (not per tile) so returning from Details
 * can restore the exact row and index the user left — losing focus is the most
 * disorienting thing that can happen on a TV.
 */
export function TvHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { progress } = useLibrary();
  const { play: playTone } = useSound();
  const fx = effects();
  const [resumingId, setResumingId] = useState<string | null>(null);

  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [navFocus, setNavFocus] = useState<string | null>("home");
  const [heroFocus, setHeroFocus] = useState(false);

  // Which shelf/tile the user last focused — used to restore focus on return.
  const [focused, setFocused] = useState<{ row: string; index: number } | null>(null);
  const rowRefs = useRef(new Map<string, FlatList<CatalogueItem | ProgressRow> | null>());
  const heroOpacity = useRef(new Animated.Value(1)).current;

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadError(null);
    try {
      const data = await fetchHome({ signal: controller.signal });
      if (!controller.signal.aborted) setSections(data);
    } catch (err) {
      if (controller.signal.aborted) return;
      setLoadError(err instanceof ProviderError ? err.message : "The catalogue could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const open = useCallback(
    (detailPath: string, subjectId: string) => {
      Animated.timing(heroOpacity, { toValue: 0.4, duration: 140, useNativeDriver: true }).start();
      navigation.navigate("Details", { detailPath, subjectId });
    },
    [navigation, heroOpacity],
  );

  // Return the hero to full brightness when we come back to this screen.
  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      Animated.timing(heroOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
    return unsub;
  }, [navigation, heroOpacity]);

  const hero = sections?.find((s) => s.section === "Banner")?.items[0] ?? sections?.[0]?.items[0] ?? null;
  const rails = (sections ?? []).filter((s) => s.items.length > 0 && s.section !== "Banner");
  // Shared resumable rule, and a slug is required to re-resolve streams.
  const resume = progress.filter((p) => isResumable(p) && Boolean(p.detail_path)).slice(0, 20);

  /**
   * Continue watching must continue watching. On a remote, opening a details
   * screen and then hunting for the resume button is the worst possible path, so
   * the tile resolves the stream and drops straight into the player at the saved
   * position; any failure falls back to Details, which can explain itself.
   */
  const resumeRow = useCallback(
    async (row: ProgressRow) => {
      if (!row.detail_path || resumingId) return;
      setResumingId(row.subject_id);
      try {
        const se = row.season_number ?? 0;
        const ep = row.episode_number ?? 0;
        const res = await resolveStreams(row.subject_id, row.detail_path, se, ep);
        const picked = selectSource(res.sources, null);
        if (!picked) throw new Error("empty");
        playTone("play");
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
        playTone("error");
        navigation.navigate("Details", { detailPath: row.detail_path, subjectId: row.subject_id });
      } finally {
        setResumingId(null);
      }
    },
    [navigation, playTone, resumingId],
  );

  const goSearch = useCallback(() => navigation.navigate("TvSearch"), [navigation]);
  const goDownloads = useCallback(() => navigation.navigate("TvDownloads"), [navigation]);

  const navItems = [
    { key: "home", label: "Home", icon: HomeIcon, onPress: () => {} },
    { key: "search", label: "Search", icon: Search, onPress: goSearch },
    { key: "downloads", label: "Downloads", icon: Download, onPress: goDownloads },
  ];

  const onTileFocus = useCallback((row: string, index: number) => {
    setFocused({ row, index });
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.bodyRow}>
        {/* Spatial side rail */}
        <View style={styles.sideRail}>
          <Text style={styles.brand}>{APP_NAME.toUpperCase()}</Text>
          <Text style={styles.tagline}>Cinema at ten feet</Text>
          <View style={styles.railNav}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = navFocus === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={item.onPress}
                  onFocus={() => setNavFocus(item.key)}
                  onBlur={() => setNavFocus(null)}
                  hasTVPreferredFocus={item.key === "home" && focused === null}
                  focusable
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  style={[styles.railBtn, active && styles.railBtnActive]}
                >
                  <Icon size={22} color={active ? palette.textOnAccent : palette.textSecondary} />
                  <Text style={[styles.railBtnLabel, active && styles.railBtnLabelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.huge, paddingTop: spacetop() }}
          style={styles.content}
        >
          {hero ? (
            <Animated.View style={{ opacity: heroOpacity }}>
              <Pressable
                onPress={() => open(hero.slug, hero.subjectId)}
                onFocus={() => setHeroFocus(true)}
                onBlur={() => setHeroFocus(false)}
                hasTVPreferredFocus={focused === null}
                focusable
                accessibilityRole="button"
                accessibilityLabel={`Featured: ${hero.name}. Press select for details.`}
                style={[styles.hero, heroFocus && styles.heroFocused]}
              >
                <Poster uri={hero.posterUrl} style={StyleSheet.absoluteFill} initials={initialsFor(hero.name)} priority="high" />
                <AmbientGlow />
                <LinearGradient
                  colors={heroScrimSoft}
                  locations={heroScrimSoftPositions}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroContent}>
                  <Text style={styles.heroBadge}>FEATURED</Text>
                  <Text numberOfLines={2} style={styles.heroTitle}>
                    {hero.name}
                  </Text>
                  <Text style={styles.heroMeta}>
                    {[hero.year, hero.genre?.split(",")[0], hero.rating && `★ ${hero.rating}`].filter(Boolean).join("   ·   ")}
                  </Text>
                  <View style={styles.heroCta}>
                    <Text style={styles.heroCtaLabel}>Open details</Text>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          ) : null}

          {resume.length > 0 ? (
            <Rail
              rowKey="resume"
              label="Continue watching"
              data={resume}
              getKey={(p) => `${p.subject_id}_${p.season_number ?? 0}_${p.episode_number ?? 0}`}
              posterOf={(p) => p.poster_url}
              titleOf={(p) => p.title}
              metaOf={(p) => (p.media_type === "series" ? `S${p.season_number ?? 1} E${p.episode_number ?? 1}` : "Movie")}
              progressOf={(p) => (p.duration_seconds > 0 ? p.position_seconds / p.duration_seconds : null)}
              onOpen={(p) => void resumeRow(p)}
              focusedIndex={focused?.row === "resume" ? focused.index : null}
              onFocusIndex={(i) => onTileFocus("resume", i)}
              rowRefs={rowRefs}
              windowSize={fx.listWindow}
            />
          ) : null}

          {rails.map((s) => (
            <Rail
              key={s.section}
              rowKey={s.section}
              label={sectionLabel(s.section)}
              data={s.items}
              getKey={(i) => `${i.subjectId}_${i.slug}`}
              posterOf={(i) => i.posterUrl}
              titleOf={(i) => i.name}
              metaOf={(i) => [i.year, i.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}
              progressOf={() => null}
              onOpen={(i) => open(i.slug, i.subjectId)}
              focusedIndex={focused?.row === s.section ? focused.index : null}
              onFocusIndex={(i) => onTileFocus(s.section, i)}
              rowRefs={rowRefs}
              windowSize={fx.listWindow}
            />
          ))}

          {loadError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>{loadError}</Text>
              <Pressable
                onPress={() => void load()}
                style={styles.retryBtn}
                accessibilityRole="button"
                accessibilityLabel="Retry loading the catalogue"
              >
                <RefreshCw size={18} color={palette.textPrimary} />
                <Text style={styles.retryLabel}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!sections && !loadError ? <ActivityIndicator style={{ marginTop: spacing.xxl }} size="large" color={palette.accent} /> : null}
        </ScrollView>
      </View>
    </View>
  );
}

/** Overscan-safe top inset for the content column. */
function spacetop(): number {
  return tvSafeArea.vertical + spacing.sm;
}

function sectionLabel(raw: string): string {
  const cleaned = raw.replace(/[_-]+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

interface RailProps<T extends CatalogueItem | ProgressRow> {
  rowKey: string;
  label: string;
  data: T[];
  getKey: (item: T) => string;
  posterOf: (item: T) => string | null;
  titleOf: (item: T) => string;
  metaOf: (item: T) => string | null;
  progressOf: (item: T) => number | null;
  onOpen: (item: T) => void;
  focusedIndex: number | null;
  onFocusIndex: (index: number) => void;
  rowRefs: React.MutableRefObject<Map<string, FlatList<CatalogueItem | ProgressRow> | null>>;
  windowSize: number;
}

/**
 * One virtualised shelf. The focused tile is always scrolled fully into view —
 * on a television it is unacceptable for focus to leave the screen edge.
 */
function Rail<T extends CatalogueItem | ProgressRow>({
  rowKey,
  label,
  data,
  getKey,
  posterOf,
  titleOf,
  metaOf,
  progressOf,
  onOpen,
  focusedIndex,
  onFocusIndex,
  rowRefs,
  windowSize,
}: RailProps<T>) {
  const listRef = useRef<FlatList<CatalogueItem | ProgressRow> | null>(null);

  useEffect(() => {
    rowRefs.current.set(rowKey, listRef.current);
    return () => {
      rowRefs.current.delete(rowKey);
    };
  }, [rowKey, rowRefs]);

  const handleFocus = useCallback(
    (index: number) => {
      onFocusIndex(index);
      if (index >= 1) {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.35 });
      }
    },
    [onFocusIndex],
  );

  return (
    <View style={styles.railBlock}>
      <Text style={styles.rowLabel}>{label}</Text>
      <FlatList
        ref={listRef as React.RefObject<FlatList<CatalogueItem | ProgressRow>>}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        data={data as (CatalogueItem | ProgressRow)[]}
        keyExtractor={(item) => getKey(item as T)}
        getItemLayout={(_, index) => ({ length: PITCH, offset: PITCH * index, index })}
        windowSize={windowSize}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        removeClippedSubviews
        style={{ height: RAIL_H }}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: Math.max(0, info.index * PITCH - TILE_W), animated: true });
        }}
        renderItem={({ item, index }) => {
          const typed = item as T;
          return (
            <TvTile
              title={titleOf(typed)}
              posterUrl={posterOf(typed)}
              initials={initialsFor(titleOf(typed))}
              meta={metaOf(typed)}
              progress={progressOf(typed)}
              onPress={() => onOpen(typed)}
              onFocus={() => handleFocus(index)}
              hasPreferredFocus={focusedIndex === index && false}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  bodyRow: { flex: 1, flexDirection: "row" },
  sideRail: {
    width: 260,
    paddingTop: tvSafeArea.vertical + spacing.xl,
    paddingHorizontal: spacing.xl,
    borderRightWidth: 1,
    borderRightColor: chrome.hairline,
    backgroundColor: chrome.panelTint,
  },
  brand: { ...tvTypeScale.title, color: palette.accentBright, letterSpacing: 5, fontSize: 26 },
  tagline: { ...tvTypeScale.caption, color: palette.textMuted, marginTop: 4, marginBottom: spacing.xxl },
  railNav: { gap: spacing.md },
  railBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 3,
    borderColor: "transparent",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    minHeight: 56,
  },
  railBtnActive: { borderColor: palette.cyan, backgroundColor: palette.accentSoft },
  railBtnLabel: { ...tvTypeScale.body, color: palette.textSecondary, fontWeight: "600" },
  railBtnLabelActive: { color: palette.textOnAccent },
  content: { flex: 1 },
  hero: {
    marginHorizontal: tvSafeArea.horizontal,
    marginBottom: spacing.xl,
    borderRadius: radius.hero,
    overflow: "hidden",
    backgroundColor: palette.surface,
    height: 360,
    borderWidth: 3,
    borderColor: "transparent",
  },
  heroFocused: { borderColor: palette.cyan },
  heroContent: { position: "absolute", left: spacing.xxl, bottom: spacing.xxl, right: spacing.xxl, gap: spacing.sm },
  heroBadge: { ...tvTypeScale.micro, color: palette.cyan },
  heroTitle: { ...tvTypeScale.hero, color: palette.textPrimary },
  heroMeta: { ...tvTypeScale.caption, color: palette.textSecondary },
  heroCta: {
    alignSelf: "flex-start",
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  heroCtaLabel: { ...tvTypeScale.body, color: palette.textOnAccent, fontWeight: "700" },
  railBlock: { marginBottom: spacing.xl },
  rowLabel: { ...tvTypeScale.headline, color: palette.textPrimary, paddingHorizontal: tvSafeArea.horizontal, marginBottom: spacing.md },
  row: { paddingHorizontal: tvSafeArea.horizontal, gap: spacing.xl, alignItems: "flex-start" },
  errorBox: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.md },
  errorTitle: { ...tvTypeScale.body, color: palette.danger, textAlign: "center" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    backgroundColor: palette.glassFill,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryLabel: { ...tvTypeScale.body, color: palette.textPrimary, fontWeight: "700" },
});
