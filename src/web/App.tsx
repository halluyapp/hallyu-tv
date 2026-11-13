import { Component, Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from "react";
import type { WorldKey } from "@/services/catalogue/worlds";
import { AmbientGlow } from "./components/AmbientGlow";
import { AppShell, type TabKey } from "./components/AppShell";
import { SkeletonRail } from "./components/States";
import type { PlaybackLaunchParams } from "./screens/DetailsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { webDownloadManager } from "./services/downloads";
import { LibraryProvider } from "./services/library";
import { PreferencesProvider } from "./services/preferences";
import { buildRouteUrl, parseRoute } from "./services/routing";
import { SoundProvider } from "./services/sound";
import { CatalogueProvider } from "./state/catalogueContext";

const DiscoverScreen = lazy(() => import("./screens/DiscoverScreen").then((m) => ({ default: m.DiscoverScreen })));
const DownloadsScreen = lazy(() => import("./screens/DownloadsScreen").then((m) => ({ default: m.DownloadsScreen })));
const MySpaceScreen = lazy(() => import("./screens/MySpaceScreen").then((m) => ({ default: m.MySpaceScreen })));
const DetailsScreen = lazy(() => import("./screens/DetailsScreen").then((m) => ({ default: m.DetailsScreen })));
const PlayerScreen = lazy(() => import("./screens/PlayerScreen").then((m) => ({ default: m.PlayerScreen })));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#04060A] text-white flex flex-col items-center justify-center p-8 text-center gap-3">
          <h1 className="text-xl font-extrabold">Hallyu TV hit a problem</h1>
          <p className="text-sm text-[#A8B4C4] max-w-md">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-2 px-5 py-2.5 rounded-full ember-gradient text-white text-sm font-bold"
          >
            Restart app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScreenFallback() {
  return (
    <div className="pt-4">
      <SkeletonRail count={5} />
    </div>
  );
}

function HallyuAppContent() {
  const initialRoute = typeof window !== "undefined" ? parseRoute(window.location.pathname, window.location.search) : parseRoute("/", "");

  const [activeTab, setActiveTab] = useState<TabKey>(initialRoute.tab);
  const [selectedDetailPath, setSelectedDetailPath] = useState<string | null>(initialRoute.detailPath);
  const [playerLaunch, setPlayerLaunch] = useState<PlaybackLaunchParams | null>(null);
  const [exploreWorld, setExploreWorld] = useState<WorldKey>(initialRoute.world);
  const [exploreGenre, setExploreGenre] = useState<string | null>(initialRoute.genre);
  const [exploreQuery, setExploreQuery] = useState<string>(initialRoute.query);
  const [focusSearchTrigger, setFocusSearchTrigger] = useState(0);
  const [activeDownloads, setActiveDownloads] = useState(0);

  const pushRoute = useCallback(
    (next: { tab: TabKey; detailPath: string | null; world?: WorldKey; genre?: string | null; query?: string }) => {
      if (typeof window === "undefined") return;
      const targetUrl = buildRouteUrl({
        tab: next.tab,
        detailPath: next.detailPath,
        world: next.world ?? "all",
        genre: next.genre ?? null,
        query: next.query ?? "",
      });
      if (window.location.pathname + window.location.search !== targetUrl) {
        window.history.pushState({ playerOpen: false }, "", targetUrl);
      }
    },
    [],
  );

  // Sync Browser / Android hardware Back button seamlessly across Tabs, Details, and Player.
  useEffect(() => {
    const onPopState = () => {
      if (playerLaunch) {
        setPlayerLaunch(null);
      }
      const parsed = parseRoute(window.location.pathname, window.location.search);
      setActiveTab(parsed.tab);
      setSelectedDetailPath(parsed.detailPath);
      setExploreWorld(parsed.world);
      setExploreGenre(parsed.genre);
      setExploreQuery(parsed.query);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [playerLaunch]);

  useEffect(() => {
    return webDownloadManager.subscribe((jobs) => {
      setActiveDownloads(
        jobs.filter((j) => j.state === "downloading" || j.state === "queued" || j.state === "connecting").length,
      );
    });
  }, []);

  const openTitle = useCallback(
    (detailPath: string) => {
      setSelectedDetailPath(detailPath);
      pushRoute({ tab: activeTab, detailPath, world: exploreWorld, genre: exploreGenre, query: exploreQuery });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [activeTab, exploreWorld, exploreGenre, exploreQuery, pushRoute],
  );

  const browseWorld = useCallback(
    (world: WorldKey, genre: string | null) => {
      setSelectedDetailPath(null);
      setExploreWorld(world);
      setExploreGenre(genre);
      setExploreQuery("");
      setActiveTab("explore");
      pushRoute({ tab: "explore", detailPath: null, world, genre, query: "" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [pushRoute],
  );

  const selectTab = useCallback(
    (tab: TabKey) => {
      setSelectedDetailPath(null);
      setActiveTab(tab);
      pushRoute({ tab, detailPath: null, world: exploreWorld, genre: exploreGenre, query: exploreQuery });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [exploreWorld, exploreGenre, exploreQuery, pushRoute],
  );

  const launchPlayer = useCallback((params: PlaybackLaunchParams) => {
    setPlayerLaunch(params);
    if (typeof window !== "undefined") {
      window.history.pushState({ playerOpen: true }, "", window.location.href);
    }
  }, []);

  const closePlayer = useCallback(() => {
    setPlayerLaunch(null);
    if (typeof window !== "undefined" && window.history.state?.playerOpen) {
      window.history.back();
    }
  }, []);

  return (
    <>
      <AmbientGlow />
      <AppShell
        activeTab={activeTab}
        onSelectTab={selectTab}
        onQuickSearch={() => {
          setSelectedDetailPath(null);
          setExploreWorld("all");
          setExploreGenre(null);
          setExploreQuery("");
          setActiveTab("explore");
          pushRoute({ tab: "explore", detailPath: null, world: "all", genre: null, query: "" });
          setFocusSearchTrigger((c) => c + 1);
        }}
        downloadCount={activeDownloads}
      >
        <Suspense fallback={<ScreenFallback />}>
          {selectedDetailPath ? (
            <DetailsScreen
              detailPath={selectedDetailPath}
              onBack={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  window.history.back();
                } else {
                  setSelectedDetailPath(null);
                  pushRoute({ tab: activeTab, detailPath: null });
                }
              }}
              onPlay={launchPlayer}
              onGoDownloads={() => selectTab("downloads")}
            />
          ) : activeTab === "home" ? (
            <HomeScreen onOpenTitle={openTitle} onBrowseWorld={browseWorld} onPlay={launchPlayer} />
          ) : activeTab === "explore" ? (
            <DiscoverScreen
              initialWorld={exploreWorld}
              initialGenre={exploreGenre}
              initialQuery={exploreQuery}
              focusSearchTrigger={focusSearchTrigger}
              onOpenTitle={openTitle}
            />
          ) : activeTab === "downloads" ? (
            <DownloadsScreen onPlayOffline={launchPlayer} onExplore={() => selectTab("explore")} />
          ) : (
            <MySpaceScreen onOpenTitle={openTitle} />
          )}
        </Suspense>
      </AppShell>

      {playerLaunch ? (
        <Suspense fallback={null}>
          <PlayerScreen
            launch={playerLaunch}
            onClose={closePlayer}
            onReplaceLaunch={(next) => setPlayerLaunch(next)}
          />
        </Suspense>
      ) : null}
    </>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <PreferencesProvider>
        <SoundProvider>
          <LibraryProvider>
            <CatalogueProvider>
              <HallyuAppContent />
            </CatalogueProvider>
          </LibraryProvider>
        </SoundProvider>
      </PreferencesProvider>
    </ErrorBoundary>
  );
}
