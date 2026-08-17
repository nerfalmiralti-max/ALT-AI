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
  auditFailures: { system: "axe" | "dom" | "network-policy" | "screenshot" | "mobile" | "visual" | "timeout"; message: string }[];
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
  maxScanResponseBytes: number;
  maxInflightRequests: number;
  maxDomNodes: number;
  maxRenderedDomChars: number;
  maxScreenshotPixels: number;
  maxScreenshotHeight: number;
  maxScreenshotBytes: number;
  maxLinksPerPage: number;
  maxConsoleEvents: number;
  maxNetworkFailures: number;
  maxRequestsPerContext: number;
  maxDialogs: number;
  maxPopups: number;
  maxStoredScans: number;
  maxStoredBytes: number;
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
  challengeContext?: {
    challengeId: string;
    runId: string;
    role: "PRODUCTION" | "CANDIDATE" | "VERIFICATION" | "RED_TEAM_PRODUCTION" | "RED_TEAM_CANDIDATE" | "RED_TEAM_VERIFICATION";
  };
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
  hidden?: boolean;
};

export type ProjectIndex = { projects: ProjectRecord[] };

export const CHALLENGE_STAGES = [
  "QUEUED",
  "PREPARING_BASELINE",
  "SCANNING_PRODUCTION",
  "SCANNING_CANDIDATE",
  "COMPARING",
  "VERIFYING",
  "BUILDING_EVIDENCE",
  "FINALIZING",
  "COMPLETE",
  "CANCELLED",
  "FAILED",
] as const;

export type ChallengeStage = (typeof CHALLENGE_STAGES)[number];
export type ExistingQaVerdict = "PASSED" | "FAILED" | "UNKNOWN";
export type ChallengeVerdict = "ALT_QR_WON" | "RELEASE_HAS_REGRESSIONS" | "NO_QUALIFYING_MISS" | "INSUFFICIENT_EVIDENCE";
export type ChallengeFindingClassification = "NEW_REGRESSION" | "EXISTING" | "FIXED" | "UNVERIFIED";
export type ChallengeConfidence = "CONFIRMED" | "UNVERIFIED";

export const QA_ROLES = ["EXPLORER", "BREAKER", "NETWORK", "STATE", "RESPONSIVE", "RUNTIME"] as const;
export type QaRole = (typeof QA_ROLES)[number];
export type QaFindingSource = "PRIMARY" | "RED_TEAM";
export type QaRoleStatus = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED" | "TIMED_OUT" | "CANCELLED";
export type SwarmStage = "PENDING" | "PREPARING" | "RUNNING_ROLES" | "NORMALIZING" | "JUDGING" | "REPRODUCING" | "PRELIMINARY_VERDICT" | "RED_TEAM" | "FINALIZING" | "COMPLETE" | "FAILED" | "CANCELLED";
export type JudgeDisposition = "CONFIRMED" | "REJECTED" | "DUPLICATE" | "BASELINE_ISSUE" | "UNVERIFIED" | "ENVIRONMENTAL";
export type PreliminaryVerdict = "PRELIMINARY_READY" | "PRELIMINARY_HOLD" | "PRELIMINARY_INCOMPLETE";
export type RedTeamStatus = "NOT_STARTED" | "RUNNING" | "CLEAR" | "BLOCKER_FOUND" | "SKIPPED_HOLD" | "SKIPPED_INCOMPLETE" | "FAILED" | "CANCELLED";
export type FinalVerificationVerdict = "READY" | "HOLD" | "INCOMPLETE";

export type RawSwarmFinding = {
  id: string;
  role: QaRole | "RED_TEAM";
  runId: string;
  source: QaFindingSource;
  issueIdentity: string;
  ruleId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  route: string;
  interaction?: string;
  observedBehavior: string;
  evidence: ChallengeEvidence;
  discoveredAt: string;
  initialConfidence: "OBSERVED" | "TENTATIVE";
  reproductionStatus: "PENDING" | "REPRODUCED" | "NOT_REPRODUCED" | "NOT_ATTEMPTED";
};

export type QaRoleRun = {
  role: QaRole;
  mission: string;
  status: QaRoleStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs: number;
  actionCount: number;
  findings: RawSwarmFinding[];
  failure?: { code: string; message: string };
};

export type NormalizedSwarmFinding = {
  id: string;
  normalizationKey: string;
  canonicalRawFindingId: string;
  rawFindingIds: string[];
  roles: (QaRole | "RED_TEAM")[];
  source: QaFindingSource;
  ruleId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  route: string;
  interaction?: string;
  evidence: ChallengeEvidence[];
};

export type JudgeDecision = {
  id: string;
  rawFindingId: string;
  normalizedFindingId: string;
  canonicalDecisionId?: string;
  disposition: JudgeDisposition;
  reason: string;
  releaseBlocker: boolean;
  source: QaFindingSource;
  roles: (QaRole | "RED_TEAM")[];
  reproduction: {
    candidate: { observed: number; attempts: number };
    baseline: { observed: number; attempts: number };
  };
  decidedAt: string;
};

