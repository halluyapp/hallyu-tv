import { Button } from "@/components/ui/Button";
import { APP_NAME, APP_TAGLINE } from "@/config/branding";
import { palette, spacing, typeScale } from "@/design-system/tokens";
import { useAuth } from "@/hooks/useAuth";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function WelcomeScreen({ onExploreAsGuest }: { onExploreAsGuest: () => void }) {
  const { user, signIn, isSigningIn, error } = useAuth();
  const glow = useRef(new Animated.Value(0.6)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.6, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [glow]);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.ambient, { opacity: glow.interpolate({ inputRange: [0.6, 1], outputRange: [0.25, 0.5] }) }]} />
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xxl }]}>
        <View style={styles.mark}>
          <View style={styles.flame} />
        </View>
        <Text style={styles.wordmark}>{APP_NAME}</Text>
        <Text style={styles.tagline}>{APP_TAGLINE}</Text>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.xl }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {user ? (
          <Button label="Continue" onPress={onExploreAsGuest} style={{ alignSelf: "stretch" }} />
        ) : (
          <Button label="Continue with Google" onPress={() => void signIn("google")} loading={isSigningIn} style={{ alignSelf: "stretch" }} />
        )}
        <Button label="Explore as Guest" variant="secondary" onPress={onExploreAsGuest} style={{ alignSelf: "stretch" }} />
        <Text style={styles.note}>
          Guests can browse everything. Watching, downloads and your library need a {APP_NAME} account.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  ambient: {
    position: "absolute",
    bottom: -160,
    left: -60,
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: palette.emberGlow,
  },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  mark: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  flame: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.accent },
  wordmark: { color: palette.textPrimary, fontSize: 30, fontWeight: "800", letterSpacing: 6, textTransform: "uppercase" },
  tagline: { ...typeScale.body, color: palette.textSecondary },
  actions: { paddingHorizontal: spacing.xl, gap: spacing.md, alignItems: "center" },
  error: { color: palette.danger, fontSize: 13, textAlign: "center" },
  note: {
    ...typeScale.caption,
    color: palette.textMuted,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
});
