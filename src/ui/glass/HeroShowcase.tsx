import { LinearGradient } from "expo-linear-gradient";
import { Check, ChevronLeft, ChevronRight, Play, Plus, Star } from "lucide-react-native";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Poster, initialsFor, prefetchPosterBatch } from "@/components/ui/Poster";
import { palette, radius } from "@/design-system/tokens";
import { loadDetailCached, peekCachedDetail, prefetchDetail } from "@/services/provider/detailCache";
import { curateFeaturedItems } from "@/services/provider/homeCatalogue";
import { useSound } from "@/services/sound/SoundContext";
import type { ProgressRow } from "@/state/LibraryContext";
import type { CatalogueItem, TitleDetail } from "@/types/provider";
import { GlassPillButton } from "@/ui/glass/GlassButton";
import { LiquidGlassView } from "@/ui/glass/LiquidGlassView";

export { curateFeaturedItems };

const HERO_AUTO_CYCLE_MS = 6_200;

interface SharedHeroControllerOptions {
  items: CatalogueItem[];
  screenFocused: boolean;
  onActiveChange?: (item: CatalogueItem | null, detail: TitleDetail | null) => void;
  latestFor: (subjectId: string) => ProgressRow | null;
}

export function useHeroShowcaseController({
  items,
  screenFocused,
  onActiveChange,
}: SharedHeroControllerOptions) {
  const { play } = useSound();
  const [activeIndex, setActiveIndex] = useState(0);
  const [appActive, setAppActive] = useState(true);
  const [resetTick, setResetTick] = useState(0);
  const [activeDetail, setActiveDetail] = useState<TitleDetail | null>(() =>
    items[0]?.slug ? peekCachedDetail(items[0].slug) : null,
  );

  // GPU-only native-driver transition values (zero layout recalculation)
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (activeIndex >= items.length && items.length > 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, items.length]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      setAppActive(st === "active");
    });
    return () => sub.remove();
  }, []);

  const animateSlideIn = useCallback(() => {
    fadeAnim.setValue(0.28);
    scaleAnim.setValue(1.035);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 540,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const goToSlide = useCallback(
    (nextIdx: number, manual = false) => {
      if (items.length === 0) return;
      const wrapped = ((nextIdx % items.length) + items.length) % items.length;
      setActiveIndex((prev) => {
        if (prev === wrapped) return prev;
        if (manual) {
          play("tab", { intensity: 0.35 });
        }
        return wrapped;
      });
      if (manual) {
        setResetTick((t) => t + 1);
      }
      animateSlideIn();
    },
    [animateSlideIn, items.length, play],
  );

  const nudgeTimer = useCallback(() => {
    setResetTick((t) => t + 1);
  }, []);

  // Auto-advance timer across ALL devices while Home is visible and app is foregrounded
  useEffect(() => {
    if (!screenFocused || !appActive || items.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
      animateSlideIn();
    }, HERO_AUTO_CYCLE_MS);
    return () => clearInterval(timer);
  }, [animateSlideIn, appActive, items.length, resetTick, screenFocused]);

  const activeItem = items[activeIndex] ?? items[0] ?? null;
  const nextItem = items.length > 1 ? items[(activeIndex + 1) % items.length] ?? null : null;

  // Instant cached detail lookup + deferred idle pre-warm so visible Home posters get 100% bandwidth first!
  useEffect(() => {
    if (!activeItem?.slug) {
      setActiveDetail(null);
      onActiveChange?.(activeItem, null);
      return;
    }

    const warm = peekCachedDetail(activeItem.slug);
    if (warm) {
      setActiveDetail(warm);
      onActiveChange?.(activeItem, warm);
    } else {
      setActiveDetail(null);
      onActiveChange?.(activeItem, null);
    }

    let cancelled = false;
    const idleTimer = setTimeout(() => {
      loadDetailCached(activeItem.slug)
        .then((d) => {
          if (!cancelled) {
            setActiveDetail(d);
            onActiveChange?.(activeItem, d);
          }
        })
        .catch(() => {});

      if (nextItem) {
        prefetchPosterBatch([nextItem.posterUrl], "hero", 1);
        prefetchDetail(nextItem.slug);
      }
    }, warm ? 250 : 1_100);

    return () => {
      cancelled = true;
      clearTimeout(idleTimer);
    };
  }, [activeItem, nextItem, onActiveChange]);

  return {
    activeIndex,
    activeItem,
    activeDetail,
    fadeAnim,
    scaleAnim,
    goToSlide,
    nudgeTimer,
  };
}

