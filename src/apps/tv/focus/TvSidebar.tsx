import {
  Clapperboard,
  Compass,
  Download,
  Film,
  Flame,
  Home,
  ListPlus,
  PlayCircle,
  Search,
  Settings,
  Sparkles,
  Tv,
} from "lucide-react-native";
import React, { memo, useCallback, useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TvSectionId } from "@/apps/tv/navigation/tvTypes";
import { motion } from "@/design-system/motion";
import { palette, radius } from "@/design-system/tokens";
import { useSound } from "@/services/sound/SoundContext";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

export interface TvNavItem {
  id: TvSectionId;
  label: string;
  compactVisible?: boolean;
  renderIcon: (color: string, size: number) => React.ReactNode;
}

export const TV_NAV_ITEMS: TvNavItem[] = [
  { id: "search", label: "Search", compactVisible: true, renderIcon: (c, s) => <Search size={s} color={c} strokeWidth={2.1} /> },
  { id: "home", label: "Home", compactVisible: true, renderIcon: (c, s) => <Home size={s} color={c} strokeWidth={2.2} /> },
  { id: "discover", label: "Discover", compactVisible: true, renderIcon: (c, s) => <Compass size={s} color={c} strokeWidth={2.1} /> },
  { id: "kdrama", label: "K-Drama", compactVisible: true, renderIcon: (c, s) => <Tv size={s} color={c} strokeWidth={2.1} /> },
  { id: "cdrama", label: "C-Drama", renderIcon: (c, s) => <Sparkles size={s} color={c} strokeWidth={2.1} /> },
  { id: "anime", label: "Anime", renderIcon: (c, s) => <Flame size={s} color={c} strokeWidth={2.1} /> },
  { id: "movies", label: "Movies", renderIcon: (c, s) => <Film size={s} color={c} strokeWidth={2.1} /> },
  { id: "series", label: "Series", renderIcon: (c, s) => <Clapperboard size={s} color={c} strokeWidth={2.1} /> },
  { id: "hollywood", label: "Hollywood", renderIcon: (c, s) => <Clapperboard size={s} color={c} strokeWidth={2.1} /> },
  { id: "continue", label: "Continue Watching", renderIcon: (c, s) => <PlayCircle size={s} color={c} strokeWidth={2.1} /> },
  { id: "mylist", label: "My List", compactVisible: true, renderIcon: (c, s) => <ListPlus size={s} color={c} strokeWidth={2.1} /> },
  { id: "downloads", label: "Downloads", compactVisible: true, renderIcon: (c, s) => <Download size={s} color={c} strokeWidth={2.1} /> },
  { id: "settings", label: "Settings", compactVisible: true, renderIcon: (c, s) => <Settings size={s} color={c} strokeWidth={2.1} /> },
];

interface TvSidebarProps {
  activeSection: TvSectionId;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelectSection: (section: TvSectionId) => void;
}

export const COLLAPSED_RAIL_WIDTH = 64;
export const EXPANDED_RAIL_WIDTH = 248;

/**
 * 1:1 Floating Liquid Glass TV Sidebar matching `tv-01-home.png` (collapsed
 * vertical pill dock with glowing pearl active circle) and `tv-02-sidebar-categories.png`
 * (expanded 248px Frosted Liquid Glass squircle panel with luminous coral-pearl
 * focused capsule).
 */
