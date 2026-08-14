export const SCAN_STAGES = [
  "QUEUED",
  "DISCOVERING",
  "INSPECTING",
  "AUDITING",
  "CAPTURING",
  "COMPARING",
  "SCORING",
  "COMPLETE",
  "CANCELLED",
  "FAILED",
] as const;

export type ScanStage = (typeof SCAN_STAGES)[number];

export const ISSUE_CATEGORIES = [
  "performance",
  "accessibility",
  "seo",
  "mobile",
  "links",
  "browser",
  "infrastructure",
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];
export type IssueSeverity = "CRITICAL" | "WARNING" | "NOTICE" | "PASS";
export type IssueScope = "SITE" | "PAGE";
export type IssueLifecycle = "ACTIVE" | "IGNORED";
export type IssueDeltaStatus = "NEW" | "FIXED" | "UNCHANGED" | "CHANGED" | "REGRESSION";
export type MetricRating = "GOOD" | "NEEDS ATTENTION" | "POOR";
export type VisualChangeRating = "NO MEANINGFUL CHANGE" | "MINOR CHANGE" | "VISIBLE CHANGE" | "MAJOR CHANGE";

export type IssueEvidence = {
  url: string;
  selector?: string;
  value?: string | number | boolean;
  excerpt?: string;
  viewport?: { width: number; height: number };
  boundingBox?: { x: number; y: number; width: number; height: number };
  httpStatus?: number;
  requestUrl?: string;
  consoleMessage?: string;
  axeNode?: string;
  lighthouseMetric?: { key: string; value: number; unit: string; rating: MetricRating };
  dimensions?: { documentWidth: number; viewportWidth: number; overflow: number };
  resourceType?: NetworkResourceType;
  screenshotId?: string;
};

export type ScanIssue = {
  id: string;
  ruleId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  recommendation: string;
  scoreImpact: number;
  evidence: IssueEvidence;
  fingerprint: string;
  scope: IssueScope;
  lifecycle: IssueLifecycle;
  occurrences: number;
  affectedPageIds: string[];
};

export type ConsoleEvent = {
  level: "error" | "warning";
  message: string;
  url?: string;
  line?: number;
  column?: number;
  count: number;
};

export type NetworkResourceType = "document" | "script" | "stylesheet" | "image" | "font" | "fetch/xhr" | "other";

export type NetworkFailure = {
  method: string;
  url: string;
  resourceType: NetworkResourceType;
  reason: string;
  status?: number;
  count: number;
};

export type PageFacts = {
  title: string;
  metaDescription: string;
  lang: string;
  viewport: string;
  canonical: string;
  headings: { level: number; text: string }[];
  headingSkips: { from: number; to: number; text: string; selector?: string }[];
  duplicateIds: { id: string; count: number; selector?: string }[];
  images: { src: string; alt: string | null; selector?: string; boundingBox?: { x: number; y: number; width: number; height: number } }[];
  links: { href: string; text: string; download?: boolean }[];
  unlabeledControls: { selector: string; type: string; boundingBox?: { x: number; y: number; width: number; height: number } }[];
  widestElement?: { selector: string; width: number; boundingBox: { x: number; y: number; width: number; height: number } };
  documentWidth: number;
  viewportWidth: number;
  htmlBytes: number;
};

export type PageAudit = {
  id: string;
  url: string;
  status: number;
  contentType: string;
  durationMs: number;
  redirects: number;
  headers: Record<string, string>;
  facts: PageFacts;
  consoleErrors: string[];
  consoleWarnings: string[];
  consoleEvents: ConsoleEvent[];
  pageErrors: string[];
  requestFailures: string[];
  networkFailures: NetworkFailure[];
  axeViolations: AxeViolation[];
  auditFailures: { system: "axe" | "screenshot" | "mobile" | "visual" | "timeout"; message: string }[];
  eventLimits: { consoleDropped: number; networkDropped: number; dialogsDismissed: number; popupsBlocked: number; downloadsBlocked: number };
  failure?: { code: string; message: string };
};

export type AxeViolation = {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: { target: string[]; html: string; failureSummary?: string }[];
};

export type LighthouseMetrics = {
  available: boolean;
  error?: string;
  durationMs?: number;
  scores?: Partial<Record<"performance" | "accessibility" | "seo" | "best-practices", number>>;
  metrics?: Partial<Record<"fcp" | "lcp" | "cls" | "tbt" | "speedIndex", number>>;
};

export type ScreenshotAsset = {
  id: string;
  pageId: string;
  viewport: "desktop" | "mobile" | "diff";
  relativePath: string;
  width: number;
  height: number;
  sourceViewport?: "desktop" | "mobile";
  comparisonTarget?: "previous" | "baseline";
};

export type VisualComparison = {
  id: string;
  baselineScanId: string;
  currentScanId: string;
  baselineScreenshotId: string;
  currentScreenshotId: string;
  diffScreenshotId: string;
  viewport: "desktop" | "mobile";
  comparisonTarget: "previous" | "baseline";
  changedPixels: number;
  totalPixels: number;
  diffPercentage: number;
  rating: VisualChangeRating;
};

export type PerformanceReading = {
  key: "fcp" | "lcp" | "cls" | "tbt" | "speedIndex";
  label: string;
  value: number;
  unit: "ms" | "ratio";
  rating: MetricRating;
  goodThreshold: number;
  poorThreshold: number;
};

