import type { ProjectRecord, ScanRecord } from "./types";

export function buildReleaseReceipt(scan: ScanRecord, project: ProjectRecord) {
  return {
    product: "ALT QR",
    formatVersion: "2.0",
    generatedAt: new Date().toISOString(),
    project: { id: project.id, name: project.name, origin: project.origin, baselineScanId: project.baselineScanId ?? null },
    scan: {
      id: scan.id,
      targetUrl: scan.normalizedUrl,
      createdAt: scan.createdAt,
      completedAt: scan.completedAt ?? null,
      scannerVersion: scan.scannerVersion,
      rulesVersion: scan.rulesVersion,
      config: scan.configSnapshot,
    },
    release: { verdict: scan.verdict ?? null, gate: scan.releaseGate ?? null, score: scan.score ?? null },
    change: {
      previous: scan.comparisons.previous ? {
        scanId: scan.comparisons.previous.baseScanId,
        scoreDelta: scan.comparisons.previous.scoreDelta,
        new: scan.comparisons.previous.issues.newCount,
        fixed: scan.comparisons.previous.issues.fixedCount,
        regressions: scan.comparisons.previous.issues.regressionCount,
        visualDifference: scan.comparisons.previous.visualDifference ?? null,
      } : null,
      baseline: scan.comparisons.baseline ? {
        scanId: scan.comparisons.baseline.baseScanId,
        scoreDelta: scan.comparisons.baseline.scoreDelta,
        new: scan.comparisons.baseline.issues.newCount,
        fixed: scan.comparisons.baseline.issues.fixedCount,
        regressions: scan.comparisons.baseline.issues.regressionCount,
        visualDifference: scan.comparisons.baseline.visualDifference ?? null,
      } : null,
    },
    coverage: scan.coverage,
    timings: scan.timings,
    performance: scan.performance,
    issues: {
      active: scan.issues.filter((issue) => issue.lifecycle === "ACTIVE").map((issue) => ({ fingerprint: issue.fingerprint, ruleId: issue.ruleId, severity: issue.severity, scope: issue.scope, affectedPages: issue.affectedPageIds.length })),
      ignored: scan.issues.filter((issue) => issue.lifecycle === "IGNORED").map((issue) => ({ fingerprint: issue.fingerprint, ruleId: issue.ruleId, severity: issue.severity, scope: issue.scope })),
    },
  };
}
