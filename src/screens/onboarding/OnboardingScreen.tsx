import { Button } from "@/components/ui/Button";
import { palette, spacing, gradients, radius } from "@/design-system/tokens";
import { AmbientGlow } from "@/components/ui/AmbientGlow";
import { useSound } from "@/services/sound/SoundContext";
import React, { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Compass, Download, Play } from "lucide-react-native";
import { APP_NAME } from "@/config/branding";
import { LinearGradient } from "expo-linear-gradient";

const STEPS = [
  {
    icon: Compass,
    title: "Discover stories worth your evening",
    body: `A curated universe of Asian cinema and prestige series — stream everything ${APP_NAME} offers freely, without friction.`,
    accent: palette.accent,
  },
  {
    icon: Play,
    title: "Cinematic liquid glass quality",
    body: "Fluid adaptive streaming up to 1080p, synchronized multilingual subtitles, and intelligent resume memory across all devices.",
    accent: "#38BDF8",
  },
  {
    icon: Download,
    title: "True offline freedom",
    body: "Download full seasons and high-definition films directly to your storage for uninterrupted playback anywhere, anytime.",
    accent: "#10B981",
  },
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const { play } = useSound();
  const insets = useSafeAreaInsets();
  const step = STEPS[index]!;
  const Icon = step.icon;

  const go = (next: number) => {
    if (next >= STEPS.length) play("confirm");
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      if (next >= STEPS.length) {
        onDone();
        return;
      }
      setIndex(next);
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  };

  return (
    <View style={styles.root}>
      <AmbientGlow />

      <View style={[styles.container, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        {/* Brand Header */}
        <View style={styles.header}>
          <LinearGradient
            colors={gradients.accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoPill}
          />
          <Text style={styles.brandTitle}>{APP_NAME}</Text>
        </View>

        {/* Dynamic Glass Slide Card */}
        <Animated.View style={[styles.cardWrapper, { opacity: fade }]}>
          <View style={styles.glassCard}>
            {/* Specular top sheen */}
            <LinearGradient
              colors={gradients.glassSheen}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.8, y: 0.6 }}
              style={styles.cardSheen}
              pointerEvents="none"
            />

            {/* Icon Orb */}
            <View style={[styles.iconOrb, { borderColor: step.accent }]}>
              <Icon size={38} color={step.accent} strokeWidth={1.8} />
            </View>

            <Text style={styles.slideTitle}>{step.title}</Text>
            <Text style={styles.slideBody}>{step.body}</Text>
          </View>
        </Animated.View>

        {/* Bottom Navigation & Controls */}
        <View style={styles.footer}>
          {/* Progress Indicators */}
          <View style={styles.indicatorRow}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: i === index ? 26 : 7,
                    backgroundColor: i === index ? palette.accent : palette.glassStrokeBright,
                  },
                ]}
              />
            ))}
          </View>

          <Button
            label={index === STEPS.length - 1 ? "Enter Cinema" : "Continue"}
            onPress={() => go(index + 1)}
            variant="primary"
            size="lg"
            style={{ width: "100%" }}
          />

          {index < STEPS.length - 1 ? (
            <Pressable onPress={() => go(STEPS.length)} hitSlop={12} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip introduction</Text>
            </Pressable>
          ) : (
            <View style={{ height: 38 }} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoPill: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  brandTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  cardWrapper: {
    width: "100%",
    alignItems: "center",
  },
  glassCard: {
    width: "100%",
    backgroundColor: palette.surfaceGlass,
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sheet,
    padding: spacing.xxl,
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 12,
  },
  cardSheen: {
    ...StyleSheet.absoluteFillObject,
    height: "50%",
  },
  iconOrb: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: palette.glassFillStrong,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  slideTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
    marginBottom: spacing.md,
  },
  slideBody: {
    color: palette.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
  },
  footer: {
    gap: spacing.lg,
    alignItems: "center",
  },
  indicatorRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  skipBtn: {
    paddingVertical: 8,
  },
  skipText: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
});
