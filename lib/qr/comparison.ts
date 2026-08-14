import type { IssueCategory, IssueDeltaItem, IssueDeltaSummary, MetricMovement, PerformanceReading, ScanDelta, ScanIssue, ScanRecord } from "./types";

const SEVERITY_RANK: Record<ScanIssue["severity"], number> = { PASS: 0, NOTICE: 1, WARNING: 2, CRITICAL: 3 };

function evidenceSignature(issue: ScanIssue) {
  const evidence = issue.evidence;
  return JSON.stringify({ value: evidence.value, excerpt: evidence.excerpt, httpStatus: evidence.httpStatus, dimensions: evidence.dimensions, resourceType: evidence.resourceType });
}

function numericEvidence(issue: ScanIssue) {
  return typeof issue.evidence.value === "number" ? issue.evidence.value : undefined;
}

export function compareIssueSets(baseScanId: string, currentScanId: string, previous: ScanIssue[], current: ScanIssue[]): IssueDeltaSummary {
  const previousByFingerprint = new Map(previous.map((issue) => [issue.fingerprint, issue]));
  const currentByFingerprint = new Map(current.map((issue) => [issue.fingerprint, issue]));
  const fingerprints = new Set([...previousByFingerprint.keys(), ...currentByFingerprint.keys()]);
  const items: IssueDeltaItem[] = [];

  for (const fingerprint of fingerprints) {
    const before = previousByFingerprint.get(fingerprint);
    const after = currentByFingerprint.get(fingerprint);
    if (!before && after) {
      items.push({ fingerprint, status: "NEW", current: after, changes: ["Finding appeared in this scan"] });
      continue;
    }
    if (before && !after) {
      items.push({ fingerprint, status: "FIXED", previous: before, changes: ["Finding is no longer present"] });
      continue;
    }
    if (!before || !after) continue;
    const changes: string[] = [];
    if (before.severity !== after.severity) changes.push(`Severity ${before.severity} → ${after.severity}`);
    if (before.scoreImpact !== after.scoreImpact) changes.push(`Impact ${before.scoreImpact} → ${after.scoreImpact}`);
    if (before.lifecycle !== after.lifecycle) changes.push(`Lifecycle ${before.lifecycle} → ${after.lifecycle}`);
    if (before.occurrences !== after.occurrences) changes.push(`Occurrences ${before.occurrences} → ${after.occurrences}`);
    if (before.affectedPageIds.length !== after.affectedPageIds.length) changes.push(`Affected pages ${before.affectedPageIds.length} → ${after.affectedPageIds.length}`);
    if (evidenceSignature(before) !== evidenceSignature(after)) changes.push("Measured evidence changed");
    const beforeNumber = numericEvidence(before);
    const afterNumber = numericEvidence(after);
    const numericWorsened = typeof beforeNumber === "number" && typeof afterNumber === "number"
      && (after.ruleId === "poor-lighthouse" ? afterNumber < beforeNumber : afterNumber > beforeNumber);
    const worsened = SEVERITY_RANK[after.severity] > SEVERITY_RANK[before.severity]
      || after.scoreImpact > before.scoreImpact
      || after.occurrences > before.occurrences
      || after.affectedPageIds.length > before.affectedPageIds.length
      || numericWorsened;
    items.push({ fingerprint, previous: before, current: after, status: worsened ? "REGRESSION" : changes.length ? "CHANGED" : "UNCHANGED", changes });
  }

  return {
    baseScanId,
    currentScanId,
    newCount: items.filter((item) => item.status === "NEW").length,
    fixedCount: items.filter((item) => item.status === "FIXED").length,
    unchangedCount: items.filter((item) => item.status === "UNCHANGED").length,
    changedCount: items.filter((item) => item.status === "CHANGED").length,
    regressionCount: items.filter((item) => item.status === "REGRESSION").length,
    items,
  };
}

function performanceMovements(previous: PerformanceReading[], current: PerformanceReading[]): MetricMovement[] {
  const byKey = new Map(previous.map((reading) => [reading.key, reading]));
  return current.flatMap((reading) => {
    const before = byKey.get(reading.key);
    if (!before) return [];
    const delta = Number((reading.value - before.value).toFixed(reading.unit === "ratio" ? 3 : 0));
    return [{ key: reading.key, previous: before.value, current: reading.value, delta, improved: delta < 0 }];
  });
}

export function buildScanDelta(base: ScanRecord, current: ScanRecord): ScanDelta {
  const categoryDeltas: Partial<Record<IssueCategory, number>> = {};
  for (const category of current.score?.categories ?? []) {
    const previous = base.score?.categories.find((entry) => entry.category === category.category);
    if (previous) categoryDeltas[category.category] = category.score - previous.score;
  }
  const visualDifference = current.visualComparisons
    .filter((comparison) => comparison.baselineScanId === base.id)
    .reduce<number | undefined>((largest, comparison) => largest === undefined ? comparison.diffPercentage : Math.max(largest, comparison.diffPercentage), undefined);
  return {
    baseScanId: base.id,
    currentScanId: current.id,
    scoreDelta: (current.score?.overall ?? 0) - (base.score?.overall ?? 0),
    categoryDeltas,
    issues: compareIssueSets(base.id, current.id, base.issues, current.issues),
    performance: performanceMovements(base.performance ?? [], current.performance ?? []),
    visualDifference,
  };
}
