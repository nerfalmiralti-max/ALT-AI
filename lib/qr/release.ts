import type { IssueDeltaSummary, PageAudit, ReleaseGateConfig, ReleaseGateResult, ScanIssue, ScoreResult, ShipVerdict } from "./types";

export const DEFAULT_RELEASE_GATE: ReleaseGateConfig = Object.freeze({
  minimumScore: 80,
  failOnCritical: true,
  maximumBrokenPages: 0,
  maximumBrokenLinks: 0,
});

function activeIssues(issues: ScanIssue[]) {
  return issues.filter((issue) => issue.lifecycle !== "IGNORED" && issue.severity !== "PASS");
}

export function evaluateReleaseGate(score: ScoreResult, issues: ScanIssue[], pages: PageAudit[], config: ReleaseGateConfig): ReleaseGateResult {
  const active = activeIssues(issues);
  const critical = active.filter((issue) => issue.severity === "CRITICAL").length;
  const brokenPages = pages.filter((page) => page.status === 0 || page.status >= 400 || ["NAVIGATION_FAILED", "PRIMARY_INSPECTION_FAILED", "PAGE_INSPECTION_FAILED", "REDIRECT_LIMIT", "UNSAFE_REDIRECT", "RESPONSE_TOO_LARGE", "UNSUPPORTED_CONTENT_TYPE"].includes(page.failure?.code ?? "")).length;
  const brokenLinks = active.filter((issue) => issue.ruleId === "broken-link").length;
  const checks: ReleaseGateResult["checks"] = [
    { id: "minimum-score", label: "Minimum launch score", passed: score.overall >= config.minimumScore, actual: score.overall, expected: `≥ ${config.minimumScore}` },
    { id: "critical-issues", label: "Critical findings", passed: !config.failOnCritical || critical === 0, actual: critical, expected: config.failOnCritical ? "0" : "not enforced" },
    { id: "broken-pages", label: "Broken pages", passed: brokenPages <= config.maximumBrokenPages, actual: brokenPages, expected: `≤ ${config.maximumBrokenPages}` },
    { id: "broken-links", label: "Broken internal links", passed: brokenLinks <= config.maximumBrokenLinks, actual: brokenLinks, expected: `≤ ${config.maximumBrokenLinks}` },
  ];
  return { status: checks.every((check) => check.passed) ? "PASS" : "FAIL", checks };
}

export function deriveShipVerdict(gate: ReleaseGateResult, issues: ScanIssue[], delta?: IssueDeltaSummary, hasIncompleteAudit = false): ShipVerdict {
  const failedBlocker = gate.checks.some((check) => !check.passed && check.id !== "minimum-score");
  if (failedBlocker) return "BLOCKED";
  if (gate.status === "FAIL") return "NEEDS ATTENTION";
  const unresolved = activeIssues(issues).filter((issue) => issue.severity === "CRITICAL" || issue.severity === "WARNING" || issue.severity === "NOTICE").length;
  const activeDeltaWarning = delta?.items.some((item) => (item.status === "NEW" || item.status === "REGRESSION") && item.current?.lifecycle !== "IGNORED") ?? false;
  if (unresolved > 0 || activeDeltaWarning || hasIncompleteAudit) return "READY WITH WARNINGS";
  return "READY TO SHIP";
}
