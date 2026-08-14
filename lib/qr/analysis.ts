import type { FixQueueItem, IssueGroup, PageAudit, PageHealth, ReleaseGateResult, ScanIssue, VisualComparison } from "./types";

const SEVERITY_RANK: Record<ScanIssue["severity"], number> = { PASS: 0, NOTICE: 1, WARNING: 2, CRITICAL: 3 };

export function groupIssues(issues: ScanIssue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const key = `${issue.ruleId}|${issue.title}|${issue.scope}|${issue.severity}|${issue.lifecycle}`;
    const current = groups.get(key);
    const pages = issue.affectedPageIds.length ? issue.affectedPageIds : [issue.evidence.url];
    if (!current) {
      groups.set(key, {
        key,
        ruleId: issue.ruleId,
        title: issue.title,
        scope: issue.scope,
        severity: issue.severity,
        lifecycle: issue.lifecycle,
        count: issue.occurrences,
        affectedPages: [...new Set(pages)],
        scoreImpact: issue.scoreImpact,
        fingerprints: [issue.fingerprint],
      });
      continue;
    }
    current.count += issue.occurrences;
    current.affectedPages = [...new Set([...current.affectedPages, ...pages])];
    current.scoreImpact += issue.scoreImpact;
    current.fingerprints.push(issue.fingerprint);
  }
  return [...groups.values()].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.affectedPages.length - a.affectedPages.length || b.scoreImpact - a.scoreImpact);
}

export function buildPageHealth(pages: PageAudit[], issues: ScanIssue[], comparisons: VisualComparison[]): PageHealth[] {
  return pages.map((page) => {
    const relevant = issues.filter((issue) => issue.lifecycle !== "IGNORED" && (issue.evidence.url === page.url || issue.affectedPageIds.includes(page.id)));
    const blockers = relevant.filter((issue) => issue.severity === "CRITICAL").length;
    const warnings = relevant.filter((issue) => issue.severity === "WARNING").length;
    const notices = relevant.filter((issue) => issue.severity === "NOTICE").length;
    const score = Math.max(0, 100 - relevant.reduce((sum, issue) => sum + issue.scoreImpact, 0));
    const visualDifference = comparisons.filter((comparison) => comparison.currentScreenshotId && page.id === pages[0]?.id).reduce<number | undefined>((largest, comparison) => largest === undefined ? comparison.diffPercentage : Math.max(largest, comparison.diffPercentage), undefined);
    return {
      pageId: page.id,
      url: page.url,
      score,
      status: blockers ? "BLOCKED" : page.failure || page.auditFailures.length ? "PARTIAL" : warnings || notices ? "WARNINGS" : "HEALTHY",
      blockers,
      warnings,
      notices,
      networkFailures: page.networkFailures?.reduce((sum, item) => sum + item.count, 0) ?? page.requestFailures.length,
      consoleFailures: (page.consoleEvents?.reduce((sum, item) => sum + item.count, 0) ?? page.consoleErrors.length) + page.pageErrors.length,
      visualDifference,
    };
  });
}

export function buildFixQueue(groups: IssueGroup[], issues: ScanIssue[], gate?: ReleaseGateResult): FixQueueItem[] {
  const recommendationByGroup = new Map(issues.map((issue) => [`${issue.ruleId}|${issue.title}`, issue.recommendation]));
  const failedChecks = new Set(gate?.checks.filter((check) => !check.passed).map((check) => check.id) ?? []);
  const blocksGate = (group: IssueGroup) => (group.ruleId === "http-status" && failedChecks.has("broken-pages"))
    || (group.ruleId === "broken-link" && failedChecks.has("broken-links"))
    || (group.severity === "CRITICAL" && failedChecks.has("critical-issues"));
  return groups
    .filter((group) => group.lifecycle !== "IGNORED" && group.severity !== "PASS")
    .sort((a, b) => Number(blocksGate(b)) - Number(blocksGate(a))
      || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      || b.affectedPages.length - a.affectedPages.length
      || b.scoreImpact - a.scoreImpact)
    .slice(0, 8)
    .map((group, index) => ({
      rank: index + 1,
      ruleId: group.ruleId,
      title: group.title,
      severity: group.severity,
      scope: group.scope,
      affectedPages: group.affectedPages.length,
      scoreImpact: group.scoreImpact,
      gateBlocker: blocksGate(group),
      recommendation: recommendationByGroup.get(`${group.ruleId}|${group.title}`) ?? "Inspect the evidence and correct the underlying deterministic finding.",
    }));
}