export type CategoryScore = {
  category: IssueCategory;
  score: number;
  weight: number;
  issueCount: number;
};

export type ScoreResult = {
  overall: number;
  status: "READY" | "ALMOST READY" | "NEEDS WORK" | "NOT READY";
  categories: CategoryScore[];
};

export type ReleaseGateConfig = {
  minimumScore: number;
  failOnCritical: boolean;
  maximumBrokenPages: number;
  maximumBrokenLinks: number;
};

export type ReleaseGateCheck = {
  id: "minimum-score" | "critical-issues" | "broken-pages" | "broken-links";
  label: string;
  passed: boolean;
  actual: number;
  expected: string;
};

export type ReleaseGateResult = {
  status: "PASS" | "FAIL";
  checks: ReleaseGateCheck[];
};

export type ShipVerdict = "READY TO SHIP" | "READY WITH WARNINGS" | "NEEDS ATTENTION" | "BLOCKED";

export type IssueDeltaItem = {
  fingerprint: string;
  status: IssueDeltaStatus;
  previous?: ScanIssue;
  current?: ScanIssue;
  changes: string[];
};

export type IssueDeltaSummary = {
  baseScanId: string;
  currentScanId: string;
  newCount: number;
  fixedCount: number;
  unchangedCount: number;
  changedCount: number;
  regressionCount: number;
  items: IssueDeltaItem[];
};

export type MetricMovement = {
  key: PerformanceReading["key"];
  previous: number;
  current: number;
  delta: number;
  improved: boolean;
};

export type ScanDelta = {
  baseScanId: string;
  currentScanId: string;
  scoreDelta: number;
  categoryDeltas: Partial<Record<IssueCategory, number>>;
  issues: IssueDeltaSummary;
  performance: MetricMovement[];
  visualDifference?: number;
};

export type ScanComparisons = {
  previous?: ScanDelta;
  baseline?: ScanDelta;
};

export type PageHealth = {
  pageId: string;
  url: string;
  score: number;
  status: "HEALTHY" | "WARNINGS" | "BLOCKED" | "PARTIAL";
  blockers: number;
  warnings: number;
  notices: number;
  networkFailures: number;
  consoleFailures: number;
  visualDifference?: number;
};

export type IssueGroup = {
  key: string;
  ruleId: string;
  title: string;
  scope: IssueScope;
  severity: IssueSeverity;
  lifecycle: IssueLifecycle;
  count: number;
  affectedPages: string[];
  scoreImpact: number;
  fingerprints: string[];
};

export type FixQueueItem = {
  rank: number;
  ruleId: string;
  title: string;
  severity: IssueSeverity;
  scope: IssueScope;
  affectedPages: number;
  scoreImpact: number;
  gateBlocker: boolean;
  recommendation: string;
};

export type ScanCoverage = {
  discoveredPages: number;
  selectedPages: number;
  inspectedPages: number;
  failedPages: number;
  partialPages?: number;
  skippedByLimit: number;
  robotsExcluded: number;
  unverifiedUrls: string[];
};

export type ScanTimings = {
  totalMs: number;
  browserAuditMs: number;
  lighthouseMs: number;
  rulesMs: number;
  screenshotMs: number;
};

export type ScanConfigSnapshot = {
  maxPages: number;
  crawlConcurrency: number;
  pageTimeoutMs: number;
  scanTimeoutMs: number;
  maxRedirects: number;
  maxResponseBytes: number;
  maxResourceBytes: number;
  maxScreenshotPixels: number;
  maxScreenshotHeight: number;
  maxLinksPerPage: number;
  maxConsoleEvents: number;
  maxNetworkFailures: number;
  maxRequestsPerContext: number;
  maxDialogs: number;
  maxPopups: number;
  desktopViewport: { width: number; height: number; deviceScaleFactor: number };
  mobileViewport: { width: number; height: number; deviceScaleFactor: number };
};

export type ScanProgress = {
  stage: ScanStage;
  detail: string;
  completedUnits: number;
  totalUnits: number | null;
  currentUrl?: string;
  updatedAt: string;
};

export type ScanRecord = {
  id: string;
  projectId: string;
  targetUrl: string;
  normalizedUrl: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress: ScanProgress;
  stageHistory: { stage: ScanStage; detail: string; at: string }[];
  pages: PageAudit[];
  issues: ScanIssue[];
  screenshots: ScreenshotAsset[];
  visualComparisons: VisualComparison[];
  lighthouse: LighthouseMetrics;
  performance: PerformanceReading[];
  score?: ScoreResult;
  releaseGate?: ReleaseGateResult;
  verdict?: ShipVerdict;
  comparisons: ScanComparisons;
  pageHealth: PageHealth[];
  issueGroups: IssueGroup[];
  fixQueue: FixQueueItem[];
  coverage: ScanCoverage;
  timings: ScanTimings;
  failure?: { code: string; message: string };
  scannerVersion: string;
  rulesVersion: string;
  configSnapshot: ScanConfigSnapshot;
  analysisProjectUpdatedAt?: string;
  persistence?: { backend: "local" | "supabase"; synchronized: boolean; warning?: string };
};

export type ProjectRecord = {
  id: string;
  name: string;
  origin: string;
  createdAt: string;
  updatedAt: string;
  latestScanId?: string;
  baselineScanId?: string;
  scanIds: string[];
  gateConfig: ReleaseGateConfig;
  ignoredFingerprints: string[];
};

export type ProjectIndex = { projects: ProjectRecord[] };
