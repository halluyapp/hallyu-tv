import { useState } from "react";
import { Captions, Download, Film, HardDrive, SlidersHorizontal, Trash2, Volume2, VolumeX } from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/config/branding";
import { Poster, initialsFor } from "@/web/components/Poster";
import { useLibrary } from "@/web/services/library";
import {
  usePreferences,
  type CardDensity,
  type DownloadQualityPref,
  type QualityPref,
} from "@/web/services/preferences";
import { useSound } from "@/web/services/sound";

const DENSITY_OPTIONS: { key: CardDensity; label: string; hint: string }[] = [
  { key: "comfortable", label: "Comfortable", hint: "Standard widescreen poster cards" },
  { key: "compact", label: "Compact", hint: "Higher density grid & shelf cards" },
];

const STREAM_QUALITIES: QualityPref[] = ["auto", "360p", "480p", "720p", "1080p"];
const DOWNLOAD_QUALITIES: { key: DownloadQualityPref; label: string }[] = [
  { key: "ask", label: "Ask every time" },
  { key: "360p", label: "360p (Data Saver)" },
  { key: "480p", label: "480p (Standard)" },
  { key: "720p", label: "720p (HD)" },
  { key: "1080p", label: "1080p (Full HD)" },
];

const SUBTITLE_LANGS = [
  { key: "en", label: "English" },
  { key: "es", label: "Spanish" },
  { key: "fr", label: "French" },
  { key: "ar", label: "Arabic" },
  { key: "id", label: "Indonesian" },
  { key: "ko", label: "Korean" },
  { key: "off", label: "Off by default" },
];

interface MySpaceScreenProps {
  onOpenTitle: (detailPath: string, subjectId: string) => void;
}

