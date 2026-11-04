import { palette, spacing } from "@/design-system/tokens";
import { effects } from "@/hooks/useDeviceTier";
import { DetailsScreen } from "@/screens/details/DetailsScreen";
import { DiscoverScreen } from "@/screens/discover/DiscoverScreen";
import { DownloadsScreen } from "@/screens/downloads/DownloadsScreen";
import { HomeScreen } from "@/screens/home/HomeScreen";
import { MySpaceScreen } from "@/screens/mine/MySpaceScreen";
import { OnboardingScreen } from "@/screens/onboarding/OnboardingScreen";
import { PlayerScreen } from "@/screens/player/PlayerScreen";
import { SearchScreen } from "@/screens/search/SearchScreen";
import { TvDetailsScreen } from "@/screens/tv/TvDetailsScreen";
import { TvDownloadsScreen } from "@/screens/tv/TvDownloadsScreen";
import { TvHomeScreen } from "@/screens/tv/TvHomeScreen";
import { TvSearchScreen } from "@/screens/tv/TvSearchScreen";
import { useSound } from "@/services/sound/SoundContext";
import type { StreamSource } from "@/types/provider";
import { completeOnboarding } from "@/utils/onboarding";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Compass, Download, Home, Search as SearchIcon, User } from "lucide-react-native";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chrome } from "@/design-system/gradients";
import { BlurSurface } from "@/components/ui/BlurSurface";

export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
  Details: { detailPath: string; subjectId: string };
  Search: undefined;
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
  Search: undefined;
  Downloads: undefined;
  MySpace: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const TAB_ICONS = {
  Home,
  Discover: Compass,
  Search: SearchIcon,
  Downloads: Download,
  MySpace: User,
} as const;

const TAB_LABELS: Record<keyof TabParamList, string> = {
  Home: "Home",
  Discover: "Explore",
  Search: "Search",
  Downloads: "Downloads",
  MySpace: "Profile",
};

/**
 * Floating liquid-glass tab bar.
 *
 * Blur is applied only when the device tier allows it — a live blur pass under
 * a bar that sits over scrolling artwork is the single most expensive surface in
 * the app, so low-tier devices get the layered tint instead and lose nothing but
 * a softness at the edges.
 */
function MainTabs() {
  const { play } = useSound();
  const insets = useSafeAreaInsets();
  const canBlur = effects().blur;

  return (
    <Tabs.Navigator
      screenListeners={{ tabPress: () => play("tab") }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarBackground: () => (
          // The one place in the app that blurs: a floating bar over scrolling
          // artwork. On low-tier devices BlurSurface falls back to the layered
          // tint, which is why the bar looks identical in structure either way.
          <BlurSurface material="primary" radius={spacing.xl} style={StyleSheet.absoluteFill}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: canBlur ? chrome.panelTint : chrome.panelTintOpaque }]} />
          </BlurSurface>
        ),
        tabBarStyle: {
          position: "absolute",
          left: spacing.lg,
          right: spacing.lg,
          bottom: Math.max(spacing.sm, insets.bottom - 6),
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          shadowColor: palette.void,
          shadowOpacity: 0.5,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
        },
        tabBarActiveTintColor: palette.accentBright,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.2 },
        tabBarIcon: ({ color }) => {
          const Icon = TAB_ICONS[route.name as keyof typeof TAB_ICONS];
          return <Icon color={color} size={20} strokeWidth={1.9} />;
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: TAB_LABELS.Home }} />
      <Tabs.Screen name="Discover" component={DiscoverScreen} options={{ title: TAB_LABELS.Discover }} />
      <Tabs.Screen name="Search" component={SearchScreen} options={{ title: TAB_LABELS.Search, tabBarButton: () => null }} />
      <Tabs.Screen name="Downloads" component={DownloadsScreen} options={{ title: TAB_LABELS.Downloads }} />
      <Tabs.Screen name="MySpace" component={MySpaceScreen} options={{ title: TAB_LABELS.MySpace }} />
    </Tabs.Navigator>
  );
}

/**
 * TV devices get an independent 10-foot stack with purpose-built screens.
 * Details and Downloads are TV-specific compositions, not the mobile screens
 * scaled up. Neither platform requires an account, pairing or another device.
 */
export function RootNavigator({ showOnboarding }: { showOnboarding: boolean }) {
  if (Platform.isTV) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          animation: "fade",
        }}
      >
        <Stack.Screen name="TvHome" component={TvHomeScreen} />
        <Stack.Screen name="TvSearch" component={TvSearchScreen} />
        <Stack.Screen name="TvDownloads" component={TvDownloadsScreen} />
        <Stack.Screen name="Details" component={TvDetailsScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} options={{ orientation: "all" }} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
        animation: "fade_from_bottom",
        animationDuration: 260,
      }}
    >
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
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Player" component={PlayerScreen} options={{ orientation: "all", animation: "fade" }} />
    </Stack.Navigator>
  );
}
