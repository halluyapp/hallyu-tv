import { palette, radius, spacing } from "@/design-system/tokens";
import { DownloadsScreen } from "@/screens/downloads/DownloadsScreen";
import { DetailsScreen } from "@/screens/details/DetailsScreen";
import { HomeScreen } from "@/screens/home/HomeScreen";
import { DiscoverScreen } from "@/screens/discover/DiscoverScreen";
import { MySpaceScreen } from "@/screens/mine/MySpaceScreen";
import { PlayerScreen } from "@/screens/player/PlayerScreen";
import { TvHomeScreen } from "@/screens/tv/TvHomeScreen";
import { TvSearchScreen } from "@/screens/tv/TvSearchScreen";
import { OnboardingScreen } from "@/screens/onboarding/OnboardingScreen";
import { completeOnboarding } from "@/utils/onboarding";
import { useSound } from "@/services/sound/SoundContext";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, Compass, Download, User } from "lucide-react-native";
import type { StreamSource } from "@/types/provider";

export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
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
    /** When set, the player offers this following episode once this one ends. */
    nextEpisode?: { season: number; episode: number } | null;
  };
  TvHome: undefined;
  TvSearch: undefined;
  TvDownloads: undefined;
};

export type TabParamList = {
  Home: undefined;
  Discover: undefined;
  Downloads: undefined;
  MySpace: undefined;
};

/** Screen titles follow the spec's four destinations; route names are stable. */
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
        // Floating liquid-glass bar: a detached rounded panel above the safe
        // area, not a full-width slab — content stays visible scrolling under.
        tabBarStyle: [
          {
            position: "absolute",
            left: spacing.xl,
            right: spacing.xl,
            bottom: Math.max(spacing.md, insets.bottom - 4),
            backgroundColor: "rgba(13,17,23,0.86)",
            borderColor: palette.glassStroke,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.sheet,
            height: 62,
            paddingBottom: 8,
            paddingTop: 6,
            shadowColor: "#000",
            shadowOpacity: 0.45,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 14,
          },
        ],
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
        tabBarIcon: ({ color }) => {
          const Icon = TAB_ICONS[route.name as keyof typeof TAB_ICONS];
          return <Icon color={color} size={21} strokeWidth={1.8} />;
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

/**
 * TV devices get an independent 10-foot stack; phones/tablets get the mobile
 * tabs. Neither requires an account, pairing, or another device.
 */
export function RootNavigator({ showOnboarding }: { showOnboarding: boolean }) {
  if (Platform.isTV) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}>
        <Stack.Screen name="TvHome" component={TvHomeScreen} />
        <Stack.Screen name="TvSearch" component={TvSearchScreen} />
        <Stack.Screen name="TvDownloads" component={DownloadsScreen} />
        <Stack.Screen name="Details" component={DetailsScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} options={{ orientation: "all" }} />
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
