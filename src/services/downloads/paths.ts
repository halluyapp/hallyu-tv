/** Pure download path helpers — no vendor imports, so they are unit-testable. */

export const DOWNLOADS_DIR = "downloads/";

/** Map a registry-relative path ("downloads/x.mp4") to an absolute file URI. */
export function absolutePath(baseDir: string, relative: string): string {
  const stripped = relative.startsWith(DOWNLOADS_DIR) ? relative.slice(DOWNLOADS_DIR.length) : relative;
  return `${baseDir}${stripped}`;
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9-_ .]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 64) || "title"
  );
}

/**
 * Registry-relative part/final paths. The subject id is included so two
 * different titles with the same display name cannot overwrite each other.
 */
export function jobPaths(subjectId: string, title: string, season: number, episode: number): { partPath: string; finalPath: string } {
  const safeId = subjectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "title";
  const base = `${DOWNLOADS_DIR}${safeId}_${sanitizeFilename(title)}_${season}_${episode}`;
  return { partPath: `${base}.part`, finalPath: `${base}.mp4` };
}

/** Ensure a local playback URI has a scheme (native engine returns bare paths). */
export function localFileUri(path: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(path) ? path : `file://${path}`;
}