export type SwarmEventName =
  | "swarm_started"
  | "role_started"
  | "role_completed"
  | "role_failed"
  | "judge_started"
  | "judge_completed"
  | "reproduction_started"
  | "reproduction_completed"
  | "preliminary_verdict"
  | "red_team_started"
  | "red_team_finding"
  | "red_team_completed"
  | "verdict_revoked"
  | "final_verdict";

export type SwarmEvent = {
  name: SwarmEventName;
  at: string;
  role?: QaRole | "RED_TEAM";
  findingId?: string;
  detail?: string;
};

export type SwarmRun = {
  id: string;
  challengeId: string;
  challengeRunId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  stage: SwarmStage;
  roleRuns: QaRoleRun[];
  rawFindings: RawSwarmFinding[];
  normalizedFindings: NormalizedSwarmFinding[];
  judgeDecisions: JudgeDecision[];
  preliminaryVerdict?: PreliminaryVerdict;
  redTeam: {
    status: RedTeamStatus;
    targetRoutes: string[];
    scanIds: { production?: string; candidate?: string; verification?: string };
    rawFindings: RawSwarmFinding[];
    normalizedFindings: NormalizedSwarmFinding[];
    decisions: JudgeDecision[];
    failure?: { code: string; message: string };
  };
  finalVerdict?: FinalVerificationVerdict;
  adversariallyVerified: boolean;
  readyRevoked: boolean;
  counts: {
    discovered: number;
    normalized: number;
    confirmed: number;
    rejected: number;
    duplicates: number;
    baselineIssues: number;
    unverified: number;
    environmental: number;
    releaseBlockers: number;
  };
  operations: {
    durationMs: number;
    roleDurationMs: number;
    actionCount: number;
    verificationRetries: number;
  };
  events: SwarmEvent[];
  failure?: { code: string; message: string };
};

export type ChallengeEvidence = Pick<
  IssueEvidence,
  "url" | "selector" | "value" | "excerpt" | "viewport" | "boundingBox" | "httpStatus" | "requestUrl" | "consoleMessage" | "axeNode" | "dimensions" | "resourceType" | "screenshotId"
>;

export type ChallengeFinding = {
  identity: string;
  classification: ChallengeFindingClassification;
  ruleId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  recommendation: string;
  route: string;
  affectedInteraction?: string;
  productionState: string;
  candidateState: string;
  confidence: ChallengeConfidence;
  reproduction: { observed: number; attempts: number };
  reason: string;
  productionEvidence?: ChallengeEvidence;
  candidateEvidence?: ChallengeEvidence;
  verificationEvidence?: ChallengeEvidence;
};

export type ChallengeEventName =
  | "challenge_started"
  | "challenge_completed"
  | "challenge_altqr_won"
  | "challenge_no_miss_found"
  | "challenge_insufficient_evidence"
  | "challenge_regression_opened"
  | "challenge_rerun";

export type ChallengeEvent = {
  name: ChallengeEventName;
  at: string;
  runId?: string;
  findingIdentity?: string;
};

export type ChallengeComparison = {
  newRegressions: ChallengeFinding[];
  existingIssues: ChallengeFinding[];
  fixedIssues: ChallengeFinding[];
  unverifiedChanges: ChallengeFinding[];
  qualifyingRegressionCount: number;
  verificationRequired: boolean;
  evidenceComplete: boolean;
};

export type ChallengeRun = {
  id: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress: {
    stage: ChallengeStage;
    detail: string;
    currentScanId?: string;
    updatedAt: string;
  };
  scanIds: {
    production?: string;
    candidate?: string;
    verification?: string;
  };
  comparison?: ChallengeComparison;
  swarm?: SwarmRun;
  verdict?: ChallengeVerdict;
  failure?: { code: string; message: string };
};

export type ChallengeRecord = {
  id: string;
  projectId?: string;
  productionUrl: string;
  candidateUrl: string;
  pullRequestUrl?: string;
  qaStack?: string;
  existingQaVerdict: ExistingQaVerdict;
  status: ChallengeStage;
  createdAt: string;
  updatedAt: string;
  activeRunId?: string;
  runs: ChallengeRun[];
  events: ChallengeEvent[];
};

export type ChallengeIndexEntry = {
  id: string;
  projectId?: string;
  productionUrl: string;
  candidateUrl: string;
  existingQaVerdict: ExistingQaVerdict;
  createdAt: string;
  updatedAt: string;
  latestRun?: Pick<ChallengeRun, "id" | "createdAt" | "completedAt" | "progress" | "verdict">;
};

export type ChallengeIndex = { challenges: ChallengeIndexEntry[] };
