import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Sparkles } from "lucide-react-native";
import React, { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { MobileTabBar } from "@/apps/mobile/components/MobileTabBar";
import { MobileUpdateSheet } from "@/apps/mobile/components/MobileUpdateSheet";
import type { MobileStackParamList, MobileTabParamList } from "@/apps/mobile/navigation/mobileTypes";
import { MobilePlayerScreen } from "@/apps/mobile/player/MobilePlayerScreen";
import { MobileDetailsScreen } from "@/apps/mobile/screens/MobileDetailsScreen";
import {
  MobileDownloadsScreen,
  MobileMySpaceScreen,
} from "@/apps/mobile/screens/MobileDownloadsAndSpace";
import { MobileExploreScreen } from "@/apps/mobile/screens/MobileExploreScreen";
import { MobileHomeScreen } from "@/apps/mobile/screens/MobileHomeScreen";
import { BRAND_WORDMARK } from "@/config/branding";
import { palette } from "@/design-system/tokens";
import { warmBootHome } from "@/services/provider/homeCatalogue";
import { SoundProvider } from "@/services/sound/SoundContext";
import {
  checkForAppUpdates,
  type ReleaseManifest,
} from "@/services/updater/appUpdater";
import { EmberSplash } from "@/splash/EmberSplash";
import { DisplayModeProvider } from "@/state/DisplayModeContext";
import { LibraryProvider } from "@/state/LibraryContext";
import { PreferencesProvider } from "@/state/PreferencesContext";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";
import { hasCompletedOnboarding, markOnboardingComplete } from "@/utils/onboarding";

const Tab = createBottomTabNavigator<MobileTabParamList>();
const Stack = createNativeStackNavigator<MobileStackParamList>();

const mobileTheme = {
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

function MobileWelcomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const finish = async () => {
    await markOnboardingComplete();
    navigation.replace("MobileTabs");
  };

  return (
    <View style={[styles.welcomeRoot, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}>
      <AmbientArtworkCanvas intensity="rich" />
      <View style={styles.brandRow}>
        <Text style={styles.welcomeBrand}>{BRAND_WORDMARK}</Text>
        <View style={styles.brandDot} />
      </View>

      <LiquidGlassView variant="dock" borderRadius={28} blurIntensity={44} contentStyle={styles.welcomeCard}>
        <View style={styles.welcomeBadge}>
          <Sparkles size={15} color={palette.gold} />
          <Text style={styles.welcomeBadgeText}>Liquid Glass Cinema · Zero Sign-In</Text>
        </View>
        <Text style={styles.welcomeTitle}>K-Dramas, Anime & Global Cinema — Instant & Offline</Text>
        <Text style={styles.welcomeBody}>
          Stream full-length HD episodes with automatic subtitles, save progressive MP4 downloads for offline viewing, and keep your watchlist privately on your phone.
        </Text>
        <GlassPillButton label="Enter Hallyu" variant="primary" size="lg" fullWidth onPress={finish} />
      </LiquidGlassView>
    </View>
  );
}

// Kick off disk hydration + /home network request at bundle boot (400-900ms before Home mounts!)
void warmBootHome().catch(() => {});

function MobileTabsNavigator({
  onOpenUpdateSheet,
}: {
  onOpenUpdateSheet: (manifest: ReleaseManifest, currentVersion: string) => void;
}) {
  const renderMySpace = useCallback(
    () => <MobileMySpaceScreen onOpenUpdateSheet={onOpenUpdateSheet} />,
    [onOpenUpdateSheet],
  );

  return (
    <Tab.Navigator
      tabBar={(props) => <MobileTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
    >
      <Tab.Screen name="Home" component={MobileHomeScreen} />
      <Tab.Screen name="Explore" component={MobileExploreScreen} />
      <Tab.Screen name="Downloads" component={MobileDownloadsScreen} />
      <Tab.Screen name="MySpace">{renderMySpace}</Tab.Screen>
    </Tab.Navigator>
  );
}

class MobileErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorRoot}>
          <Text style={styles.errorTitle}>Hallyu Hit a Problem</Text>
          <Text style={styles.errorSub}>{this.state.error.message}</Text>
          <GlassPillButton label="Restart App" variant="primary" onPress={() => this.setState({ error: null })} />
        </View>
      );
    }
    return this.props.children;
  }
}

