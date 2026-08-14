import type { ProjectRecord, ScanIssue, ScanRecord, ScreenshotAsset } from "@/lib/qr/types";
import { sanitizeDiagnosticText } from "@/lib/qr/sanitize";

export type ReferenceSummary = {
  id: string;
  screenshots: ScreenshotAsset[];
  score?: ScanRecord["score"];
  verdict?: ScanRecord["verdict"];
  completedAt?: string;
};

export type HistorySummary = {
  id: string;
  normalizedUrl: string;
  createdAt: string;
  completedAt?: string;
  stage: ScanRecord["progress"]["stage"];
  score?: number;
  verdict?: ScanRecord["verdict"];
  scoreDelta?: number;
};

export type ReportPayload = {
  scan: ScanRecord;
  project: ProjectRecord;
  previous: ReferenceSummary | null;
  baseline: ReferenceSummary | null;
  history: HistorySummary[];
};

export type ComparisonTarget = "previous" | "baseline";
export type CaptureMode = "current" | "compare" | "diff";

export function assetUrl(asset: ScreenshotAsset | null | undefined) {
  return asset ? `/api/assets/${asset.relativePath.split("/").map(encodeURIComponent).join("/")}` : "";
}

export function displayHost(url: string) {
  try { return new URL(url).hostname; } catch { return url; }
}

export function pathLabel(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname || "/"}${parsed.search}`;
  } catch {
    return url;
  }
}

export function issueAnchorId(ruleId: string, scope: string, title = "") {
  const identity = `${ruleId}|${scope}|${title}`;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  const slug = `issue-${ruleId}-${scope.toLowerCase()}-${title.toLowerCase()}`.replace(/[^a-z0-9_-]/g, "-").slice(0, 96);
  return `${slug}-${(hash >>> 0).toString(36)}`;
}

export function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function formatMetric(value: number, unit: "ms" | "ratio") {
  return unit === "ratio" ? value.toFixed(3) : `${Math.round(value)}ms`;
}

export function formatDuration(value: number) {
  if (value < 1_000) return `${Math.round(value)}ms`;
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}s`;
}

export function cleanEvidenceText(value: unknown) {
  const text = String(value ?? "").replace(/\s+Call log:[\s\S]*$/i, "").trim();
  return sanitizeDiagnosticText(text);
}

export function issueEvidenceLines(issue: ScanIssue) {
  const evidence = issue.evidence;
  const entries: Array<[string, unknown]> = [
    ["URL", evidence.url],
    ["Selector", evidence.selector],
    ["HTTP status", evidence.httpStatus],
    ["Request", evidence.requestUrl],
    ["Resource", evidence.resourceType],
    ["Console", evidence.consoleMessage],
    ["Axe node", evidence.axeNode],
    ["Viewport", evidence.viewport ? `${evidence.viewport.width} × ${evidence.viewport.height}` : undefined],
    ["Bounds", evidence.boundingBox ? `x ${evidence.boundingBox.x}, y ${evidence.boundingBox.y}, ${evidence.boundingBox.width} × ${evidence.boundingBox.height}` : undefined],
    ["Dimensions", evidence.dimensions ? `${evidence.dimensions.documentWidth}px document, ${evidence.dimensions.viewportWidth}px viewport, ${evidence.dimensions.overflow}px overflow` : undefined],
    ["Measured", evidence.value],
    ["Detail", evidence.excerpt],
  ];
  return entries.filter((entry) => entry[1] !== undefined && entry[1] !== "").map(([label, value]) => [label, cleanEvidenceText(value)] as const);
}
