import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import React, { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TvUpdateModal } from "@/apps/tv/components/TvUpdateModal";
import { TvSidebar } from "@/apps/tv/focus/TvSidebar";
import {
  TV_SECTION_TO_WORLD,
  type TvSectionId,
  type TvStackParamList,
} from "@/apps/tv/navigation/tvTypes";
import { TvPlayerScreen } from "@/apps/tv/player/TvPlayerScreen";
import { TvCategoryScreen } from "@/apps/tv/screens/TvCategoryScreen";
import { TvDetailsScreen } from "@/apps/tv/screens/TvDetailsScreen";
import { TvHomeScreen } from "@/apps/tv/screens/TvHomeScreen";
import { TvDownloadsScreen, TvLibraryScreen } from "@/apps/tv/screens/TvLibraryAndDownloads";
import { TvSearchScreen } from "@/apps/tv/screens/TvSearchScreen";
import { TvSettingsScreen } from "@/apps/tv/screens/TvSettingsScreen";
import { palette } from "@/design-system/tokens";
import { warmBootHome } from "@/services/provider/homeCatalogue";
import { SoundProvider } from "@/services/sound/SoundContext";
import {
  checkForAppUpdates,
  type ReleaseManifest,
} from "@/services/updater/appUpdater";
import { DisplayModeProvider } from "@/state/DisplayModeContext";
import { LibraryProvider } from "@/state/LibraryContext";
import { PreferencesProvider } from "@/state/PreferencesContext";
import { GlassPillButton } from "@/ui/glass/GlassButton";

const Stack = createNativeStackNavigator<TvStackParamList>();

const tvTheme = {
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

function TvShellScreen({
  onOpenUpdateModal,
}: {
  onOpenUpdateModal: (manifest: ReleaseManifest, currentVersion: string) => void;
}) {
  const [section, setSection] = useState<TvSectionId>("home");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // Predictable TV Back discipline on shell screens:
  // Expanded sidebar -> collapse; non-Home section -> return to Home; Home -> allow OS exit.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (sidebarExpanded) {
        setSidebarExpanded(false);
        return true;
      }
      if (section !== "home") {
        setSection("home");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [section, sidebarExpanded]);

  const worldId = TV_SECTION_TO_WORLD[section];

  return (
    <View style={styles.root}>
      <View style={styles.stageWrap}>
        {section === "home" ? <TvHomeScreen /> : null}
        {section === "search" ? <TvSearchScreen /> : null}
        {worldId ? <TvCategoryScreen worldId={worldId} /> : null}
        {section === "continue" ? <TvLibraryScreen mode="continue" /> : null}
        {section === "mylist" ? <TvLibraryScreen mode="mylist" /> : null}
        {section === "downloads" ? <TvDownloadsScreen /> : null}
        {section === "settings" ? <TvSettingsScreen onOpenUpdateModal={onOpenUpdateModal} /> : null}
      </View>

      <TvSidebar
        activeSection={section}
        expanded={sidebarExpanded}
        onExpandedChange={setSidebarExpanded}
        onSelectSection={setSection}
      />
    </View>
  );
}

class TvErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorRoot}>
          <Text style={styles.errorTitle}>Hallyu TV Hit a Problem</Text>
          <Text style={styles.errorSub}>{this.state.error.message}</Text>
          <GlassPillButton label="Restart Hallyu TV" variant="primary" size="tv" hasTVPreferredFocus onPress={() => this.setState({ error: null })} />
        </View>
      );
    }
    return this.props.children;
  }
}

// Kick off disk hydration + /home network request at bundle boot so TV Home paints immediately!
void warmBootHome().catch(() => {});

/**
 * Standalone Hallyu TV Root Application (`app.hallyutv.dev`).
 * Zero mobile bottom tabs, zero touch sheets — pure 10-foot Liquid Glass cinema.
 */
export function TvApp() {
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateManifest, setUpdateManifest] = useState<ReleaseManifest | null>(null);
  const [currentVersion, setCurrentVersion] = useState("0.1.0");

  const openUpdateModal = useCallback((manifest: ReleaseManifest, curVer: string) => {
    setUpdateManifest(manifest);
    setCurrentVersion(curVer);
    setUpdateModalOpen(true);
  }, []);

  const renderTvShell = useCallback(
    () => <TvShellScreen onOpenUpdateModal={openUpdateModal} />,
    [openUpdateModal],
  );

  // Quiet once-per-session TV update check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForAppUpdates("tv")
        .then((res) => {
          if (res.hasUpdate && res.manifest) {
            openUpdateModal(res.manifest, res.currentVersion);
          }
        })
        .catch(() => {});
    }, 3500);
    return () => clearTimeout(timer);
  }, [openUpdateModal]);

  return (
    <TvErrorBoundary>
      <SafeAreaProvider>
        <View style={styles.root}>
          <StatusBar hidden />
          <DisplayModeProvider>
            <PreferencesProvider>
              <SoundProvider>
                <LibraryProvider>
                  <NavigationContainer theme={tvTheme}>
                    <Stack.Navigator
                      screenOptions={{
                        headerShown: false,
                        animation: "fade",
                        contentStyle: { backgroundColor: palette.background },
                      }}
                    >
                      <Stack.Screen name="TvShell">{renderTvShell}</Stack.Screen>
                      <Stack.Screen name="TvDetails" component={TvDetailsScreen} />
                      <Stack.Screen name="TvPlayer" component={TvPlayerScreen} />
                    </Stack.Navigator>
                  </NavigationContainer>

                  <TvUpdateModal
                    visible={updateModalOpen}
                    manifest={updateManifest}
                    currentVersion={currentVersion}
                    onClose={() => setUpdateModalOpen(false)}
                  />
                </LibraryProvider>
              </SoundProvider>
            </PreferencesProvider>
          </DisplayModeProvider>
        </View>
      </SafeAreaProvider>
    </TvErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  stageWrap: {
    flex: 1,
  },
  errorRoot: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 14,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  errorSub: {
    color: palette.textSecondary,
    fontSize: 14,
    textAlign: "center",
    maxWidth: 480,
  },
});