/**
 * Standalone Hallyu Mobile Root Application (`app.hallyu.mobile`).
 * Optimized for one-handed touch ergonomics and smooth 60fps on 2 GB RAM phones.
 */
export function MobileApp() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateManifest, setUpdateManifest] = useState<ReleaseManifest | null>(null);
  const [currentVersion, setCurrentVersion] = useState("0.1.0");

  useEffect(() => {
    hasCompletedOnboarding()
      .then((done) => setShowOnboarding(!done))
      .catch(() => setShowOnboarding(false));
  }, []);

  const openUpdateSheet = useCallback((manifest: ReleaseManifest, curVer: string) => {
    setUpdateManifest(manifest);
    setCurrentVersion(curVer);
    setUpdateOpen(true);
  }, []);

  // Quiet once-per-session Mobile update check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForAppUpdates("mobile")
        .then((res) => {
          if (res.hasUpdate && res.manifest) {
            openUpdateSheet(res.manifest, res.currentVersion);
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, [openUpdateSheet]);

  const renderMobileTabs = useCallback(
    () => <MobileTabsNavigator onOpenUpdateSheet={openUpdateSheet} />,
    [openUpdateSheet],
  );

  if (showOnboarding === null) {
    return <EmberSplash />;
  }

  return (
    <MobileErrorBoundary>
      <SafeAreaProvider>
        <View style={styles.root}>
          <StatusBar style="light" />
          <DisplayModeProvider>
            <PreferencesProvider>
              <SoundProvider>
                <LibraryProvider>
                  <NavigationContainer theme={mobileTheme}>
                    <Stack.Navigator
                      initialRouteName={showOnboarding ? "Onboarding" : "MobileTabs"}
                      screenOptions={{
                        headerShown: false,
                        animation: "slide_from_right",
                        contentStyle: { backgroundColor: palette.background },
                      }}
                    >
                      <Stack.Screen name="Onboarding" component={MobileWelcomeScreen} />
                      <Stack.Screen name="MobileTabs">{renderMobileTabs}</Stack.Screen>
                      <Stack.Screen name="MobileDetails" component={MobileDetailsScreen} />
                      <Stack.Screen
                        name="MobilePlayer"
                        component={MobilePlayerScreen}
                        options={{ animation: "fade" }}
                      />
                    </Stack.Navigator>
                  </NavigationContainer>

                  <MobileUpdateSheet
                    visible={updateOpen}
                    manifest={updateManifest}
                    currentVersion={currentVersion}
                    onClose={() => setUpdateOpen(false)}
                  />
                </LibraryProvider>
              </SoundProvider>
            </PreferencesProvider>
          </DisplayModeProvider>
        </View>
      </SafeAreaProvider>
    </MobileErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  welcomeRoot: {
    flex: 1,
    backgroundColor: palette.background,
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  welcomeBrand: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.accentBright,
    marginTop: 5,
  },
  welcomeCard: {
    padding: 24,
    gap: 14,
  },
  welcomeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "rgba(246, 196, 83, 0.14)",
    borderColor: "rgba(246, 196, 83, 0.35)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  welcomeBadgeText: {
    color: palette.gold,
    fontSize: 11.5,
    fontWeight: "800",
  },
  welcomeTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -0.6,
    lineHeight: 31,
  },
  welcomeBody: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  errorRoot: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  errorSub: {
    color: palette.textSecondary,
    fontSize: 13.5,
    textAlign: "center",
  },
});
