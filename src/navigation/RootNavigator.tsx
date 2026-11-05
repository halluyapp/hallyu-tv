import { palette, radius, spacing, gradients } from "@/design-system/tokens";
import { DownloadsScreen } from "@/screens/downloads/DownloadsScreen";
import { DetailsScreen } from "@/screens/details/DetailsScreen";
import { HomeScreen } from "@/screens/home/HomeScreen";
import { DiscoverScreen } from "@/screens/discover/DiscoverScreen";
import { MySpaceScreen } from "@/screens/mine/MySpaceScreen";
import { PlayerScreen } from "@/screens/player/PlayerScreen";
import { TvHomeScreen } from "@/screens/tv/TvHomeScreen";
import { TvSearchScreen } from "@/screens/tv/TvSearchScreen";
import { TvSettingsScreen } from "@/screens/tv/TvSettingsScreen";
import { OnboardingScreen } from "@/screens/onboarding/OnboardingScreen";
import { completeOnboarding } from "@/utils/onboarding";
import { useSound } from "@/services/sound/SoundContext";
import { IS_TV } from "@/config/appVariant";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, Compass, Download, User } from "lucide-react-native";
import type { StreamSource } from "@/types/provider";

export type RootStackParamList = {
  Onboarding: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  Details: { detailPath: string; subjectId: string };
  Player: {
    subjectId: string;
    detailPath: string;
    title: string;
    posterUrl: string | null;
    mediaType: "movie" | "series";
    season: number;
    episode: number;
    resumeAt: number;
    sources: StreamSource[];
    nextEpisode?: { season: number; episode: number } | null;
  };
  TvHome: undefined;
  TvSearch: undefined;
  TvDownloads: undefined;
  TvSettings: undefined;
};

export type TabParamList = {
  Home: undefined;
  Discover: undefined;
  Downloads: undefined;
  MySpace: undefined;
};

const TAB_TITLES: Record<keyof TabParamList, string> = {
  Home: "Home",
  Discover: "Explore",
  Downloads: "Downloads",
  MySpace: "Profile",
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const TAB_ICONS = {
  Home,
  Discover: Compass,
  Downloads: Download,
  MySpace: User,
} as const;

function MainTabs() {
  const { play } = useSound();
  const insets = useSafeAreaInsets();

  return (
    <Tabs.Navigator
      screenListeners={{
        tabPress: () => play("tab"),
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={gradients.glassSheen}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 0.6 }}
              style={styles.dockSheen}
              pointerEvents="none"
            />
            <View style={styles.dockSpecularRim} pointerEvents="none" />
          </View>
        ),
        tabBarStyle: [
          styles.floatingDock,
          {
            bottom: Math.max(spacing.md, insets.bottom + 4),
          },
        ],
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.3,
          marginTop: -2,
        },
        tabBarIcon: ({ color, focused }) => {
          const Icon = TAB_ICONS[route.name as keyof typeof TAB_ICONS];
          return (
            <View style={[styles.iconWrapper, focused && styles.iconActive]}>
              <Icon color={focused ? palette.accentBright : color} size={21} strokeWidth={focused ? 2.4 : 1.8} />
              {focused ? <View style={styles.activeDot} /> : null}
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Discover" component={DiscoverScreen} options={{ title: TAB_TITLES.Discover }} />
      <Tabs.Screen name="Downloads" component={DownloadsScreen} />
      <Tabs.Screen name="MySpace" component={MySpaceScreen} options={{ title: TAB_TITLES.MySpace }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator({ showOnboarding }: { showOnboarding: boolean }) {
  if (IS_TV) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}>
        <Stack.Screen name="TvHome" component={TvHomeScreen} />
        <Stack.Screen name="TvSearch" component={TvSearchScreen} />
        <Stack.Screen name="TvDownloads" component={DownloadsScreen} />
        <Stack.Screen name="TvSettings" component={TvSettingsScreen} />
        <Stack.Screen name="Details" component={DetailsScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} options={{ orientation: "landscape" }} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}>
      {showOnboarding ? (
        <Stack.Screen
          name="Onboarding"
          children={({ navigation }) => (
            <OnboardingScreen
              onDone={() => {
                void completeOnboarding();
                navigation.replace("Main");
              }}
            />
          )}
        />
      ) : null}
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Details" component={DetailsScreen} />
      <Stack.Screen name="Player" component={PlayerScreen} options={{ orientation: "all" }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  floatingDock: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    height: 64,
    borderRadius: radius.dock,
    backgroundColor: "rgba(12, 17, 26, 0.88)",
    borderColor: palette.glassStrokeBright,
    borderWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
    paddingTop: 6,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
    overflow: "hidden",
  },
  dockSheen: {
    ...StyleSheet.absoluteFillObject,
    height: "55%",
  },
  dockSpecularRim: {
    position: "absolute",
    top: 0,
    left: "10%",
    right: "10%",
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    width: 36,
    height: 28,
  },
  iconActive: {
    transform: [{ scale: 1.08 }],
  },
  activeDot: {
    position: "absolute",
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.accent,
    shadowColor: palette.accent,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
});
