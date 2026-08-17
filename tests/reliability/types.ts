import type { IssueCategory, IssueEvidence, IssueSeverity, ScanIssue, ScanRecord, ShipVerdict } from "../../lib/qr/types";

export type BenchmarkProfileId = "clean" | "document" | "accessibility" | "runtime" | "navigation" | "security";
export type BenchmarkClassification = "deterministic" | "environmental";
export type BenchmarkCategory = "clean" | "http-navigation" | "release-reliability" | "security-configuration" | "accessibility" | "seo-document" | "performance-runtime" | "identity-deduplication" | "evidence";
export type EvidenceField = keyof Pick<IssueEvidence, "url" | "selector" | "value" | "excerpt" | "httpStatus" | "requestUrl" | "consoleMessage" | "axeNode" | "resourceType">;
export type EvidenceSource = "http" | "dom" | "header" | "axe" | "console" | "pageerror" | "network" | "lighthouse";

export type FindingMatcher = {
  ruleId?: string;
  severity?: IssueSeverity;
  category?: IssueCategory;
  pagePath?: string;
  requestPath?: string;
  selectorIncludes?: string;
  consoleIncludes?: string;
};

export type FindingExpectation = FindingMatcher & {
  id: string;
  ruleId: string;
  severity: IssueSeverity;
  evidence: {
    source: EvidenceSource;
    required: EvidenceField[];
    httpStatus?: number;
    value?: string | number | boolean;
  };
  expectedOccurrences?: number;
  expectedAffectedPages?: number;
};

export type ForbiddenFinding = FindingMatcher & { id: string; reason: string };

export type PageExpectation = {
  path: string;
  status?: number;
  redirects?: number;
  failureCode?: string;
  noFindings?: boolean;
};

export type BenchmarkScenario = {
  id: string;
  profileId: BenchmarkProfileId;
  category: BenchmarkCategory;
  description: string;
  classification: BenchmarkClassification;
  expectedFindings: FindingExpectation[];
  forbiddenFindings: ForbiddenFinding[];
  expectedPage?: PageExpectation;
  expectedScan?: { gate?: "PASS" | "FAIL"; verdict?: ShipVerdict };
};

export type BenchmarkProfile = {
  id: BenchmarkProfileId;
  description: string;
  entryPath: string;
  smoke: boolean;
};

export type FindingSummary = {
  ruleId: string;
  severity: IssueSeverity;
  pagePath: string;
  requestPath?: string;
  selector?: string;
  occurrences: number;
};

export type BenchmarkEvaluation = {
  profileId: BenchmarkProfileId;
  scenarioCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  severity: { correct: number; evaluated: number };
  severityConfusion: Record<string, number>;
  verdict: { correct: number; evaluated: number };
  gate: { correct: number; evaluated: number };
  evidence: { correct: number; evaluated: number };
  missingFindings: FindingExpectation[];
  unexpectedFindings: FindingSummary[];
  severityMismatches: { expectationId: string; ruleId: string; expected: IssueSeverity; actual: IssueSeverity }[];
  evidenceFailures: { expectationId: string; ruleId: string; reasons: string[] }[];
  forbiddenViolations: { scenarioId: string; forbiddenId: string; finding: FindingSummary }[];
  pageFailures: { scenarioId: string; reason: string }[];
  verdictFailures: { expected: ShipVerdict; actual?: ShipVerdict }[];
  gateFailures: { expected: "PASS" | "FAIL"; actual?: "PASS" | "FAIL" }[];
  environmentalFindings: FindingSummary[];
  passed: boolean;
};

export type BenchmarkRun = {
  profileId: BenchmarkProfileId;
  scan: ScanRecord;
  evaluation: BenchmarkEvaluation;
  semanticSignature: ReturnType<typeof import("./evaluate").semanticScanSignature>;
};

export type MatchedFinding = { expectation: FindingExpectation; issue: ScanIssue };
