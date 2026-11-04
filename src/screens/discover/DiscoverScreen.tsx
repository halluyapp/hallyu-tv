import { PosterCard } from "@/components/ui/PosterCard";
import { EmptyState, ErrorState, SkeletonRail } from "@/components/ui/States";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { palette, radius, spacing, gradients } from "@/design-system/tokens";
import { CatalogueItem, HomeSection, ProviderError } from "@/types/provider";
import { fetchHome, searchCatalogue } from "@/services/provider/adapter";
import { useNavigation } from "@react-navigation/native";
import { useStage } from "@/hooks/useStage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search as SearchIcon, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList } from "@/navigation/RootNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MOODS: { label: string; query: string }[] = [
  { label: "Trending", query: "Trending" },
  { label: "Adrenaline", query: "Action" },
  { label: "Slow Burn", query: "Drama" },
  { label: "Mind-Bending", query: "Sci-Fi" },
  { label: "Feel-Good", query: "Comedy" },
  { label: "Late Night", query: "Thriller" },
  { label: "Romantic", query: "Romance" },
  { label: "Animation", query: "Anime" },
];

export function DiscoverScreen() {
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [results, setResults] = useState<CatalogueItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, loadingMore: false });
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const stage = useStage();
  const inputRef = useRef<TextInput>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const columns = stage.tier === "compact" ? 3 : stage.tier === "regular" ? 4 : 5;
  const cardWidth =
    stage.tier === "stage"
      ? stage.posterWidth
      : Math.round((stage.width - stage.gutter * 2 - spacing.md * (columns - 1)) / columns);

  useEffect(() => {
    fetchHome()
      .then(setSections)
      .catch((err) => setError(err instanceof ProviderError ? err.message : "Could not load categories."));
  }, []);

  const runSearch = useCallback(async (q: string, pageNum = 1) => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const page = await searchCatalogue(term, pageNum);
      setResults((prev) => (pageNum === 1 ? page.items : [...(prev ?? []), ...page.items]));
      setPagination({ page: page.page, totalPages: page.totalPages, loadingMore: false });
    } catch {
      setResults(pageNum === 1 ? [] : results);
    } finally {
      setSearching(false);
    }
  }, [results]);

  const onQueryChange = (text: string) => {
    setQuery(text);
    setSelectedMood(null);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void runSearch(text, 1), 400);
  };

  const clearSearch = () => {
    setQuery("");
    setSelectedMood(null);
    setResults(null);
  };

  const onPickMood = (mood: { label: string; query: string }) => {
    if (selectedMood === mood.label) {
      setSelectedMood(null);
      setResults(null);
      return;
    }
    setSelectedMood(mood.label);
    setQuery("");
    void runSearch(mood.query, 1);
  };

  const loadMore = () => {
    if (searching || pagination.loadingMore || pagination.page >= pagination.totalPages) return;
    const term = (query || selectedMood || "").trim();
    if (!term) return;
    setPagination((prev) => ({ ...prev, loadingMore: true }));
    void runSearch(term, pagination.page + 1);
  };

  const openDetails = (slug: string, subjectId: string) => {
    navigation.navigate("Details", { detailPath: slug, subjectId });
  };

  const catalogueItems = useMemo(() => {
    if (results !== null) return results;
    if (!sections) return [];
    const pool = sections.flatMap((s) => s.items);
    const seen = new Set<string>();
    return pool.filter((it) => (seen.has(it.subjectId) ? false : (seen.add(it.subjectId), true)));
  }, [results, sections]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xs }]}>
      <AmbientGlow />

      {/* Spatial Liquid Search Header */}
      <View style={[styles.header, { paddingHorizontal: stage.gutter }]}>
        <View style={styles.searchBar}>
          <SearchIcon size={18} color={palette.textSecondary} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search films, series, genres..."
            placeholderTextColor={palette.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searching ? (
            <ActivityIndicator size="small" color={palette.accent} />
          ) : query.length > 0 ? (
            <Pressable onPress={clearSearch} hitSlop={10}>
              <X size={18} color={palette.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Horizontally scrollable Mood / Genre Liquid Pills */}
      <View style={styles.moodsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: stage.gutter, gap: 8 }}
        >
          {MOODS.map((m) => {
            const isActive = selectedMood === m.label;
            return (
              <Pressable
                key={m.label}
                onPress={() => onPickMood(m)}
                style={[
                  styles.moodPill,
                  isActive ? styles.moodPillActive : styles.moodPillInactive,
                ]}
              >
                {isActive && (
                  <LinearGradient
                    colors={gradients.accent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                )}
                <Text style={[styles.moodLabel, isActive && styles.moodLabelActive]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Grid of Results / Catalogue */}
      {error && !sections ? (
        <ErrorState message={error} onRetry={() => void fetchHome().then(setSections)} />
      ) : (
        <FlatList
          data={catalogueItems}
          keyExtractor={(item) => item.subjectId}
          numColumns={columns}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.grid, { paddingHorizontal: stage.gutter, paddingBottom: 110 }]}
          columnWrapperStyle={{ gap: spacing.md, marginBottom: spacing.md }}
          renderItem={({ item }) => (
            <PosterCard item={item} width={cardWidth} onPress={() => openDetails(item.slug, item.subjectId)} />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            searching ? (
              <SkeletonRail count={6} itemWidth={cardWidth} />
            ) : results !== null && results.length === 0 ? (
              <EmptyState
                title="No titles found"
                message={`We couldn't find any films matching "${query || selectedMood}". Try another keyword or category.`}
              />
            ) : null
          }
          ListFooterComponent={
            pagination.loadingMore ? (
              <View style={{ paddingVertical: spacing.lg, alignItems: "center" }}>
                <ActivityIndicator color={palette.accent} size="small" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    paddingVertical: spacing.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surfaceGlass,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    height: 50,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  moodsContainer: {
    paddingVertical: spacing.sm,
  },
  moodPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  moodPillInactive: {
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStroke,
  },
  moodPillActive: {
    borderColor: palette.accentBright,
  },
  moodLabel: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  moodLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  grid: {
    paddingTop: spacing.sm,
  },
});
