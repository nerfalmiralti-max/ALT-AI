const TRACKING_PARAMETERS = /^(utm_.+|fbclid|gclid|msclkid|mc_[ce]id)$/i;
const DANGEROUS_PATH = /(?:^|\/)(?:api|logout|log-out|signout|sign-out|delete|remove|destroy|unsubscribe|checkout|purchase|buy|book|reserve|admin)(?:\/|$)/i;
const DOWNLOAD_EXTENSION = /\.(?:7z|avi|bin|bmp|css|csv|dmg|docx?|exe|gif|gz|ico|iso|jpe?g|js|json|mov|mp3|mp4|msi|pdf|pkg|png|pptx?|rar|svg|tar|tgz|txt|webm|webp|xlsx?|xml|xz|zip)$/i;

export function normalizeTargetInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed || /^[a-z][a-z\d+.-]*:(?!\d)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function normalizeUrl(input: string) {
  const url = new URL(input);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETERS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

export function isCrawlableUrl(candidate: string, origin: string) {
  try {
    if (candidate.length > 2_048) return false;
    const url = new URL(candidate);
    let decodedPath = url.pathname;
    try { decodedPath = decodeURIComponent(url.pathname); } catch { return false; }
    const destructiveQuery = [...url.searchParams.entries()].some(([key, value]) => DANGEROUS_PATH.test(`/${key}/${value}`));
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin === origin &&
      !url.username &&
      !url.password &&
      !DANGEROUS_PATH.test(decodedPath) &&
      !destructiveQuery &&
      !DOWNLOAD_EXTENSION.test(decodedPath)
    );
  } catch {
    return false;
  }
}

export function selectCrawlTargets(seed: string, links: string[], maxPages: number) {
  const origin = new URL(seed).origin;
  const selected: string[] = [];
  const seen = new Set<string>();
  const pathQueryCounts = new Map<string, number>();
  for (const candidate of [seed, ...links]) {
    if (!isCrawlableUrl(candidate, origin)) continue;
    const normalized = normalizeUrl(candidate);
    if (seen.has(normalized)) continue;
    const url = new URL(normalized);
    const count = pathQueryCounts.get(url.pathname) ?? 0;
    if (count >= 2) continue;
    pathQueryCounts.set(url.pathname, count + 1);
    seen.add(normalized);
    selected.push(normalized);
    if (selected.length >= maxPages) break;
  }
  return selected;
}
