import { palette } from "@/design-system/tokens";
import { RootNavigator } from "@/navigation/RootNavigator";
import { GateProvider } from "@/components/auth/GateProvider";
import { LibraryProvider } from "@/state/LibraryContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "./splash/EmberSplash";
import { hasCompletedOnboarding } from "@/utils/onboarding";

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

export default function App() {
  const { isLoading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    hasCompletedOnboarding()
      .then((done) => setShowOnboarding(!done))
      .catch(() => setShowOnboarding(true));
  }, []);

  if (isLoading || showOnboarding === null) {
    return <SplashScreen.EmberSplash />;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        <NavigationContainer theme={theme}>
          <AuthProvider>
            <GateProvider>
              <LibraryProvider>
                <RootNavigator showOnboarding={showOnboarding} />
              </LibraryProvider>
            </GateProvider>
          </AuthProvider>
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
});
