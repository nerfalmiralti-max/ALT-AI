import { createHash } from "node:crypto";

import { redactSensitiveUrl, sanitizeDiagnosticText } from "./sanitize";
import type {
  ChallengeComparison,
  ChallengeEvidence,
  ChallengeFinding,
  ChallengeVerdict,
  ExistingQaVerdict,
  ScanIssue,
  ScanRecord,
} from "./types";

const QUALIFYING_RULES = new Set([
  "http-status",
  "broken-link",
  "request-failure",
  "missing-title",
  "missing-h1",
  "heading-order",
  "duplicate-id",
  "missing-lang",
  "missing-alt",
  "unlabeled-control",
  "axe-violation",
  "missing-viewport",
  "horizontal-overflow",
  "console-error",
  "page-error",
]);

function boundedText(value: string | undefined, max = 800) {
  if (!value) return undefined;
  return sanitizeDiagnosticText(value).replace(/\s+/g, " ").trim().slice(0, max) || undefined;
}

function routeIdentity(raw: string | undefined) {
  if (!raw) return "/";
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|msclkid|mc_[ce]id)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "") || "/";
    return `${pathname}${url.search}`;
  } catch {
    return "/";
  }
}

function normalizedEvidencePart(value: unknown) {
  if (typeof value !== "string") return "";
  return boundedText(value, 500)?.toLowerCase() ?? "";
}

function normalizedValue(value: unknown) {
  if (typeof value !== "string") return "";
  try { return routeIdentity(new URL(value).toString()); } catch { return normalizedEvidencePart(value); }
}

function issueDiscriminator(issue: ScanIssue) {
  const evidence = issue.evidence;
  const requestRoute = evidence.requestUrl ? routeIdentity(evidence.requestUrl) : "";
  const message = normalizedEvidencePart(evidence.consoleMessage ?? evidence.excerpt);
  const selector = normalizedEvidencePart(evidence.selector);
  const value = normalizedValue(evidence.value);
  if (issue.ruleId === "axe-violation") return [normalizedEvidencePart(issue.title), selector, value].join("|");
  if (["console-error", "page-error"].includes(issue.ruleId)) return message;
  if (issue.ruleId === "request-failure") return [requestRoute, normalizedEvidencePart(evidence.resourceType)].join("|");
  if (["heading-order", "duplicate-id", "missing-alt", "unlabeled-control", "horizontal-overflow"].includes(issue.ruleId)) {
    return [selector, value].join("|");
  }
  return "";
}

export function challengeIssueIdentity(issue: ScanIssue) {
  const source = [issue.ruleId, issue.scope, routeIdentity(issue.evidence.url), issueDiscriminator(issue)].join("|");
  return createHash("sha256").update(source).digest("hex").slice(0, 24);
}

function safeEvidence(issue: ScanIssue | undefined): ChallengeEvidence | undefined {
  if (!issue) return undefined;
  const evidence = issue.evidence;
  return {
    url: redactSensitiveUrl(evidence.url).slice(0, 2_048),
    selector: boundedText(evidence.selector, 500),
    value: typeof evidence.value === "string" ? boundedText(evidence.value, 500) : evidence.value,
    excerpt: boundedText(evidence.excerpt),
    viewport: evidence.viewport,
    boundingBox: evidence.boundingBox,
    httpStatus: evidence.httpStatus,
    requestUrl: evidence.requestUrl ? redactSensitiveUrl(evidence.requestUrl).slice(0, 2_048) : undefined,
    consoleMessage: boundedText(evidence.consoleMessage),
    axeNode: boundedText(evidence.axeNode),
    dimensions: evidence.dimensions,
    resourceType: evidence.resourceType,
    screenshotId: boundedText(evidence.screenshotId, 100),
  };
}

function scanEvidenceComplete(scan: ScanRecord) {
  if (scan.progress.stage !== "COMPLETE" || !scan.pages.length) return false;
  const primary = scan.pages[0];
  return Boolean(primary && primary.status >= 200 && primary.status < 400 && !primary.failure);
}

function coveredRoutes(scan: ScanRecord) {
  return new Set(scan.pages
    .filter((page) => page.status >= 200 && page.status < 400 && !page.failure)
    .map((page) => routeIdentity(page.url)));
}

function hasQualifyingEvidence(issue: ScanIssue) {
  if (!issue.evidence.url || issue.lifecycle === "IGNORED" || issue.severity === "NOTICE" || issue.severity === "PASS") return false;
  if (!QUALIFYING_RULES.has(issue.ruleId)) return false;
  if (issue.ruleId === "http-status") return typeof issue.evidence.httpStatus === "number";
  if (["console-error", "page-error"].includes(issue.ruleId)) return Boolean(issue.evidence.consoleMessage || issue.evidence.excerpt);
  if (issue.ruleId === "axe-violation") return Boolean(issue.evidence.selector && (issue.evidence.axeNode || issue.evidence.excerpt));
  return true;
}