export const TvSidebar = memo(function TvSidebar({
  activeSection,
  expanded,
  onExpandedChange,
  onSelectSection,
}: TvSidebarProps) {
  const { play } = useSound();
  const focusCountRef = useRef(0);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrimOpacity = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(scrimOpacity, {
      toValue: expanded ? 1 : 0,
      duration: motion.fast,
      useNativeDriver: true,
    }).start();
  }, [expanded, scrimOpacity]);

  useEffect(
    () => () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    },
    [],
  );

  const handleItemFocus = useCallback(
    (_id: TvSectionId) => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      focusCountRef.current += 1;
      if (!expanded) onExpandedChange(true);
      play("tap", { intensity: 0.3 });
    },
    [expanded, onExpandedChange, play],
  );

  const handleItemBlur = useCallback(() => {
    focusCountRef.current = Math.max(0, focusCountRef.current - 1);
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      if (focusCountRef.current === 0) {
        onExpandedChange(false);
      }
    }, 90);
  }, [onExpandedChange]);

  const handleSelect = useCallback(
    (id: TvSectionId) => {
      play("tab");
      onSelectSection(id);
      onExpandedChange(false);
    },
    [onExpandedChange, onSelectSection, play],
  );

  return (
    <>
      {expanded ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.backdropScrim, { opacity: scrimOpacity }]}
        />
      ) : null}

      <View style={styles.railAnchor} pointerEvents="box-none">
        {expanded ? (
          <LiquidGlassView
            variant="dock"
            borderRadius={28}
            blurIntensity={46}
            style={styles.expandedPanel}
            contentStyle={styles.expandedContent}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.expandedList}
            >
              {TV_NAV_ITEMS.map((item) => (
                <ExpandedRow
                  key={item.id}
                  item={item}
                  isActive={activeSection === item.id}
                  onFocusItem={handleItemFocus}
                  onBlurItem={handleItemBlur}
                  onSelect={handleSelect}
                />
              ))}
            </ScrollView>
          </LiquidGlassView>
        ) : (
          <LiquidGlassView
            variant="dock"
            borderRadius={radius.pill}
            blurIntensity={42}
            style={styles.collapsedCapsule}
            contentStyle={styles.collapsedContent}
          >
            {TV_NAV_ITEMS.filter((i) => i.compactVisible || i.id === activeSection).map((item) => {
              const isActive = activeSection === item.id;
              return (
                <Pressable
                  key={item.id}
                  focusable
                  accessible
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: isActive }}
                  onFocus={() => handleItemFocus(item.id)}
                  onBlur={handleItemBlur}
                  onPress={() => handleSelect(item.id)}
                  style={[styles.compactItem, isActive && styles.compactItemActive]}
                >
                  {item.renderIcon(isActive ? palette.pearlInk : "#E2E8F2", 20)}
                </Pressable>
              );
            })}
          </LiquidGlassView>
        )}
      </View>
    </>
  );
});

const ExpandedRow = memo(function ExpandedRow({
  item,
  isActive,
  onFocusItem,
  onBlurItem,
  onSelect,
}: {
  item: TvNavItem;
  isActive: boolean;
  onFocusItem: (id: TvSectionId) => void;
  onBlurItem: () => void;
  onSelect: (id: TvSectionId) => void;
}) {
  const [focused, setFocused] = React.useState(false);
  const highlighted = focused || isActive;

  return (
    <Pressable
      focusable
      accessible
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: isActive }}
      hasTVPreferredFocus={isActive}
      onFocus={() => {
        setFocused(true);
        onFocusItem(item.id);
      }}
      onBlur={() => {
        setFocused(false);
        onBlurItem();
      }}
      onPress={() => onSelect(item.id)}
    >
      {focused ? (
        <LiquidGlassView
          variant="ember"
          borderRadius={radius.pill}
          focused
          contentStyle={styles.expandedRowInner}
        >
          {item.renderIcon(palette.pearlInk, 19)}
          <Text numberOfLines={1} style={[styles.expandedLabel, { color: palette.pearlInk, fontWeight: "800" }]}>
            {item.label}
          </Text>
        </LiquidGlassView>
      ) : (
        <View style={[styles.expandedRowInner, isActive && styles.expandedRowActive]}>
          {item.renderIcon(highlighted ? "#FFFFFF" : palette.textSecondary, 19)}
          <Text
            numberOfLines={1}
            style={[
              styles.expandedLabel,
              { color: isActive ? "#FFFFFF" : palette.textSecondary, fontWeight: isActive ? "700" : "600" },
            ]}
          >
            {item.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  backdropScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 6, 11, 0.56)",
    zIndex: 25,
  },
  railAnchor: {
    position: "absolute",
    left: 20,
    top: 22,
    bottom: 22,
    justifyContent: "center",
    zIndex: 30,
  },
  collapsedCapsule: {
    width: COLLAPSED_RAIL_WIDTH,
  },
  collapsedContent: {
    paddingVertical: 10,
    alignItems: "center",
    gap: 8,
  },
  compactItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  compactItemActive: {
    backgroundColor: palette.pearl,
    shadowColor: "#FFF4EC",
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 6,
  },
  expandedPanel: {
    width: EXPANDED_RAIL_WIDTH,
    maxHeight: "96%",
  },
  expandedContent: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  expandedList: {
    gap: 4,
  },
  expandedRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  expandedRowActive: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderWidth: StyleSheet.hairlineWidth,
  },
  expandedLabel: {
    fontSize: 14.5,
    flex: 1,
  },
});