export function MySpaceScreen({ onOpenTitle }: MySpaceScreenProps) {
  const { watchlist, progress } = useLibrary();
  const { enabled: soundEnabled, setEnabled: setSoundEnabled, volume, setVolume, play } = useSound();
  const { prefs, updatePrefs } = usePreferences();
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  const handleCleanCache = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("hallyu.cache.") || k.startsWith("hallyu.cues."))) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) localStorage.removeItem(k);
      play("confirm");
      setCacheNotice(`Cleared ${keysToRemove.length} cached catalogue/subtitle entries.`);
      window.setTimeout(() => setCacheNotice(null), 3500);
    } catch {
      setCacheNotice("Could not clear temporary cache.");
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-12 max-w-4xl mx-auto space-y-6">
      {/* Profile Banner */}
      <div className="glass-panel-bright rounded-2xl p-4 sm:p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full ember-gradient p-[2px] shrink-0">
          <div className="w-full h-full rounded-full bg-[#0E141E] flex items-center justify-center">
            <HardDrive className="w-5 h-5 text-[#FF8256]" />
          </div>
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-white">{APP_NAME} Web</h1>
          <p className="text-xs text-[#6B7787] truncate">Local Device Library &amp; Offline Vault</p>
        </div>
      </div>

      {/* Stats Card */}
      <div className="glass-panel rounded-2xl py-4 grid grid-cols-3 divide-x divide-white/10 text-center">
        <div>
          <p className="text-xl font-extrabold text-[#FF8256]">{watchlist.length}</p>
          <p className="text-xs font-semibold text-[#A8B4C4] mt-0.5">Watchlist</p>
        </div>
        <div>
          <p className="text-xl font-extrabold text-[#FF8256]">{progress.length}</p>
          <p className="text-xs font-semibold text-[#A8B4C4] mt-0.5">In Progress</p>
        </div>
        <button
          type="button"
          onClick={handleCleanCache}
          className="flex flex-col items-center justify-center hover:text-white text-[#A8B4C4] transition"
        >
          <Trash2 className="w-5 h-5 mb-1" />
          <span className="text-xs font-semibold">Clean Cache</span>
        </button>
      </div>

      {cacheNotice ? (
        <p className="text-xs font-semibold text-emerald-400 text-center">{cacheNotice}</p>
      ) : null}

      {/* Saved to Watchlist */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Saved to Watchlist</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#FF5E3A]/15 text-[#FF8256]">
            {watchlist.length}
          </span>
        </div>
        {watchlist.length === 0 ? (
          <p className="text-xs text-[#6B7787]">
            No saved titles yet. Tap the bookmark icon on any movie or series to save it here.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {watchlist.map((item) => (
              <button
                key={item.subject_id}
                type="button"
                onClick={() => {
                  play("tap");
                  if (item.detail_path) onOpenTitle(item.detail_path, item.subject_id);
                }}
                className="w-28 shrink-0 text-left group"
              >
                <div className="aspect-[2/3] rounded-xl overflow-hidden border border-white/10 group-hover:border-[#FF8256]">
                  <Poster
                    uri={item.poster_url}
                    alt={item.title}
                    initials={initialsFor(item.title)}
                    width={220}
                    className="w-full h-full"
                  />
                </div>
                <p className="mt-1.5 text-xs font-semibold text-white truncate">{item.title}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Watching History */}
      {progress.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Watching History</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#FF5E3A]/15 text-[#FF8256]">
              {progress.length}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {progress.map((row) => (
              <button
                key={`${row.subject_id}-${row.season_number}-${row.episode_number}`}
                type="button"
                onClick={() => {
                  play("tap");
                  if (row.detail_path) onOpenTitle(row.detail_path, row.subject_id);
                }}
                className="w-28 shrink-0 text-left group"
              >
                <div className="aspect-[2/3] rounded-xl overflow-hidden border border-white/10 group-hover:border-[#FF8256]">
                  <Poster
                    uri={row.poster_url}
                    alt={row.title}
                    initials={initialsFor(row.title)}
                    width={220}
                    className="w-full h-full"
                  />
                </div>
                <p className="mt-1.5 text-xs font-semibold text-white truncate">{row.title}</p>
                <p className="text-[11px] text-[#6B7787]">
                  {row.media_type === "series" ? `S${row.season_number ?? 1} · E${row.episode_number ?? 1}` : "Movie"}
                </p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Playback & Download Preferences */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[#FF8256]" />
          Playback &amp; Downloads
        </h2>
        <div className="glass-panel rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Film className="w-4 h-4 text-[#A8B4C4]" />
              <div>
                <p className="text-sm font-medium text-white">Preferred Streaming Quality</p>
                <p className="text-xs text-[#6B7787]">Default resolution when starting playback</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STREAM_QUALITIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => updatePrefs({ defaultStreamQuality: q })}
                  className={`px-3 py-1 rounded-full text-xs font-bold capitalize border transition ${
                    prefs.defaultStreamQuality === q
                      ? "bg-[#FF5E3A] border-[#FF8256] text-white"
                      : "bg-white/5 border-white/10 text-[#A8B4C4] hover:text-white"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/8">
            <div className="flex items-center gap-2.5">
              <Download className="w-4 h-4 text-[#A8B4C4]" />
              <div>
                <p className="text-sm font-medium text-white">Default Download Quality</p>
                <p className="text-xs text-[#6B7787]">Quality used for quick &amp; batch downloads</p>
              </div>
            </div>
            <select
              aria-label="Default download quality"
              value={prefs.defaultDownloadQuality}
              onChange={(e) => updatePrefs({ defaultDownloadQuality: e.target.value as DownloadQualityPref })}
              className="px-3 py-1.5 rounded-xl bg-[#0E141E] border border-white/15 text-xs font-semibold text-white"
            >
              {DOWNLOAD_QUALITIES.map((dq) => (
                <option key={dq.key} value={dq.key}>
                  {dq.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/8">
            <div className="flex items-center gap-2.5">
              <Captions className="w-4 h-4 text-[#A8B4C4]" />
              <div>
                <p className="text-sm font-medium text-white">Preferred Subtitle Language</p>
                <p className="text-xs text-[#6B7787]">Auto-selected &amp; bundled with offline downloads</p>
              </div>
            </div>
            <select
              aria-label="Preferred subtitle language"
              value={prefs.defaultSubtitleLang}
              onChange={(e) => updatePrefs({ defaultSubtitleLang: e.target.value })}
              className="px-3 py-1.5 rounded-xl bg-[#0E141E] border border-white/15 text-xs font-semibold text-white"
            >
              {SUBTITLE_LANGS.map((sl) => (
                <option key={sl.key} value={sl.key}>
                  {sl.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-white/8">
            <div>
              <p className="text-sm font-medium text-white">Auto-Play Next Episode</p>
              <p className="text-xs text-[#6B7787]">Countdown to next episode near end credits</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.autoNextEpisode}
              aria-label="Toggle Auto-Play Next Episode"
              onClick={() => updatePrefs({ autoNextEpisode: !prefs.autoNextEpisode })}
              className={`w-12 h-6 rounded-full transition-colors p-0.5 ${
                prefs.autoNextEpisode ? "bg-[#FF5E3A]" : "bg-[#141C2B]"
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                  prefs.autoNextEpisode ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-white/8">
            <div>
              <p className="text-sm font-medium text-white">Delete Watched Offline Episodes</p>
              <p className="text-xs text-[#6B7787]">Remove completed episode after queuing next via Smart Downloads</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.smartDeleteWatched}
              aria-label="Toggle Delete Watched Offline Episodes"
              onClick={() => updatePrefs({ smartDeleteWatched: !prefs.smartDeleteWatched })}
              className={`w-12 h-6 rounded-full transition-colors p-0.5 ${
                prefs.smartDeleteWatched ? "bg-[#FF5E3A]" : "bg-[#141C2B]"
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                  prefs.smartDeleteWatched ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Card Density */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-white">Poster Card Density</h2>
        <div className="glass-panel rounded-2xl p-4 divide-y divide-white/8">
          {DENSITY_OPTIONS.map((opt) => {
            const active = prefs.cardDensity === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  play("tap");
                  updatePrefs({ cardDensity: opt.key });
                }}
                className="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between text-left"
              >
                <div>
                  <p className={`text-sm font-semibold ${active ? "text-[#FF8256]" : "text-white"}`}>{opt.label}</p>
                  <p className="text-xs text-[#6B7787]">{opt.hint}</p>
                </div>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    active ? "border-[#FF8256]" : "border-[#6B7787]"
                  }`}
                >
                  {active ? <span className="w-2.5 h-2.5 rounded-full bg-[#FF8256]" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Interface Audio */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-white">Interface Audio</h2>
        <div className="glass-panel rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-[#FF5E3A]" />
              ) : (
                <VolumeX className="w-5 h-5 text-[#6B7787]" />
              )}
              <span className="text-sm font-medium text-white">Navigation Sound Effects</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              aria-label="Toggle navigation sounds"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) play("confirm");
              }}
              className={`w-12 h-6 rounded-full transition-colors p-0.5 ${
                soundEnabled ? "bg-[#FF5E3A]" : "bg-[#141C2B]"
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                  soundEnabled ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {soundEnabled ? (
            <div className="flex items-center justify-between gap-4 pt-1">
              <label htmlFor="sound-volume-slider" className="text-xs text-[#A8B4C4]">
                Volume: {Math.round(volume * 100)}%
              </label>
              <input
                id="sound-volume-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                onMouseUp={() => play("tap")}
                onTouchEnd={() => play("tap")}
                className="w-1/2 accent-[#FF5E3A]"
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* Architecture Info */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-white">App Info</h2>
        <div className="glass-panel rounded-2xl p-4 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#6B7787]">Edition</span>
            <span className="font-semibold text-white">{APP_NAME} Web ({APP_VERSION})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6B7787]">Storage</span>
            <span className="font-semibold text-white">Local OPFS &amp; IndexedDB Vault</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6B7787]">Streaming Source</span>
            <span className="font-semibold text-white">Zarhosting Catalogue &amp; Stream API</span>
          </div>
        </div>
      </section>
    </div>
  );
}
