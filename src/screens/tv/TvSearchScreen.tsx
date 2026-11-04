import { palette, radius, spacing } from "@/design-system/tokens";
import { useStage } from "@/hooks/useStage";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { searchCatalogue } from "@/services/provider/adapter";
import { CatalogueItem } from "@/types/provider";
import { Poster, initialsFor } from "@/components/ui/Poster";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** TV search — type with the remote (IME) or an attached keyboard; d-pad to browse results. */
export function TvSearchScreen() {
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogueItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
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
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={[
            styles.backBtn,
            { width: stage.controlSize, height: stage.controlSize, borderRadius: stage.controlSize / 2 },
          ]}
          hasTVPreferredFocus={results === null}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={22} color={palette.textPrimary} />
        </Pressable>
        <View style={[styles.inputWrap, { height: stage.controlSize, paddingHorizontal: stage.cardGap }]}>
          <Search size={16} color={palette.textMuted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search titles…"
            placeholderTextColor={palette.textMuted}
            style={[styles.input, { fontSize: stage.bodySize }]}
            returnKeyType="search"
            onSubmitEditing={() => void run(query)}
            autoFocus
          />
        </View>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: spacing.xxl }} size="large" color={palette.accent} /> : null}

      {results !== null && !loading ? (
        results.length === 0 ? (
          <Text style={styles.empty}>Nothing matched “{query}”.</Text>
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
                <Text style={[styles.cardTitle, { fontSize: stage.cardTitleSize }]} numberOfLines={2}>
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

      {results === null && !loading ? <Text style={styles.hint}>Type at least two characters.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.glassFill,
    borderColor: palette.glassStroke,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  input: { flex: 1, color: palette.textPrimary, fontSize: 16, paddingVertical: 0 },
  grid: { gap: spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  card: { borderRadius: radius.md, overflow: "hidden", backgroundColor: palette.surface },
  cardFocused: {
    transform: [{ scale: 1.05 }],
    shadowColor: palette.accent,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  poster: { backgroundColor: palette.surfaceRaised },
  cardTitle: { color: palette.textPrimary, fontWeight: "600", padding: spacing.sm, paddingBottom: 0 },
  cardMeta: { color: palette.textMuted, padding: spacing.sm, paddingTop: 2 },
  empty: { color: palette.textMuted, paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  hint: { color: palette.textMuted, paddingHorizontal: spacing.xl, marginTop: spacing.xl },
});
