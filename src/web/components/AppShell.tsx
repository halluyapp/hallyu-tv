import { type ReactNode } from "react";
import { Compass, Download, Home, Search, User, Volume2, VolumeX } from "lucide-react";
import { APP_NAME } from "@/config/branding";
import { useSound } from "@/web/services/sound";

export type TabKey = "home" | "explore" | "downloads" | "myspace";

interface AppShellProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  onQuickSearch: () => void;
  downloadCount?: number;
  children: ReactNode;
}

const NAV_ITEMS: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "explore", label: "Explore", icon: Compass },
  { key: "downloads", label: "Downloads", icon: Download },
  { key: "myspace", label: "My Space", icon: User },
];

export function AppShell({ activeTab, onSelectTab, onQuickSearch, downloadCount = 0, children }: AppShellProps) {
  const { enabled: soundEnabled, setEnabled: setSoundEnabled, play } = useSound();

  return (
    <div className="min-h-screen bg-[#04060A] text-white relative flex flex-col">
      {/* Sticky Obsidian Glass Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#070A10]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              play("tab");
              onSelectTab("home");
            }}
            className="flex items-center gap-2.5 text-left shrink-0"
            aria-label={`${APP_NAME} Home`}
          >
            <span className="w-3 h-3 rounded-full ember-gradient shadow-[0_0_12px_rgba(255,94,58,0.7)]" />
            <span className="text-lg sm:text-xl font-extrabold tracking-tight text-white">{APP_NAME}</span>
          </button>

          {/* Desktop Navigation Tabs */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    play("tab");
                    onSelectTab(item.key);
                  }}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${
                    active
                      ? "bg-[#FF5E3A]/15 text-[#FF8256] border border-[#FF5E3A]/40"
                      : "text-[#A8B4C4] hover:text-white hover:bg-white/6 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.key === "downloads" && downloadCount > 0 ? (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#FF5E3A] text-white">
                      {downloadCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) play("confirm");
              }}
              aria-label={soundEnabled ? "Mute interface sounds" : "Unmute interface sounds"}
              title={soundEnabled ? "UI audio on" : "UI audio muted"}
              className="w-9 h-9 rounded-full bg-white/6 hover:bg-white/12 border border-white/10 flex items-center justify-center text-[#A8B4C4] hover:text-white transition"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-[#FF8256]" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                play("tap");
                onQuickSearch();
              }}
              aria-label="Search films and series"
              className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/8 hover:bg-white/12 border border-white/15 text-xs sm:text-sm text-[#A8B4C4] hover:text-white transition min-w-[140px] sm:min-w-[220px]"
            >
              <Search className="w-4 h-4 text-[#A8B4C4] shrink-0" />
              <span className="truncate">Search films &amp; series</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto pb-24 md:pb-12 pt-4">
        {children}
      </main>

      {/* Mobile Floating Bottom Navigation Dock */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-3 inset-x-3 z-40 bg-[#0D131D]/92 backdrop-blur-lg border border-white/15 rounded-[26px] px-2 py-1.5 flex items-center justify-around shadow-[0_12px_36px_rgba(0,0,0,0.75)]"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                play("tab");
                onSelectTab(item.key);
              }}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-2xl transition ${
                active ? "text-[#FF8256]" : "text-[#A8B4C4]"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-bold">{item.label}</span>
              {item.key === "downloads" && downloadCount > 0 ? (
                <span className="absolute top-1 right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-[#FF5E3A] text-white text-[9px] font-extrabold flex items-center justify-center">
                  {downloadCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
