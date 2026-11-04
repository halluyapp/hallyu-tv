import { palette } from "@/design-system/tokens";
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
import { Platform } from "react-native";
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
  return (
    <Tabs.Navigator
      screenListeners={{
        tabPress: () => play("tab"),
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "rgba(16,21,27,0.92)",
          borderTopColor: palette.glassStroke,
          borderTopWidth: 0.5,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
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
      <Tabs.Screen name="Discover" component={DiscoverScreen} />
      <Tabs.Screen name="Downloads" component={DownloadsScreen} />
      <Tabs.Screen name="MySpace" component={MySpaceScreen} options={{ title: "My Space" }} />
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
