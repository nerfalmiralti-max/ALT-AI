import { ISSUE_CATEGORIES, type IssueCategory, type ScanIssue, type ScoreResult } from "./types";

export const CATEGORY_WEIGHTS: Record<IssueCategory, number> = {
  performance: 20,
  accessibility: 20,
  seo: 15,
  mobile: 15,
  links: 10,
  browser: 10,
  infrastructure: 10,
};

export const SCORE_THRESHOLDS = {
  READY: 90,
  "ALMOST READY": 75,
  "NEEDS WORK": 50,
} as const;

export function calculateScore(issues: ScanIssue[]): ScoreResult {
  const categories = ISSUE_CATEGORIES.map((category) => {
    const relevant = issues.filter((issue) => issue.category === category && issue.severity !== "PASS" && issue.lifecycle !== "IGNORED");
    const score = Math.max(0, 100 - relevant.reduce((sum, issue) => sum + issue.scoreImpact, 0));
    return { category, score, weight: CATEGORY_WEIGHTS[category], issueCount: relevant.length };
  });
  const overall = Math.round(categories.reduce((sum, category) => sum + category.score * category.weight, 0) / 100);
  const status = overall >= SCORE_THRESHOLDS.READY
    ? "READY"
    : overall >= SCORE_THRESHOLDS["ALMOST READY"]
      ? "ALMOST READY"
      : overall >= SCORE_THRESHOLDS["NEEDS WORK"]
        ? "NEEDS WORK"
        : "NOT READY";
  return { overall, status, categories };
}