/**
 * 1:1 Mobile Auto-Transitioning Liquid Glass Hero Showcase (`mobile-01-home.png`):
 * - Smoothly transitions between top 6 featured dramas every 6.2s
 * - Supports horizontal finger-swipe left/right + tappable Liquid Glass pill dots
 */
export const MobileHeroShowcase = memo(function MobileHeroShowcase({
  items,
  cardHeight,
  screenFocused,
  inWatchlist,
  latestFor,
  onWatchNow,
  onOpenDetails,
  onToggleWatchlist,
  onActivePosterChange,
}: {
  items: CatalogueItem[];
  cardHeight: number;
  screenFocused: boolean;
  inWatchlist: (subjectId: string) => boolean;
  latestFor: (subjectId: string) => ProgressRow | null;
  onWatchNow: (item: CatalogueItem, detail: TitleDetail | null) => void;
  onOpenDetails: (item: CatalogueItem) => void;
  onToggleWatchlist: (item: CatalogueItem) => void;
  onActivePosterChange?: (uri: string | null) => void;
}) {
  const handleActiveChange = useCallback(
    (item: CatalogueItem | null) => {
      onActivePosterChange?.(item?.posterUrl ?? null);
    },
    [onActivePosterChange],
  );

  const { activeIndex, activeItem, activeDetail, fadeAnim, scaleAnim, goToSlide } =
    useHeroShowcaseController({
      items,
      screenFocused,
      onActiveChange: handleActiveChange,
      latestFor,
    });

  const activeIdxRef = useRef(activeIndex);
  activeIdxRef.current = activeIndex;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -36) {
            goToSlide(activeIdxRef.current + 1, true);
          } else if (g.dx > 36) {
            goToSlide(activeIdxRef.current - 1, true);
          }
        },
      }),
    [goToSlide],
  );

  if (!activeItem) return null;

  const saved = inWatchlist(activeItem.subjectId);
  const resume = latestFor(activeItem.subjectId);
  const ratingVal = activeDetail?.rating ?? activeItem.rating;
  const parsedRating = ratingVal ? parseFloat(ratingVal) : NaN;
  const heroRating = Number.isFinite(parsedRating) && parsedRating > 0 ? parsedRating.toFixed(1) : null;
  const yearText = activeItem.year ?? activeDetail?.releaseDate?.slice(0, 4) ?? null;

  const watchLabel =
    resume && !resume.completed
      ? activeItem.mediaType === "series"
        ? `Resume S${resume.season_number ?? 1}·E${resume.episode_number ?? 1}`
        : "Resume"
      : "Watch Now";

  return (
    <View style={styles.mobileOuter} {...panResponder.panHandlers}>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Featured ${activeIndex + 1} of ${items.length}: ${activeItem.name}`}
        onPress={() => onOpenDetails(activeItem)}
      >
        <View style={[styles.mobileCard, { height: cardHeight }]}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
            ]}
          >
            <Poster
              uri={activeItem.posterUrl}
              initials={initialsFor(activeItem.name)}
              kind="hero"
              priority="high"
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={["rgba(5, 8, 14, 0.22)", "rgba(5, 8, 14, 0.08)", "rgba(5, 8, 14, 0.72)"]}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* Top Floating Featured Badge + Sculpted Liquid Glass Pagination Capsule */}
          {items.length > 1 ? (
            <View style={styles.mobileTopBar}>
              <View style={styles.featuredPill}>
                <View style={styles.liveCoralDot} />
                <Text style={styles.featuredPillText}>Featured · {activeIndex + 1}/{items.length}</Text>
              </View>

              <View style={styles.dotsCapsule}>
                {items.map((slide, idx) => {
                  const isCurrent = idx === activeIndex;
                  return (
                    <Pressable
                      key={slide.subjectId}
                      hitSlop={8}
                      accessibilityLabel={`Featured slide ${idx + 1}`}
                      onPress={() => goToSlide(idx, true)}
                      style={[styles.dotBase, isCurrent ? styles.dotActive : styles.dotIdle]}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Bottom Embedded Frosted Liquid Glass Overlay Card (`mobile-01-home.png`) */}
          <View style={styles.mobileGlassPad}>
            <LiquidGlassView
              variant="frosted"
              borderRadius={22}
              blurIntensity={42}
              contentStyle={styles.mobileGlassInner}
            >
              <Animated.View style={{ opacity: fadeAnim, gap: 8 }}>
                <View style={styles.metaRow}>
                  <View style={styles.heroChip}>
                    <Text style={styles.heroChipText}>
                      {activeItem.mediaType === "series" ? "K-Drama & Series" : "Feature Film"}
                    </Text>
                  </View>
                  {heroRating ? (
                    <View style={styles.heroChip}>
                      <Star size={11} color={palette.gold} fill={palette.gold} />
                      <Text style={[styles.heroChipText, { color: "#FFF7E0" }]}>{heroRating}</Text>
                    </View>
                  ) : null}
                  {yearText ? (
                    <View style={styles.heroChip}>
                      <Text style={styles.heroChipText}>{yearText}</Text>
                    </View>
                  ) : null}
                </View>

                <Text numberOfLines={2} style={styles.mobileHeroTitle}>
                  {activeItem.name.toUpperCase()}
                </Text>
              </Animated.View>

              <View style={styles.mobileButtonsRow}>
                <GlassPillButton
                  label={watchLabel}
                  icon={<Play size={14} color="#FFFFFF" fill="#FFFFFF" />}
                  variant="primary"
                  size="md"
                  onPress={() => onWatchNow(activeItem, activeDetail)}
                  style={{ flex: 1 }}
                />
                <GlassPillButton
                  label={saved ? "Saved" : "+ My List"}
                  icon={saved ? <Check size={14} color="#FFFFFF" /> : <Plus size={14} color="#FFFFFF" />}
                  variant="secondary"
                  size="md"
                  onPress={() => onToggleWatchlist(activeItem)}
                  style={{ flex: 1 }}
                />
              </View>
            </LiquidGlassView>
          </View>
        </View>
      </Pressable>
    </View>
  );
});

/**
 * 1:1 TV 10-Foot Auto-Transitioning Cinema Showcase (`tv-01-home.png`):
 * - Cycles smoothly through top 6 dramas every 6.2s even while Watch Now holds default TV focus!
 * - Resets timer on D-pad movement so it never switches mid-click, plus focusable < / > & slide pills!
 */
export const TvHeroShowcase = memo(function TvHeroShowcase({
  items,
  screenFocused,
  inWatchlist,
  latestFor,
  preferInitialFocus = true,
  onWatchNow,
  onOpenDetails,
  onToggleWatchlist,
  onHeroBackdropChange,
}: {
  items: CatalogueItem[];
  screenFocused: boolean;
  inWatchlist: (subjectId: string) => boolean;
  latestFor: (subjectId: string) => ProgressRow | null;
  preferInitialFocus?: boolean;
  onWatchNow: (item: CatalogueItem, detail: TitleDetail | null) => void;
  onOpenDetails: (item: CatalogueItem) => void;
  onToggleWatchlist: (item: CatalogueItem) => void;
  onHeroBackdropChange?: (uri: string | null) => void;
}) {
  const handleActiveChange = useCallback(
    (item: CatalogueItem | null, detail: TitleDetail | null) => {
      onHeroBackdropChange?.(detail?.backdropUrl ?? item?.posterUrl ?? null);
    },
    [onHeroBackdropChange],
  );

  const { activeIndex, activeItem, activeDetail, fadeAnim, goToSlide, nudgeTimer } =
    useHeroShowcaseController({
      items,
      screenFocused,
      onActiveChange: handleActiveChange,
      latestFor,
    });

  if (!activeItem) return null;

  const saved = inWatchlist(activeItem.subjectId);
  const resume = latestFor(activeItem.subjectId);
  const rawRating = activeDetail?.rating ?? activeItem.rating;
  const parsedRating = rawRating ? parseFloat(rawRating) : NaN;
  const heroRating = Number.isFinite(parsedRating) && parsedRating > 0 ? parsedRating.toFixed(1) : null;
  const yearText = activeItem.year ?? activeDetail?.releaseDate?.slice(0, 4) ?? null;

  const ctaLabel =
    resume && !resume.completed
      ? resume.media_type === "series"
        ? `Resume S${resume.season_number ?? 1} · E${resume.episode_number ?? 1}`
        : "Resume Movie"
      : activeItem.mediaType === "series"
        ? "Play S1 · E1"
        : "Watch Now";

  return (
    <View style={styles.tvHeroStage}>
      <Animated.View style={{ opacity: fadeAnim, gap: 11 }}>
        <View style={styles.metaRow}>
          <View style={styles.tvMetaChip}>
            <View style={styles.liveCoralDot} />
            <Text style={styles.tvMetaText}>
              {activeItem.mediaType === "series" ? "K-Drama & Series" : "Feature Film"}
            </Text>
          </View>
          {heroRating ? (
            <View style={styles.tvMetaChip}>
              <Star size={12} color={palette.gold} fill={palette.gold} />
              <Text style={[styles.tvMetaText, { color: "#FFF7E0" }]}>{heroRating}</Text>
            </View>
          ) : null}
          {yearText ? (
            <View style={styles.tvMetaChip}>
              <Text style={styles.tvMetaText}>{yearText}</Text>
            </View>
          ) : null}
          <View style={styles.tvMetaChip}>
            <Text style={styles.tvMetaText}>HD</Text>
          </View>
        </View>

        <Text numberOfLines={2} style={styles.tvHeroTitle}>
          {activeItem.name.toUpperCase()}
        </Text>

        <Text numberOfLines={2} style={styles.tvHeroSynopsis}>
          {activeDetail?.description ??
            "Stream full-length episodes and cinema in crisp HD with multi-language subtitles."}
        </Text>
      </Animated.View>

      <View style={styles.tvCtaRow}>
        <GlassPillButton
          label={ctaLabel}
          icon={<Play size={16} color="#FFFFFF" fill="#FFFFFF" />}
          variant="primary"
          size="tv"
          hasTVPreferredFocus={preferInitialFocus}
          onFocus={nudgeTimer}
          onPress={() => onWatchNow(activeItem, activeDetail)}
        />
        <GlassPillButton
          label={saved ? "In My List" : "+ My List"}
          icon={saved ? <Check size={16} color="#FFFFFF" /> : <Plus size={16} color="#FFFFFF" />}
          variant="secondary"
          size="tv"
          onFocus={nudgeTimer}
          onPress={() => {
            nudgeTimer();
            onToggleWatchlist(activeItem);
          }}
        />
        <GlassPillButton
          label="Details & Episodes"
          variant="secondary"
          size="tv"
          onFocus={nudgeTimer}
          onPress={() => onOpenDetails(activeItem)}
        />
      </View>

      {/* 10-foot Liquid Glass Featured Drama Switcher Pills */}
      {items.length > 1 ? (
        <View style={styles.tvSlideBar}>
          <TvStepButton
            label="Previous featured title"
            icon={<ChevronLeft size={15} color="#FFFFFF" />}
            onPress={() => goToSlide(activeIndex - 1, true)}
            onFocus={nudgeTimer}
          />
          <View style={styles.tvDotsRow}>
            {items.map((slide, idx) => {
              const active = idx === activeIndex;
              return (
                <TvSlideDot
                  key={slide.subjectId}
                  index={idx}
                  title={slide.name}
                  active={active}
                  onSelect={() => goToSlide(idx, true)}
                  onFocus={nudgeTimer}
                />
              );
            })}
          </View>
          <TvStepButton
            label="Next featured title"
            icon={<ChevronRight size={15} color="#FFFFFF" />}
            onPress={() => goToSlide(activeIndex + 1, true)}
            onFocus={nudgeTimer}
          />
          <Text numberOfLines={1} style={styles.tvNextHint}>
            Up next: {items[(activeIndex + 1) % items.length]?.name}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const TvStepButton = memo(function TvStepButton({
  label,
  icon,
  onPress,
  onFocus,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  onFocus: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      focusable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.tvStepBtn, focused && styles.tvStepBtnFocused]}
    >
      {icon}
    </Pressable>
  );
});

const TvSlideDot = memo(function TvSlideDot({
  index,
  title,
  active,
  onSelect,
  onFocus,
}: {
  index: number;
  title: string;
  active: boolean;
  onSelect: () => void;
  onFocus: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      focusable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Featured ${index + 1}: ${title}`}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      onPress={onSelect}
      style={[
        styles.dotBase,
        active ? styles.dotActiveTv : styles.dotIdle,
        focused && styles.dotFocusedTv,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  mobileOuter: {
    paddingHorizontal: 18,
  },
  mobileCard: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: palette.surfaceRaised,
    borderColor: palette.glassStrokeBright,
    borderWidth: 1,
    justifyContent: "space-between",
  },
  mobileTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  featuredPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(8, 12, 20, 0.64)",
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveCoralDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 4,
    backgroundColor: palette.accentBright,
  },
  featuredPillText: {
    color: "#F6F8FC",
    fontSize: 11,
    fontWeight: "700",
  },
  dotsCapsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(8, 12, 20, 0.64)",
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  dotBase: {
    height: 6,
    borderRadius: 999,
  },
  dotActive: {
    width: 22,
    backgroundColor: palette.accentBright,
  },
  dotActiveTv: {
    width: 26,
    backgroundColor: palette.pearl,
  },
  dotFocusedTv: {
    backgroundColor: palette.accentBright,
    transform: [{ scaleY: 1.4 }],
  },
  dotIdle: {
    width: 6,
    backgroundColor: "rgba(255, 255, 255, 0.36)",
  },
  mobileGlassPad: {
    padding: 12,
    marginTop: "auto",
  },
  mobileGlassInner: {
    padding: 15,
    gap: 10,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(10, 14, 22, 0.58)",
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroChipText: {
    color: "#F4F7FB",
    fontSize: 11,
    fontWeight: "700",
  },
  mobileHeroTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  mobileButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  tvHeroStage: {
    maxWidth: "60%",
    minHeight: 220,
    justifyContent: "flex-end",
    marginBottom: 24,
    gap: 13,
  },
  tvMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(18, 25, 38, 0.72)",
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tvMetaText: {
    color: "#F3F6FA",
    fontSize: 12,
    fontWeight: "700",
  },
  tvHeroTitle: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -0.9,
    lineHeight: 43,
  },
  tvHeroSynopsis: {
    color: palette.textSecondary,
    fontSize: 14.5,
    lineHeight: 21,
  },
  tvCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 2,
  },
  tvSlideBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  tvStepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tvStepBtnFocused: {
    backgroundColor: palette.accent,
    borderColor: "#FFFFFF",
    transform: [{ scale: 1.12 }],
  },
  tvDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tvNextHint: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
    maxWidth: 220,
  },
});
