import { palette, radius, spacing } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { searchCatalogue } from "@/services/provider/adapter";
import { CatalogueItem } from "@/types/provider";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TvSearchScreen() {
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogueItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [backFocused, setBackFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stage = useStage();
  const columns = stage.tier === "stage" ? 5 : 3;
  const cardWidth =
    stage.tier === "stage"
      ? stage.posterWidth
      : Math.round((stage.width - stage.gutter * 2 - stage.cardGap * 2) / 3);
  const posterHeight = Math.round(cardWidth * 1.4);

  const run = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const page = await searchCatalogue(q.trim(), 1);
      setResults(page.items);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void run(query), 450);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, run]);

  return (
    <View style={styles.root}>
      <AmbientGlow />

      <View style={[styles.header, { paddingHorizontal: stage.gutter, paddingTop: stage.gutter }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
          style={[styles.backBtn, backFocused && styles.backBtnFocused]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={22} color="#FFFFFF" />
        </Pressable>

        <View style={styles.inputWrap}>
          <Search size={20} color={palette.textSecondary} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search on TV..."
            placeholderTextColor={palette.textMuted}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>
      </View>

      {loading ? (
        <View style={{ marginTop: spacing.xxl, alignItems: "center" }}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : null}

      {results !== null && !loading ? (
        results.length === 0 ? (
          <Text style={[styles.empty, { paddingHorizontal: stage.gutter }]}>Nothing matched “{query}”.</Text>
        ) : (
          <FlatList
            key={`grid-${columns}`}
            data={results}
            numColumns={columns}
            keyExtractor={(item) => `${item.subjectId}_${item.slug}`}
            contentContainerStyle={[styles.grid, { paddingHorizontal: stage.gutter, gap: stage.cardGap }]}
            showsVerticalScrollIndicator={false}
            windowSize={7}
            initialNumToRender={columns * 3}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => navigation.navigate("Details", { detailPath: item.slug, subjectId: item.subjectId })}
                onFocus={() => setFocusedIdx(index)}
                onBlur={() => setFocusedIdx(null)}
                style={[styles.card, { width: cardWidth }, focusedIdx === index && styles.cardFocused]}
              >
                <Poster
                  uri={item.posterUrl}
                  style={[styles.poster, { width: cardWidth, height: posterHeight }]}
                  initials={initialsFor(item.name)}
                />
                <Text style={[styles.cardTitle, { fontSize: stage.cardTitleSize }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.cardMeta, { fontSize: stage.metaSize }]}>
                  {[item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}
                </Text>
              </Pressable>
            )}
          />
        )
      ) : null}

      {results === null && !loading ? (
        <Text style={[styles.hint, { paddingHorizontal: stage.gutter }]}>Type at least two letters using the keyboard.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.glassFillStrong,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnFocused: {
    borderColor: palette.accentBright,
    backgroundColor: "rgba(255, 94, 58, 0.2)",
    transform: [{ scale: 1.08 }],
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.surfaceGlass,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  input: { flex: 1, color: "#FFFFFF", fontSize: 16, paddingVertical: 0 },
  grid: { gap: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: palette.surfaceGlass,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
  },
  cardFocused: {
    transform: [{ scale: 1.06 }],
    borderColor: palette.accentBright,
    shadowColor: palette.accent,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 10,
  },
  poster: { borderRadius: radius.sm },
  cardTitle: { color: "#FFFFFF", fontWeight: "600", paddingHorizontal: 4, marginTop: 6 },
  cardMeta: { color: palette.textMuted, paddingHorizontal: 4, marginTop: 2, marginBottom: 4 },
  empty: { color: palette.textMuted, marginTop: spacing.xl },
  hint: { color: palette.textMuted, marginTop: spacing.xl },
});
