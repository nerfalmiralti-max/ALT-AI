import { scannerConfig } from "./config";
import { fetchPinnedResource, type PinnedResponse, type ScanResourceBudget } from "./safe-request";

export type RobotsPolicy = { origin: string; disallow: string[]; available: boolean };

export function parseRobotsPolicy(origin: string, text: string): RobotsPolicy {
  const disallow: string[] = [];
  let agents: string[] = [];
  let rules: string[] = [];
  let hasDirectives = false;

  const finishGroup = () => {
    const applies = agents.some((agent) => agent === "*" || agent.includes("alt-quality-radar"));
    if (applies) disallow.push(...rules.filter(Boolean));
    agents = [];
    rules = [];
    hasDirectives = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      if (hasDirectives) finishGroup();
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (hasDirectives) finishGroup();
      agents.push(value.toLowerCase());
      continue;
    }
    if (!agents.length) continue;
    hasDirectives = true;
    if (field === "disallow" && value) rules.push(value);
  }
  if (agents.length) finishGroup();
  return { origin, disallow: [...new Set(disallow)], available: true };
}

async function boundedFetch(url: URL, signal?: AbortSignal, budget?: ScanResourceBudget) {
  let current = url;
  for (let redirects = 0; redirects <= scannerConfig.maxRedirects; redirects += 1) {
    const response = await fetchPinnedResource(current.toString(), {
      headers: { "user-agent": scannerConfig.userAgent, accept: "text/plain" },
      maxBytes: scannerConfig.maxResponseBytes,
      signal,
      budget,
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

export async function loadRobotsPolicy(target: URL, signal?: AbortSignal, budget?: ScanResourceBudget): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", target.origin);
  try {
    const response = await boundedFetch(robotsUrl, signal, budget);
    if (response.status < 200 || response.status >= 300) return { origin: target.origin, disallow: [], available: false };
    return parseRobotsPolicy(target.origin, boundedText(response));
  } catch {
    return { origin: target.origin, disallow: [], available: false };
  }
}

export function isAllowedByRobots(url: string, policy: RobotsPolicy) {
  const target = new URL(url);
  if (target.origin !== policy.origin) return false;
  return !policy.disallow.some((path) => path === "/" || target.pathname.startsWith(path));
}