function finding(
  classification: ChallengeFinding["classification"],
  issue: ScanIssue,
  options: {
    production?: ScanIssue;
    candidate?: ScanIssue;
    verification?: ScanIssue;
    confirmed?: boolean;
    reason: string;
    attempts?: number;
  },
): ChallengeFinding {
  return {
    identity: challengeIssueIdentity(issue),
    classification,
    ruleId: issue.ruleId,
    category: issue.category,
    severity: issue.severity,
    title: boundedText(issue.title, 200) ?? "Scanner finding",
    description: boundedText(issue.description, 500) ?? "",
    recommendation: boundedText(issue.recommendation, 500) ?? "",
    route: routeIdentity(redactSensitiveUrl(issue.evidence.url)),
    affectedInteraction: issue.evidence.selector
      ? boundedText(issue.evidence.selector, 300)
      : issue.evidence.requestUrl
        ? routeIdentity(redactSensitiveUrl(issue.evidence.requestUrl))
        : ["console-error", "page-error"].includes(issue.ruleId) ? "Page runtime" : undefined,
    productionState: options.production
      ? "Finding observed in production."
      : classification === "NEW_REGRESSION" ? "Not observed on the covered production route." : "No equivalent production finding was proven.",
    candidateState: options.candidate
      ? "Finding observed in the candidate."
      : classification === "FIXED" ? "Finding not observed in the candidate." : "Candidate state unavailable.",
    confidence: options.confirmed ? "CONFIRMED" : "UNVERIFIED",
    reproduction: {
      observed: (options.candidate ? 1 : 0) + (options.verification ? 1 : 0),
      attempts: options.attempts ?? (options.verification ? 2 : options.candidate ? 1 : 0),
    },
    reason: options.reason,
    productionEvidence: safeEvidence(options.production),
    candidateEvidence: safeEvidence(options.candidate),
    verificationEvidence: safeEvidence(options.verification),
  };
}

export function buildChallengeComparison(baseline: ScanRecord, candidate: ScanRecord, verification?: ScanRecord): ChallengeComparison {
  const baselineByIdentity = new Map(baseline.issues.map((entry) => [challengeIssueIdentity(entry), entry]));
  const candidateByIdentity = new Map(candidate.issues.map((entry) => [challengeIssueIdentity(entry), entry]));
  const verificationByIdentity = new Map((verification?.issues ?? []).map((entry) => [challengeIssueIdentity(entry), entry]));
  const baselineRoutes = coveredRoutes(baseline);
  const candidateRoutes = coveredRoutes(candidate);
  const existingIssues: ChallengeFinding[] = [];
  const fixedIssues: ChallengeFinding[] = [];
  const newRegressions: ChallengeFinding[] = [];
  const unverifiedChanges: ChallengeFinding[] = [];
  let verificationRequired = false;
  let hasCoverageGap = false;

  for (const [identity, production] of baselineByIdentity) {
    const current = candidateByIdentity.get(identity);
    if (current) {
      existingIssues.push(finding("EXISTING", current, {
        production,
        candidate: current,
        reason: "Observed in both production and candidate scans.",
      }));
    } else if (candidateRoutes.has(routeIdentity(production.evidence.url))) {
      fixedIssues.push(finding("FIXED", production, {
        production,
        confirmed: true,
        reason: "Observed in production and absent from the completed candidate scan.",
      }));
    } else {
      hasCoverageGap = true;
      unverifiedChanges.push(finding("UNVERIFIED", production, {
        production,
        reason: "Candidate coverage did not include the equivalent route, so a fix is not proven.",
      }));
    }
  }

  for (const [identity, current] of candidateByIdentity) {
    if (baselineByIdentity.has(identity)) continue;
    const route = routeIdentity(current.evidence.url);
    const baselineCovered = baselineRoutes.has(route);
    const eligible = hasQualifyingEvidence(current);
    const reproduced = verificationByIdentity.get(identity);
    if (!baselineCovered) {
      hasCoverageGap = true;
      unverifiedChanges.push(finding("UNVERIFIED", current, {
        candidate: current,
        verification: reproduced,
        reason: "Production coverage did not include the equivalent route, so absence is not proven.",
        attempts: verification ? 2 : 1,
      }));
      continue;
    }
    if (!eligible) {
      unverifiedChanges.push(finding("UNVERIFIED", current, {
        candidate: current,
        verification: reproduced,
        reason: "This finding is not eligible for a competitive regression claim.",
        attempts: verification ? 2 : 1,
      }));
      continue;
    }
    verificationRequired = true;
    if (reproduced && verification && scanEvidenceComplete(verification)) {
      newRegressions.push(finding("NEW_REGRESSION", current, {
        candidate: current,
        verification: reproduced,
        confirmed: true,
        reason: "Candidate-only finding reproduced in a fresh verification scan.",
        attempts: 2,
      }));
    } else {
      unverifiedChanges.push(finding("UNVERIFIED", current, {
        candidate: current,
        reason: verification
          ? "The candidate-only finding did not reproduce in the verification scan."
          : "A fresh candidate verification scan is required before this can qualify.",
        attempts: verification ? 2 : 1,
      }));
    }
  }

  const verificationComplete = !verificationRequired || Boolean(verification && scanEvidenceComplete(verification));
  return {
    newRegressions,
    existingIssues,
    fixedIssues,
    unverifiedChanges,
    qualifyingRegressionCount: newRegressions.length,
    verificationRequired,
    evidenceComplete: scanEvidenceComplete(baseline) && scanEvidenceComplete(candidate) && verificationComplete && (!hasCoverageGap || newRegressions.length > 0),
  };
}

export function deriveChallengeVerdict(input: {
  existingQaVerdict: ExistingQaVerdict;
  qualifyingRegressionCount: number;
  evidenceComplete: boolean;
}): ChallengeVerdict {
  if (!input.evidenceComplete) return "INSUFFICIENT_EVIDENCE";
  if (input.qualifyingRegressionCount > 0) {
    return input.existingQaVerdict === "PASSED" ? "ALT_QR_WON" : "RELEASE_HAS_REGRESSIONS";
  }
  return "NO_QUALIFYING_MISS";
}
