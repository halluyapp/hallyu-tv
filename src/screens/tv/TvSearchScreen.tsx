import { palette, radius, spacing } from "@/design-system/tokens";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { searchCatalogue } from "@/services/provider/adapter";
import { CatalogueItem } from "@/types/provider";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

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
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hasTVPreferredFocus={results === null}>
          <ChevronLeft size={22} color={palette.textPrimary} />
        </Pressable>
        <View style={styles.inputWrap}>
          <Search size={16} color={palette.textMuted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search titles…"
            placeholderTextColor={palette.textMuted}
            style={styles.input}
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
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {results.map((item, idx) => (
              <Pressable
                key={`${item.subjectId}_${item.slug}`}
                onPress={() => navigation.navigate("Details", { detailPath: item.slug, subjectId: item.subjectId })}
                onFocus={() => setFocusedIdx(idx)}
                onBlur={() => setFocusedIdx(null)}
                style={[styles.card, focusedIdx === idx && styles.cardFocused]}
              >
                {item.posterUrl ? (
                  <Image source={{ uri: item.posterUrl }} style={styles.poster} resizeMode="cover" />
                ) : (
                  <View style={[styles.poster, { backgroundColor: palette.surfaceRaised }]} />
                )}
                <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.cardMeta}>
                  {[item.year, item.mediaType === "series" ? "Series" : "Movie"].filter(Boolean).join(" · ")}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  card: { width: 190, borderRadius: radius.md, overflow: "hidden", backgroundColor: palette.surface },
  cardFocused: { transform: [{ scale: 1.05 }], borderColor: palette.accent, borderWidth: 2 },
  poster: { width: 190, height: 107, backgroundColor: palette.surfaceRaised },
  cardTitle: { color: palette.textPrimary, fontSize: 13, fontWeight: "600", padding: spacing.sm, paddingBottom: 0 },
  cardMeta: { color: palette.textMuted, fontSize: 10, padding: spacing.sm, paddingTop: 2 },
  empty: { color: palette.textMuted, paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  hint: { color: palette.textMuted, paddingHorizontal: spacing.xl, marginTop: spacing.xl },
});
