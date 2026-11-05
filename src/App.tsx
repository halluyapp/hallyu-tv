import { palette } from "@/design-system/tokens";
import { RootNavigator } from "@/navigation/RootNavigator";
import { LibraryProvider } from "@/state/LibraryContext";
import { SoundProvider } from "@/services/sound/SoundContext";
import { DisplayModeProvider } from "@/state/DisplayModeContext";
import { hasCompletedOnboarding } from "@/utils/onboarding";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React, { Component, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
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

/** Last-resort branded crash screen with a retry action. */
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Unhandled app error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorRoot}>
          <Text style={styles.errorTitle}>Hallyu hit a problem</Text>
          <Text style={styles.errorMessage}>{this.state.error.message}</Text>
          <Text style={styles.errorRetry} onPress={() => this.setState({ error: null })}>
            Tap to restart the app
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    hasCompletedOnboarding()
      .then((done) => setShowOnboarding(!done))
      .catch(() => setShowOnboarding(true));
  }, []);

  if (showOnboarding === null) {
    return <EmberSplash />;
  }

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <View style={styles.root}>
          <StatusBar style="light" />
          <NavigationContainer theme={theme}>
            <DisplayModeProvider>
              <SoundProvider>
                <LibraryProvider>
                  <RootNavigator showOnboarding={showOnboarding} />
                </LibraryProvider>
              </SoundProvider>
            </DisplayModeProvider>
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
  errorMessage: { color: palette.textSecondary, textAlign: "center", lineHeight: 20 },
  errorRetry: { color: palette.accent, fontWeight: "700", marginTop: 8, padding: 8 },
});
