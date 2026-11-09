import { PosterCard } from "@/components/ui/PosterCard";
import { EmptyState, ErrorState, SkeletonRail } from "@/components/ui/States";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { gradients, palette, radius, spacing } from "@/design-system/tokens";
import { useCatalogueBrowser, type ContentType } from "@/hooks/useCatalogueBrowser";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList, TabParamList } from "@/navigation/RootNavigator";
import { BROWSE_WORLDS } from "@/services/catalogue/worlds";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Search as SearchIcon, X } from "lucide-react-native";
import React, { useEffect } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList> & BottomTabNavigationProp<TabParamList, "Discover">;

const WORLD_CHIPS = BROWSE_WORLDS.filter((world) => world.key !== "shorts");

const TYPES: { key: ContentType; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "movie", label: "Movies" },
  { key: "series", label: "Series" },
];

/**
 * Explore — real category browsing plus title search.
 *
 * A world or genre chip filters the catalogue by metadata; it is never sent to
 * the provider's title-search endpoint. Search and browsing stay separate, and
 * both combine with the type filter.
 */
export function DiscoverScreen() {
  const stage = useStage();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<TabParamList, "Discover">>();
  const browser = useCatalogueBrowser();

  const { setWorld, setGenre } = browser;

  // Deep links from Home ("See all", world chips) drive the filters.
  useEffect(() => {
    const params = route.params;
    if (!params) return;
    if (params.world) setWorld(params.world);
    if (params.genre !== undefined) setGenre(params.genre ?? null);
  }, [route.params, setWorld, setGenre]);

  const columns = stage.tier === "compact" ? 3 : stage.tier === "regular" ? 4 : 5;
  const cardWidth =
    stage.tier === "stage"
      ? stage.posterWidth
      : Math.round((stage.width - stage.gutter * 2 - spacing.md * (columns - 1)) / columns);

  const genres = browser.snapshot?.genres ?? [];
  const empty = !browser.loading && !browser.searching && browser.items.length === 0;

  const header = (
    <View>
      <View style={[styles.header, { paddingHorizontal: stage.gutter }]}>
        <View style={styles.searchBar}>
          <SearchIcon size={18} color={palette.textSecondary} />
          <TextInput
            value={browser.query}
            onChangeText={browser.setQuery}
            placeholder="Search films, series, genres…"
            placeholderTextColor={palette.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search titles"
          />
          {browser.query.length > 0 ? (
            <Pressable onPress={() => browser.setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
              <X size={18} color={palette.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.chipsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: stage.gutter, gap: 8 }}
        >
          {WORLD_CHIPS.map((world) => {
            const active = browser.filters.world === world.key;
            return (
              <Pressable
                key={world.key}
                onPress={() => setWorld(world.key)}
                style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                {active ? (
                  <LinearGradient
                    colors={gradients.accent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                ) : null}
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{world.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {genres.length > 0 ? (
        <View style={styles.genreContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: stage.gutter, gap: 8 }}
          >
            <Pressable
              onPress={() => setGenre(null)}
              style={[styles.genrePill, browser.filters.genre === null && styles.genrePillActive]}
            >
              <Text style={[styles.genreLabel, browser.filters.genre === null && styles.genreLabelActive]}>
                All genres
              </Text>
            </Pressable>
            {genres.map((genre) => {
              const active = browser.filters.genre === genre;
              return (
                <Pressable
                  key={genre}
                  onPress={() => setGenre(active ? null : genre)}
                  style={[styles.genrePill, active && styles.genrePillActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.genreLabel, active && styles.genreLabelActive]}>{genre}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={[styles.typeRow, { paddingHorizontal: stage.gutter }]}>
        {TYPES.map((entry) => {
          const active = browser.filters.type === entry.key;
          return (
            <Pressable
              key={entry.key}
              onPress={() => browser.setType(entry.key)}
              style={[styles.typeChip, active && styles.typeChipActive]}
            >
              <Text style={[styles.typeLabel, active && styles.pillLabelActive]}>{entry.label}</Text>
            </Pressable>
          );
        })}
        <Text style={styles.count}>
          {browser.loading || browser.searching ? "Loading…" : `${browser.total} titles`}
        </Text>
        {browser.filtersActive ? (
          <Pressable onPress={browser.reset} style={styles.reset} accessibilityRole="button">
            <X size={12} color={palette.accent} />
            <Text style={styles.resetLabel}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (browser.error && !browser.snapshot) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <AmbientGlow />
        <ErrorState message={browser.error} onRetry={() => void browser.refresh()} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xs }]}>
      <AmbientGlow />

      <FlatList
        key={`explore-${columns}`}
        data={browser.items}
        numColumns={columns}
        keyExtractor={(item) => item.subjectId}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.grid, { paddingHorizontal: stage.gutter }]}
        columnWrapperStyle={{ gap: spacing.md, marginBottom: spacing.md }}
        onEndReached={() => void browser.loadMore()}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <PosterCard
            item={item}
            width={cardWidth}
            onPress={() => navigation.navigate("Details", { detailPath: item.slug, subjectId: item.subjectId })}
          />
        )}
        ListEmptyComponent={
          browser.loading || browser.searching ? (
            <SkeletonRail count={6} itemWidth={cardWidth} />
          ) : empty ? (
            <EmptyState
              title={browser.searchMode ? "No titles found" : "Nothing here yet"}
              message={
                browser.searchMode
                  ? `Nothing matched “${browser.query.trim()}” with these filters. Try clearing them.`
                  : "This collection is empty right now. Another world is a tap away."
              }
            />
          ) : null
        }
        ListFooterComponent={
          browser.loadingMore ? (
            <View style={{ paddingVertical: spacing.lg, alignItems: "center" }}>
              <ActivityIndicator color={palette.accent} size="small" />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: { paddingVertical: spacing.sm },
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
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 15, fontWeight: "500" },
  chipsContainer: { paddingVertical: spacing.sm },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  pillInactive: { backgroundColor: palette.glassFillStrong, borderColor: palette.glassStroke },
  pillActive: { borderColor: palette.accentBright },
  pillLabel: { color: palette.textSecondary, fontSize: 13, fontWeight: "600" },
  pillLabelActive: { color: "#FFFFFF", fontWeight: "700" },
  genreContainer: { paddingBottom: spacing.sm },
  genrePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glassStroke,
  },
  genrePillActive: { backgroundColor: palette.accentBright, borderColor: palette.accentBright },
  genreLabel: { color: palette.textMuted, fontSize: 12, fontWeight: "600" },
  genreLabelActive: { color: "#1A0E0A", fontWeight: "700" },
  typeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.sm },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.glassFillStrong,
  },
  typeChipActive: { backgroundColor: palette.accent },
  typeLabel: { color: palette.textSecondary, fontSize: 11.5, fontWeight: "700" },
  count: { color: palette.textMuted, fontSize: 11, marginLeft: "auto" },
  reset: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  resetLabel: { color: palette.accent, fontSize: 11.5, fontWeight: "700" },
  grid: { paddingTop: spacing.sm, paddingBottom: 110 },
});
