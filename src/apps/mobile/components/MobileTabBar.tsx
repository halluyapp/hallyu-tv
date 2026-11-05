import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Compass, Download, Home, User } from "lucide-react-native";
import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette, radius } from "@/design-system/tokens";
import { useSound } from "@/services/sound/SoundContext";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

export const MOBILE_TAB_BAR_CLEARANCE = 96;

const TAB_CONFIG: Record<
  string,
  { label: string; renderIcon: (color: string, active: boolean) => React.ReactNode }
> = {
  Home: {
    label: "Home",
    renderIcon: (color) => <Home size={20} color={color} strokeWidth={2.2} />,
  },
  Explore: {
    label: "Explore",
    renderIcon: (color) => <Compass size={20} color={color} strokeWidth={2.1} />,
  },
  Downloads: {
    label: "Downloads",
    renderIcon: (color) => <Download size={20} color={color} strokeWidth={2.1} />,
  },
  MySpace: {
    label: "My Space",
    renderIcon: (color) => <User size={20} color={color} strokeWidth={2.1} />,
  },
};

/**
 * 1:1 Floating iOS-26-style Liquid Glass Bottom Tab Dock (`mobile-01-home.png`,
 * `mobile-02-discover-search.png`): hovers above the bottom safe area, optically
 * blurring and refracting scrolling posters beneath it with a luminous pearl-coral
 * active tab capsule.
 */
export const MobileTabBar = memo(function MobileTabBar({
  state,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { play } = useSound();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.anchor, { bottom: Math.max(12, insets.bottom + 6) }]}
    >
      <LiquidGlassView
        variant="dock"
        borderRadius={radius.pill}
        blurIntensity={46}
        style={styles.dockOuter}
        contentStyle={styles.dockInner}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const cfg = TAB_CONFIG[route.name] ?? TAB_CONFIG.Home!;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              play("tab");
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessible
              accessibilityRole="tab"
              accessibilityLabel={cfg.label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={styles.tabSlot}
            >
              {focused ? (
                <LiquidGlassView
                  variant="ember"
                  borderRadius={radius.pill}
                  contentStyle={styles.activePill}
                >
                  {cfg.renderIcon(palette.pearlInk, true)}
                  <Text numberOfLines={1} style={styles.activeLabel}>
                    {cfg.label}
                  </Text>
                </LiquidGlassView>
              ) : (
                <View style={styles.idlePill}>
                  {cfg.renderIcon(palette.textSecondary, false)}
                  <Text numberOfLines={1} style={styles.idleLabel}>
                    {cfg.label}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </LiquidGlassView>
    </View>
  );
});

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 40,
  },
  dockOuter: {
    width: "100%",
  },
  dockInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 5,
    gap: 4,
  },
  tabSlot: {
    flex: 1,
  },
  activePill: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  idlePill: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  activeLabel: {
    color: palette.pearlInk,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: -0.1,
  },
  idleLabel: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
});
