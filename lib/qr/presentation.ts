import type { ProjectRecord, ScanRecord } from "./types";
import { sanitizeDiagnosticText } from "./sanitize";

export type ReleaseState = "ready" | "attention" | "blocked" | "scanning" | "failed" | "unscanned";

export type ProjectReleaseSummary = {
  state: ReleaseState;
  label: string;
  reason: string;
  score: number | null;
  scanId: string | null;
  updatedAt: string;
  blockers: number;
};

const ACTIVE_STAGES = new Set<ScanRecord["progress"]["stage"]>([
  "QUEUED", "DISCOVERING", "INSPECTING", "AUDITING", "CAPTURING", "COMPARING", "SCORING",
]);

function sentence(value: string) {
  const clean = value.trim().replace(/[.!?]+$/, "");
  return clean ? `${clean}.` : "No additional detail was recorded.";
}

function publicFailureReason(value: string) {
  if (/\bnet::|\b(?:page|browser|context)\.\w+\s*:/i.test(value)) {
    return "ALT QR could not inspect the target's primary document. Confirm that the public URL is reachable and try again.";
  }
  return sentence(sanitizeDiagnosticText(value));
}

export function summarizeProjectRelease(project: ProjectRecord, scan: ScanRecord | null | undefined): ProjectReleaseSummary {
  if (!scan) return {
    state: "unscanned",
    label: "Not scanned",
    reason: "Run the first scan to establish a release state.",
    score: null,
    scanId: null,
    updatedAt: project.updatedAt,
    blockers: 0,
  };

  const base = {
    score: scan.score?.overall ?? null,
    scanId: scan.id,
    updatedAt: scan.completedAt ?? scan.progress.updatedAt ?? scan.createdAt,
    blockers: scan.issueGroups.filter((group) => group.lifecycle === "ACTIVE" && group.severity === "CRITICAL").length,
  };

  if (ACTIVE_STAGES.has(scan.progress.stage)) return {
    ...base,
    state: "scanning",
    label: "Scan in progress",
    reason: sentence(scan.progress.detail || "Release evidence is still being collected"),
  };

  if (scan.progress.stage === "FAILED" || scan.progress.stage === "CANCELLED") return {
    ...base,
    state: "failed",
    label: scan.progress.stage === "CANCELLED" ? "Scan cancelled" : "Scan incomplete",
    reason: publicFailureReason(scan.failure?.message || scan.progress.detail || "The scan could not complete"),
  };

  const failedCheck = scan.releaseGate?.checks.find((check) => !check.passed);
  if (scan.releaseGate?.status === "FAIL" || scan.verdict === "BLOCKED") return {
    ...base,
    state: "blocked",
    label: "Blocked",
    reason: failedCheck
      ? `${failedCheck.label}: ${failedCheck.actual} (expected ${failedCheck.expected}).`
      : sentence(scan.fixQueue[0]?.title || "The stored release gate is failing"),
  };

  if (scan.verdict === "READY TO SHIP" && scan.releaseGate?.status === "PASS") return {
    ...base,
    state: "ready",
    label: "Ready to ship",
    reason: "All configured release-gate checks passed.",
  };

  return {
    ...base,
    state: "attention",
    label: scan.verdict === "READY WITH WARNINGS" ? "Ready with warnings" : "Needs attention",
    reason: sentence(scan.fixQueue[0]?.title || "Review the remaining measured findings before release"),
  };
}

export function comparisonTargets(scan: ScanRecord) {
  const targets: Array<"previous" | "baseline"> = [];
  if (scan.comparisons.previous) targets.push("previous");
  if (scan.comparisons.baseline) targets.push("baseline");
  return targets;
}
