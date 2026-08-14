import { scannerConfig } from "./config";
import { fetchPinnedResource, type PinnedResponse } from "./safe-request";

export type RobotsPolicy = { origin: string; disallow: string[]; available: boolean };

async function boundedFetch(url: URL, signal?: AbortSignal) {
  let current = url;
  for (let redirects = 0; redirects <= scannerConfig.maxRedirects; redirects += 1) {
    const response = await fetchPinnedResource(current.toString(), {
      headers: { "user-agent": scannerConfig.userAgent, accept: "text/plain" },
      maxBytes: scannerConfig.maxResponseBytes,
      signal,
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) return response;
      current = new URL(location, current);
      continue;
    }
    return response;
  }
  throw new Error("Redirect limit exceeded");
}

function boundedText(response: PinnedResponse) {
  return response.body.toString("utf8");
}

export async function loadRobotsPolicy(target: URL, signal?: AbortSignal): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", target.origin);
  try {
    const response = await boundedFetch(robotsUrl, signal);
    if (response.status < 200 || response.status >= 300) return { origin: target.origin, disallow: [], available: false };
    const text = boundedText(response);
    const disallow: string[] = [];
    let applies = false;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, "").trim();
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      const field = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      if (field === "user-agent") applies = value === "*" || value.toLowerCase().includes("alt-quality-radar");
      if (field === "disallow" && applies && value) disallow.push(value);
    }
    return { origin: target.origin, disallow, available: true };
  } catch {
    return { origin: target.origin, disallow: [], available: false };
  }
}

export function isAllowedByRobots(url: string, policy: RobotsPolicy) {
  const target = new URL(url);
  if (target.origin !== policy.origin) return false;
  return !policy.disallow.some((path) => path === "/" || target.pathname.startsWith(path));
}
