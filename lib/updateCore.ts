// "A newer version is out": compares when this image was built with when the Docker Hub image was last pushed.
// The same in every app. The only outside request is to Docker Hub, once a day, and it sends nothing about you.
import fs from "fs";

export type UpdateInfo = { available: boolean; builtAt: string | null; pushedAt: string | null; checkedAt: string | null; image: string };

// Images are pushed a little after they're built. Anything pushed more than this after our build is newer.
const SLACK = 12 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const g = globalThis as unknown as { __updateInfo?: Record<string, UpdateInfo> };

/** Written by the Dockerfile. Missing when run from source, which turns the check off. */
export function builtAt(): string | null {
  for (const p of ["/app/.build-time", `${process.cwd()}/.build-time`]) {
    try { const t = fs.readFileSync(p, "utf8").trim(); if (!isNaN(Date.parse(t))) return new Date(t).toISOString(); } catch { /* not built as an image */ }
  }
  return null;
}

export function updateInfo(image: string): UpdateInfo {
  return g.__updateInfo?.[image] ?? { available: false, builtAt: builtAt(), pushedAt: null, checkedAt: null, image };
}

/** Asks Docker Hub, at most once a day unless `force`. Never throws. */
export async function checkForUpdate(image: string, force = false): Promise<UpdateInfo> {
  const cur = updateInfo(image);
  if (!force && cur.checkedAt && Date.now() - Date.parse(cur.checkedAt) < DAY) return cur;
  const built = builtAt();
  const [ns, repo] = image.split("/");
  let pushedAt: string | null = cur.pushedAt;
  try {
    const res = await fetch(`https://hub.docker.com/v2/namespaces/${ns}/repositories/${repo}/tags/latest`, {
      headers: { Accept: "application/json", "User-Agent": `${repo}/self-hosted update check` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const j = await res.json() as { tag_last_pushed?: string; last_updated?: string };
      const t = j.tag_last_pushed ?? j.last_updated;
      if (t && !isNaN(Date.parse(t))) pushedAt = new Date(t).toISOString();
    }
  } catch { /* offline: try again tomorrow */ }
  const info: UpdateInfo = {
    image, builtAt: built, pushedAt, checkedAt: new Date().toISOString(),
    available: !!(built && pushedAt && Date.parse(pushedAt) - Date.parse(built) > SLACK),
  };
  g.__updateInfo = { ...(g.__updateInfo ?? {}), [image]: info };
  return info;
}

/** "Chrome on Android" from a User-Agent, for sign-in lists. */
export function describeAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari"
    : /curl|python|node|okhttp/i.test(ua) ? "Script" : "Browser";
  const osName = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "";
  return osName ? `${browser} on ${osName}` : browser;
}
