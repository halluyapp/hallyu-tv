import { palette } from "@/design-system/tokens";
import { useAppFonts } from "@/design-system/fonts";
import { RootNavigator } from "@/navigation/RootNavigator";
import { LibraryProvider } from "@/state/LibraryContext";
import { SoundProvider } from "@/services/sound/SoundContext";
import { hasCompletedOnboarding } from "@/utils/onboarding";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React, { Component, useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EmberSplash } from "./splash/EmberSplash";

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: palette.background,
    card: palette.surface,
    primary: palette.accent,
    text: palette.textPrimary,
    border: palette.glassStroke,
  },
};

/**
 * Last-resort branded crash screen.
 *
 * Two deliberate changes from the previous version:
 *
 * 1. **It can actually recover.** Clearing the error state alone re-rendered the
 *    same crashed subtree and threw again instantly — a permanent dead end. We
 *    bump a `key` on remount so the children are rebuilt from scratch.
 * 2. **Users never see raw internals.** `error.message` used to be printed
 *    straight onto the screen (and could be an empty string). It is now written
 *    to the console for debugging and kept out of the UI.
 */
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Unhandled app error:", error?.message ?? error);
  }

  private reset = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorRoot}>
          <Text style={styles.errorTitle}>Hallyu TV hit a problem</Text>
          <Text style={styles.errorMessage}>
            Something unexpected interrupted the app. Your watchlist, progress and downloads are safe on this device.
          </Text>
          <Pressable style={styles.errorBtn} onPress={this.reset} accessibilityRole="button">
            <Text style={styles.errorBtnLabel}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  // Fonts are bundled, so this resolves on the first frame or two. The splash
  // holds until then rather than flashing system type into Sora — but only for a
  // moment: a font subsystem that never settles must not become a permanent
  // splash screen.
  const fontsLoaded = useAppFonts();
  const [fontWaitOver, setFontWaitOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontWaitOver(true), 2500);
    return () => clearTimeout(timer);
  }, []);
  const fontsReady = fontsLoaded || fontWaitOver;

  // Startup must never be able to hang. AsyncStorage can stall on a cold start
  // (corrupt store / slow disk); a hard timeout means the user always lands in
  // the app instead of staring at a splash screen forever.
  useEffect(() => {
    let settled = false;
    const settle = (next: boolean) => {
      if (settled) return;
      settled = true;
      setShowOnboarding(next);
    };
    const timer = setTimeout(() => settle(false), 1500);

    hasCompletedOnboarding()
      .then((done) => settle(!done))
      .catch(() => settle(false));

    return () => clearTimeout(timer);
  }, []);

  if (showOnboarding === null || !fontsReady) {
    return <EmberSplash />;
  }

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <View style={styles.root}>
          <StatusBar style="light" />
          <NavigationContainer theme={theme}>
            <SoundProvider>
              <LibraryProvider>
                <RootNavigator showOnboarding={showOnboarding} />
              </LibraryProvider>
            </SoundProvider>
          </NavigationContainer>
        </View>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  errorRoot: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  errorTitle: { color: palette.textPrimary, fontSize: 20, fontWeight: "800", textAlign: "center" },
  errorMessage: { color: palette.textSecondary, textAlign: "center", lineHeight: 22, maxWidth: 380 },
  errorBtn: {
    marginTop: 12,
    backgroundColor: palette.accent,
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  errorBtnLabel: { color: palette.textOnAccent, fontWeight: "700", fontSize: 15 },
});
