import { Button } from "@/components/ui/Button";
import { palette, spacing, typeScale } from "@/design-system/tokens";
import React, { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Compass, Download, Play } from "lucide-react-native";
import { APP_NAME } from "@/config/branding";

const STEPS = [
  {
    icon: Compass,
    title: "Discover stories worth your evening",
    body: `A curated world of films and series — browse everything ${APP_NAME} has on offer, freely.`,
    accent: palette.accent,
  },
  {
    icon: Play,
    title: "Watch in cinematic quality",
    body: "Pick your quality, choose your subtitles, and pick up where you left off on this device.",
    accent: palette.textPrimary,
  },
  {
    icon: Download,
    title: "Take the story offline",
    body: "Download titles to your device and keep watching when the network won't cooperate.",
    accent: palette.success,
  },
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();
  const step = STEPS[index]!;
  const Icon = step.icon;

  const go = (next: number) => {
    Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      if (next >= STEPS.length) {
        onDone();
        return;
      }
      setIndex(next);
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xxxl }]}>
      <View style={styles.ambient} />
      <Animated.View style={[styles.content, { opacity: fade }]}>
        <View style={[styles.iconWrap, { borderColor: step.accent }]}>
          <Icon size={30} color={step.accent} strokeWidth={1.6} />
        </View>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Button label={index === STEPS.length - 1 ? "Get started" : "Continue"} onPress={() => go(index + 1)} style={{ alignSelf: "stretch" }} />
        <Pressable onPress={() => go(STEPS.length)} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  ambient: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: palette.emberGlow,
    opacity: 0.35,
  },
  content: { alignItems: "center", paddingHorizontal: spacing.xxl, gap: spacing.xl },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    backgroundColor: palette.glassFill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typeScale.display,
    color: palette.textPrimary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  body: {
    ...typeScale.body,
    color: palette.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: spacing.lg,
  },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.xl, gap: spacing.lg, alignItems: "center" },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.surfaceRaised },
  dotActive: { backgroundColor: palette.accent, width: 18 },
  skip: { color: palette.textMuted, fontSize: 14, fontWeight: "600" },
});
