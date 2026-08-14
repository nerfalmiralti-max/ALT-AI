import type { ScanIssue } from "./types";

export function dedupeIssues(issues: ScanIssue[]) {
  const strongest = new Map<string, ScanIssue>();
  const rank = { PASS: 0, NOTICE: 1, WARNING: 2, CRITICAL: 3 } as const;
  for (const issue of issues) {
    const existing = strongest.get(issue.fingerprint);
    if (!existing) {
      strongest.set(issue.fingerprint, { ...issue, affectedPageIds: [...new Set(issue.affectedPageIds)] });
      continue;
    }
    const preferred = rank[issue.severity] > rank[existing.severity] ? issue : existing;
    strongest.set(issue.fingerprint, {
      ...preferred,
      occurrences: existing.occurrences + issue.occurrences,
      affectedPageIds: [...new Set([...existing.affectedPageIds, ...issue.affectedPageIds])],
    });
  }
  return [...strongest.values()];
}
