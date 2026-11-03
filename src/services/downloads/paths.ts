/**
 * Pure download path helpers — no vendor imports, so they are unit-testable.
 */

export const DOWNLOADS_DIR = "downloads/";

/** Map a registry-relative path ("downloads/x.mp4") to an absolute file URI. */
export function absolutePath(baseDir: string, relative: string): string {
  return `${baseDir}${relative.replace(DOWNLOADS_DIR, "")}`;
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

/** Build the registry-relative part/final paths for a job. */
export function jobPaths(title: string, season: number, episode: number): { partPath: string; finalPath: string } {
  const base = `${DOWNLOADS_DIR}${sanitizeFilename(title)}_${season}_${episode}`;
  return { partPath: `${base}.part`, finalPath: `${base}.mp4` };
}
