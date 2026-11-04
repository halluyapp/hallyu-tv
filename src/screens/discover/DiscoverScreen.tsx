import { Poster, initialsFor } from "@/components/ui/Poster";
import { EmptyState, ErrorState, SkeletonRail } from "@/components/ui/States";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { effects } from "@/hooks/useDeviceTier";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchHome, searchCatalogue } from "@/services/provider/adapter";
import { availableMoods, genresFromSections, tintForGenre, topRated } from "@/services/catalogue/genres";
import { CatalogueItem, HomeSection, ProviderError } from "@/types/provider";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { RefreshCw, Search as SearchIcon, TrendingUp } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { genreWashBlue, genreWashCyan } from "@/design-system/gradients";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Explore — a real discovery destination.
 *
 * Discovery is built from what the provider actually returns:
 *  - Genres are counted from the catalogue, so every tile resolves to content.
 *  - Moods appear only when their genre exists in the catalogue.
 *  - "Top rated" uses real ratings only; no fabricated rankings.
 * Picking a genre opens the Browse results screen (a genuine genre search), not
 * a silently applied query the user cannot see or clear.
 */
export function DiscoverScreen() {
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [results, setResults] = useState<CatalogueItem[] | null>(null);
  const [loadingGenre, setLoadingGenre] = useState(false);
  const [genreError, setGenreError] = useState<string | null>(null);

  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fx = effects();
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    try {
      const data = await fetchHome({ signal: controller.signal });
      if (!controller.signal.aborted) setSections(data);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof ProviderError ? err.message : "Could not load categories.");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const genres = useMemo(() => genresFromSections(sections ?? []), [sections]);
  const moods = useMemo(() => availableMoods(genres), [genres]);
  const top = useMemo(() => {
    const all = (sections ?? []).flatMap((s) => (s.section === "Banner" ? [] : s.items));
    const seen = new Set<string>();
    return topRated(all.filter((i) => (seen.has(i.subjectId) ? false : (seen.add(i.subjectId), true))), 12);
  }, [sections]);

  const openGenre = useCallback(async (genre: string) => {
    setActiveGenre(genre);
    setResults(null);
    setGenreError(null);
    setLoadingGenre(true);
    try {
      const page = await searchCatalogue(genre, 1);
      setResults(page.items);
    } catch (err) {
      setGenreError(err instanceof ProviderError ? err.message : "Could not load this category.");
    } finally {
      setLoadingGenre(false);
    }
  }, []);

  const openDetails = useCallback(
    (item: CatalogueItem) => navigation.navigate("Details", { detailPath: item.slug, subjectId: item.subjectId }),
    [navigation],
  );

  const tileW = Math.floor((width - spacing.xl * 2 - spacing.md * 2) / 3);

  if (activeGenre) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.browseHeader}>
          <Pressable
            onPress={() => {
              setActiveGenre(null);
              setResults(null);
            }}
            style={styles.backChip}
            accessibilityRole="button"
            accessibilityLabel="Back to Explore"
            hitSlop={8}
          >
            <Text style={styles.backChipLabel}>Explore</Text>
          </Pressable>
          <Text style={styles.browseTitle}>{activeGenre}</Text>
        </View>

        {loadingGenre ? (
          <ActivityIndicator style={{ marginTop: spacing.xxl }} color={palette.accent} />
        ) : genreError ? (
          <ErrorState message={genreError} onRetry={() => void openGenre(activeGenre)} />
        ) : results && results.length === 0 ? (
          <EmptyState title="Nothing in this category yet" message={`The catalogue has no ${activeGenre} titles right now.`} />
        ) : (
          <FlatList
            data={results ?? []}
            numColumns={3}
            keyExtractor={(i) => i.subjectId}
            columnWrapperStyle={{ gap: spacing.md }}
            contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 120 }}
            windowSize={fx.listWindow + 2}
            initialNumToRender={fx.listInitial + 3}
            removeClippedSubviews
            renderItem={({ item }) => (
              <Pressable style={{ width: tileW }} onPress={() => openDetails(item)} accessibilityRole="button" accessibilityLabel={item.name}>
                <Poster
                  uri={item.posterUrl}
                  style={{ width: tileW, height: Math.round((tileW * 3) / 2) }}
                  initials={initialsFor(item.name)}
                  fallbackLabel={item.name}
                />
                <Text numberOfLines={2} style={styles.tileTitle}>
                  {item.name}
                </Text>
                <Text style={styles.tileMeta}>{[item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Explore</Text>
        <Pressable
          onPress={() => navigation.navigate("Search")}
          style={styles.searchBtn}
          accessibilityRole="button"
          accessibilityLabel="Open search"
          hitSlop={8}
        >
          <SearchIcon size={19} color={palette.textSecondary} />
        </Pressable>
      </View>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : sections === null ? (
        <View style={{ gap: spacing.xl, marginTop: spacing.lg }}>
          <SkeletonRail count={4} />
          <SkeletonRail count={4} />
        </View>
      ) : (
        <>
          {moods.length > 0 ? (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>Follow a feeling</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {moods.map((mood) => (
                  <Pressable
                    key={mood.label}
                    style={styles.moodChip}
                    onPress={() => void openGenre(mood.genre)}
                    accessibilityRole="button"
                    accessibilityLabel={`Browse ${mood.label} titles`}
                  >
                    <Text style={styles.moodLabel}>{mood.label}</Text>
                    <Text style={styles.moodGenre}>{mood.genre}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {top.length > 0 ? (
            <View style={styles.block}>
              <View style={styles.blockHead}>
                <TrendingUp size={15} color={palette.cyan} />
                <Text style={styles.blockLabel}>Highest rated</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {top.map((item) => (
                  <Pressable
                    key={item.subjectId}
                    style={{ width: 112 }}
                    onPress={() => openDetails(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, rated ${item.rating}`}
                  >
                    <Poster
                      uri={item.posterUrl}
                      style={{ width: 112, height: 168 }}
                      initials={initialsFor(item.name)}
                    />
                    <Text style={styles.ratingBadge}>★ {item.rating}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.block}>
            <Text style={styles.blockLabel}>Genres</Text>
            {genres.length === 0 ? (
              <Text style={styles.muted}>The catalogue did not provide any genres.</Text>
            ) : (
              <View style={styles.genreGrid}>
                {genres.map((g) => {
                  const tint = tintForGenre(g.label);
                  return (
                    <Pressable
                      key={g.label}
                      style={styles.genreTile}
                      onPress={() => void openGenre(g.label)}
                      accessibilityRole="button"
                      accessibilityLabel={`Browse ${g.label}, ${g.count} titles`}
                    >
                      <LinearGradient
                        colors={
                          tint === "cyan" ? genreWashCyan : genreWashBlue
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <Text style={styles.genreLabel}>{g.label}</Text>
                      <Text style={styles.genreCount}>{g.count} titles</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <Pressable style={styles.refreshRow} onPress={() => void load()} accessibilityRole="button">
            <RefreshCw size={14} color={palette.textMuted} />
            <Text style={styles.refreshLabel}>Refresh categories</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  titleRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  title: { ...typeScale.display, color: palette.textPrimary, flex: 1 },
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
  block: { marginBottom: spacing.xl },
  blockHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  blockLabel: { ...typeScale.micro, color: palette.textSecondary, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  chipRow: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  moodChip: {
    backgroundColor: palette.glassFillStrong,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: "center",
  },
  moodLabel: { color: palette.textPrimary, fontSize: 13, fontWeight: "700" },
  moodGenre: { color: palette.textMuted, fontSize: 10, marginTop: 1 },
  ratingBadge: { position: "absolute", bottom: 6, left: 6, color: palette.warning, fontSize: 11, fontWeight: "800" },
  genreGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.xl },
  genreTile: {
    width: "47%",
    flexGrow: 1,
    minHeight: 74,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.glassStroke,
    padding: spacing.lg,
    justifyContent: "center",
    gap: 2,
  },
  genreLabel: { color: palette.textPrimary, fontSize: 15, fontWeight: "700" },
  genreCount: { color: palette.textSecondary, fontSize: 11 },
  muted: { color: palette.textMuted, paddingHorizontal: spacing.xl, fontSize: 13 },
  refreshRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  refreshLabel: { color: palette.textMuted, fontSize: 12 },
  browseHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  backChip: {
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  backChipLabel: { color: palette.accentBright, fontSize: 12, fontWeight: "700" },
  browseTitle: { ...typeScale.title, color: palette.textPrimary, flex: 1 },
  tileTitle: { color: palette.textPrimary, fontSize: 13, fontWeight: "600", marginTop: spacing.sm },
  tileMeta: { color: palette.textMuted, fontSize: 11, marginTop: 2 },
});
