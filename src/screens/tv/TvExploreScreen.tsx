import { EmptyState } from "@/components/ui/States";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { palette, radius, spacing } from "@/design-system/tokens";
import { useCatalogueBrowser, type ContentType } from "@/hooks/useCatalogueBrowser";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { BROWSE_WORLDS } from "@/services/catalogue/worlds";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronLeft, Search } from "lucide-react-native";
import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WORLD_CHIPS = BROWSE_WORLDS.filter((world) => world.key !== "shorts");

const TYPES: { key: ContentType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "movie", label: "Movies" },
  { key: "series", label: "Series" },
];

/**
 * TvExploreScreen — the 10-foot catalogue.
 *
 * Same shared catalogue service and filters as mobile Explore: the remote moves
 * across world chips, genre chips and the poster grid. Search is the provider's
 * title index; chips only ever filter metadata.
 */
export function TvExploreScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const stage = useStage();
  const browser = useCatalogueBrowser();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const columns = stage.tier === "stage" ? 5 : 3;
  const cardWidth =
    stage.tier === "stage"
      ? stage.posterWidth
      : Math.round((stage.width - stage.gutter * 2 - stage.cardGap * (columns - 1)) / columns);
  const posterHeight = Math.round(cardWidth * 1.5);
  const genres = browser.snapshot?.genres ?? [];

  const header = (
    <View style={{ paddingTop: insets.top }}>
      <View style={[styles.header, { paddingHorizontal: stage.gutter, gap: stage.cardGap }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={[
            styles.backBtn,
            { width: stage.controlSize, height: stage.controlSize, borderRadius: stage.controlSize / 2 },
          ]}
          hasTVPreferredFocus
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={24} color={palette.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { fontSize: stage.titleSize }]}>Explore</Text>
        <View style={[styles.inputWrap, { height: stage.controlSize, paddingHorizontal: stage.cardGap, flex: 1 }]}>
          <Search size={18} color={palette.textMuted} />
          <TextInput
            value={browser.query}
            onChangeText={browser.setQuery}
            placeholder="Search titles…"
            placeholderTextColor={palette.textMuted}
            style={[styles.input, { fontSize: stage.bodySize }]}
            returnKeyType="search"
            accessibilityLabel="Search titles"
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: stage.gutter, gap: stage.cardGap * 0.8, paddingVertical: spacing.sm }}
      >
        {WORLD_CHIPS.map((world) => {
          const active = browser.filters.world === world.key;
          return (
            <Pressable
              key={world.key}
              onPress={() => browser.setWorld(world.key)}
              style={[styles.chip, { paddingHorizontal: stage.cardGap }, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipLabel, { fontSize: stage.metaSize }, active && styles.chipLabelActive]}>
                {world.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: stage.gutter, gap: stage.cardGap * 0.8, paddingBottom: spacing.sm }}
      >
        <Pressable
          onPress={() => browser.setGenre(null)}
          style={[styles.genreChip, browser.filters.genre === null && styles.genreChipActive]}
        >
          <Text style={[styles.genreLabel, { fontSize: stage.metaSize }, browser.filters.genre === null && styles.chipLabelActive]}>
            All genres
          </Text>
        </Pressable>
        {genres.map((genre) => {
          const active = browser.filters.genre === genre;
          return (
            <Pressable
              key={genre}
              onPress={() => browser.setGenre(active ? null : genre)}
              style={[styles.genreChip, active && styles.genreChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.genreLabel, { fontSize: stage.metaSize }, active && styles.chipLabelActive]}>
                {genre}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.typeRow, { paddingHorizontal: stage.gutter, marginBottom: stage.cardGap }]}>
        {TYPES.map((entry) => {
          const active = browser.filters.type === entry.key;
          return (
            <Pressable
              key={entry.key}
              onPress={() => browser.setType(entry.key)}
              style={[styles.typeChip, active && styles.typeChipActive]}
            >
              <Text style={[styles.typeLabel, { fontSize: stage.metaSize }, active && styles.chipLabelActive]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
        <Text style={[styles.count, { fontSize: stage.metaSize }]}>
          {browser.loading || browser.searching ? "Loading…" : `${browser.total} titles`}
        </Text>
        {browser.filtersActive ? (
          <Pressable onPress={browser.reset} style={styles.reset}>
            <Text style={[styles.resetLabel, { fontSize: stage.metaSize }]}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        key={`tv-explore-${columns}`}
        data={browser.items}
        numColumns={columns}
        keyExtractor={(item) => item.subjectId}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: stage.gutter * 2 }}
        onEndReached={() => void browser.loadMore()}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const focused = focusedId === item.subjectId;
          return (
            <Pressable
              onPress={() => navigation.navigate("Details", { detailPath: item.slug, subjectId: item.subjectId })}
              onFocus={() => setFocusedId(item.subjectId)}
              onBlur={() => setFocusedId((current) => (current === item.subjectId ? null : current))}
              style={[
                styles.card,
                { width: cardWidth, margin: stage.cardGap / 2 },
                focused && styles.cardFocused,
              ]}
              accessibilityRole="button"
              accessibilityLabel={item.displayName ?? item.name}
            >
              <Poster
                uri={item.posterUrl}
                style={{ width: cardWidth, height: posterHeight }}
                initials={initialsFor(item.displayName ?? item.name)}
              />
              <Text numberOfLines={2} style={[styles.cardTitle, { fontSize: stage.cardTitleSize }]}>
                {item.displayName ?? item.name}
              </Text>
              <Text style={[styles.cardMeta, { fontSize: stage.metaSize }]}>
                {[item.year, item.mediaType === "series" ? "Series" : "Movie", item.country]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          browser.loading || browser.searching ? (
            <ActivityIndicator style={{ marginTop: spacing.xxl }} size="large" color={palette.accent} />
          ) : (
            <EmptyState
              title={browser.searchMode ? "No matches" : "Nothing here yet"}
              message={
                browser.searchMode
                  ? "No title matched with these filters. Press Back and try another world."
                  : "This collection is empty right now."
              }
            />
          )
        }
        ListFooterComponent={
          browser.loadingMore ? (
            <ActivityIndicator style={{ marginTop: spacing.lg }} color={palette.accent} />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  backBtn: {
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: palette.textPrimary, fontWeight: "800", letterSpacing: -0.4 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
  },
  input: { flex: 1, color: palette.textPrimary, paddingVertical: 0 },
  chip: {
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipLabel: { color: palette.textSecondary, fontWeight: "700" },
  chipLabelActive: { color: "#1A0E0A" },
  genreChip: {
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  genreChipActive: { backgroundColor: palette.accentBright, borderColor: palette.accentBright },
  genreLabel: { color: palette.textMuted, fontWeight: "600" },
  typeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  typeChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: palette.glassFillStrong },
  typeChipActive: { backgroundColor: palette.accent },
  typeLabel: { color: palette.textSecondary, fontWeight: "700" },
  count: { color: palette.textMuted, marginLeft: "auto" },
  reset: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  resetLabel: { color: palette.accent, fontWeight: "700" },
  card: { borderRadius: radius.md, overflow: "hidden", backgroundColor: palette.surface },
  cardFocused: {
    borderWidth: 2,
    borderColor: palette.accent,
    transform: [{ scale: 1.04 }],
  },
  cardTitle: { color: palette.textPrimary, fontWeight: "600", padding: spacing.sm, paddingBottom: 0 },
  cardMeta: { color: palette.textMuted, padding: spacing.sm, paddingTop: 2 },
});
