import type { VideoPlayer } from "expo-video";

/**
 * Player lifecycle guard.
 *
 * `expo-video` players are `SharedObject`s: `useVideoPlayer` releases them when
 * the component unmounts or when its dependency key changes. Touching a released
 * player from JS produces the exact native crash we shipped:
 *
 *   "The 1st argument cannot be cast to type expo.modules.video.player.VideoPlayer
 *    (received class java.lang.Integer)"
 *   caused by "Cannot use shared object that was already released"
 *
 * The native side receives the object's *reference id*, which has already been
 * freed — so it arrives as a plain integer and the cast fails.
 *
 * Every native touch therefore goes through this guard: async work that was
 * started before unmount (recovery, retry, quality switch, next episode, the
 * buffering watchdog, caption loading) is silently dropped instead of crashing
 * the whole app.
 *
 * This module is pure and framework-free so it can be unit-tested directly.
 */

export class PlayerGuard {
  private released = false;
  private generation = 0;

  /** Mark the player as gone. Idempotent. Called from the unmount effect. */
  release(): void {
    this.released = true;
    this.generation += 1;
  }

  /** True once the player has been released and must not be touched. */
  get isReleased(): boolean {
    return this.released;
  }

  /**
   * Token for the current player generation. Capture it before awaiting; if it
   * has changed when the await resolves, the player was replaced or released
   * and the result must be discarded.
   */
  token(): number {
    return this.generation;
  }

  /** True when work started at `token` is still valid. */
  isCurrent(token: number): boolean {
    return !this.released && token === this.generation;
  }

  /**
   * Run `fn` against the player, but only if it is still alive and (optionally)
   * the caller's generation token is still current. Returns `undefined` when the
   * call was skipped — callers must treat that as "no result", never as success.
   */
  use<T>(fn: (player: VideoPlayer) => T, player: VideoPlayer | null, token?: number): T | undefined {
    if (this.released || !player) return undefined;
    if (token !== undefined && token !== this.generation) return undefined;
    try {
      return fn(player);
    } catch {
      // A native throw here means the object died under us. Mark it released so
      // the rest of the screen stops trying, and never propagate the crash.
      this.released = true;
      this.generation += 1;
      return undefined;
    }
  }
}

/**
 * Reset policy for the player screen when the route switches to a different
 * episode on a reused screen instance. Returning `"replace"` means: keep the
 * player object, swap the source with `replaceAsync`. We never recreate the
 * player mid-screen — that is what detaches event subscriptions and triggers the
 * released-object crash.
 */
export function resetAction(previousKey: string | null, nextKey: string): "none" | "replace" {
  return previousKey === nextKey ? "none" : "replace";
}

/** Stable identity key for an episode/movie selection. */
export function episodeKeyOf(parts: {
  subjectId: string;
  detailPath: string;
  season: number;
  episode: number;
}): string {
  return `${parts.subjectId}|${parts.detailPath}|${parts.season}|${parts.episode}`;
}
