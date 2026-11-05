export function parseSemver(v: string): number[] {
  return v
    .replace(/^v/, "")
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
}

export function isNewerVersion(current: string, latest: string): boolean {
  const c = parseSemver(current);
  const l = parseSemver(latest);
  const len = Math.max(c.length, l.length);
  for (let i = 0; i < len; i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

/** Strips `file://` prefix safely so Kotlin `java.io.File(path)` can open cached APKs. */
export function stripFileScheme(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  try {
    return decodeURIComponent(uri.replace(/^file:\/\//, ""));
  } catch {
    return uri.replace(/^file:\/\//, "");
  }
}
