import { randomUUID } from "node:crypto";

import { challengeIssueIdentity } from "./challenge";
import { redactSensitiveUrl, sanitizeDiagnosticText } from "./sanitize";
import type {
  ChallengeComparison,
  ChallengeEvidence,
  ChallengeFinding,
  FinalVerificationVerdict,
  JudgeDecision,
  NormalizedSwarmFinding,
  PreliminaryVerdict,
  QaRole,
  QaRoleRun,
  RawSwarmFinding,
  RedTeamStatus,
  ScanIssue,
  ScanRecord,
  SwarmRun,
} from "./types";
import { QA_ROLES } from "./types";
import { isCrawlableUrl, normalizeUrl } from "./url";

export type QaRoleDefinition = {
  role: QaRole;
  mission: string;
  ruleIds: string[];
};

export const QA_ROLE_DEFINITIONS: QaRoleDefinition[] = [
  {
    role: "EXPLORER",
    mission: "Check realistic navigation and primary page availability without activating destructive actions.",
    ruleIds: ["http-status", "broken-link", "missing-title", "missing-h1", "missing-lang", "missing-viewport"],
  },
  {
    role: "BREAKER",
    mission: "Look for deterministic interaction hazards, invalid structure, repeated-action risk, and controls that cannot be used reliably.",
    ruleIds: ["duplicate-id", "unlabeled-control", "heading-order", "page-error", "request-failure"],
  },
  {
    role: "NETWORK",
    mission: "Inspect HTTP failures, failed resources, broken destinations, and request-level release regressions.",
    ruleIds: ["http-status", "broken-link", "request-failure", "missing-csp", "missing-hsts"],
  },
  {
    role: "STATE",
    mission: "Inspect refresh- and navigation-sensitive evidence for unusable or contradictory application states.",
    ruleIds: ["page-error", "unlabeled-control", "duplicate-id"],
  },
  {
    role: "RESPONSIVE",
    mission: "Check material desktop/mobile usability failures such as overflow, hidden interaction surfaces, and missing viewport behavior.",
    ruleIds: ["horizontal-overflow", "missing-viewport", "unlabeled-control"],
  },
  {
    role: "RUNTIME",
    mission: "Inspect behavior-correlated exceptions, console failures, navigation crashes, and failed browser execution.",
    ruleIds: ["console-error", "page-error", "request-failure"],
  },
];

const ENVIRONMENTAL_RULES = new Set(["poor-lighthouse", "slow-response"]);

function cleanText(value: string | undefined, max = 800) {
  return sanitizeDiagnosticText(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function routeOf(raw: string | undefined) {
  try {
    const url = new URL(redactSensitiveUrl(raw ?? ""));
    return `${url.pathname || "/"}${url.search}`;
  } catch {
    return "/";
  }
}

function safeEvidence(issue: ScanIssue): ChallengeEvidence {
  const source = issue.evidence;
  return {
    url: redactSensitiveUrl(source.url).slice(0, 2_048),
    selector: source.selector ? cleanText(source.selector, 500) : undefined,
    value: typeof source.value === "string" ? cleanText(source.value, 500) : source.value,
    excerpt: source.excerpt ? cleanText(source.excerpt) : undefined,
    viewport: source.viewport,
    boundingBox: source.boundingBox,
    httpStatus: source.httpStatus,
    requestUrl: source.requestUrl ? redactSensitiveUrl(source.requestUrl).slice(0, 2_048) : undefined,
    consoleMessage: source.consoleMessage ? cleanText(source.consoleMessage) : undefined,
    axeNode: source.axeNode ? cleanText(source.axeNode) : undefined,
    dimensions: source.dimensions,
    resourceType: source.resourceType,
    screenshotId: source.screenshotId ? cleanText(source.screenshotId, 100) : undefined,
  };
}

function rawFinding(role: QaRole | "RED_TEAM", runId: string, issue: ScanIssue, source: RawSwarmFinding["source"]): RawSwarmFinding {
  const evidence = safeEvidence(issue);
  return {
    id: randomUUID(),
    role,
    runId,
    source,
    issueIdentity: challengeIssueIdentity(issue),
    ruleId: issue.ruleId,
    category: issue.category,
    severity: issue.severity,
    title: cleanText(issue.title, 200) || "Scanner finding",
    route: routeOf(issue.evidence.url),
    interaction: issue.evidence.selector
      ? cleanText(issue.evidence.selector, 300)
      : issue.evidence.requestUrl
        ? routeOf(issue.evidence.requestUrl)
        : ["console-error", "page-error"].includes(issue.ruleId) ? "Page runtime" : undefined,
    observedBehavior: cleanText(issue.description, 600) || "The scanner recorded evidence for this finding.",
    evidence,
    discoveredAt: new Date().toISOString(),
    initialConfidence: issue.evidence.url ? "OBSERVED" : "TENTATIVE",
    reproductionStatus: "PENDING",
  };
}

type RoleContext = { runId: string; production: ScanRecord; candidate: ScanRecord };
type RoleExecutor = (definition: QaRoleDefinition, context: Readonly<RoleContext>) => Promise<ScanIssue[]>;

class RoleTimeoutError extends Error {}

async function withinTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new RoleTimeoutError("Role execution timed out")), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function defaultRoleExecutor(definition: QaRoleDefinition, context: Readonly<RoleContext>) {
  return context.candidate.issues.filter((issue) => definition.ruleIds.includes(issue.ruleId) && issue.lifecycle === "ACTIVE");
}

export async function runIndependentRoles(
  context: RoleContext,
  options: { timeoutMs: number; execute?: RoleExecutor },
): Promise<QaRoleRun[]> {
  const execute = options.execute ?? defaultRoleExecutor;
  return Promise.all(QA_ROLE_DEFINITIONS.map(async (definition): Promise<QaRoleRun> => {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    try {
      const issues = await withinTimeout(execute(definition, Object.freeze({ ...context })), options.timeoutMs);
      const completedAt = new Date().toISOString();
      return {
        role: definition.role,
        mission: definition.mission,
        status: "COMPLETE",
        startedAt,
        completedAt,
        durationMs: Math.round(performance.now() - started),
        actionCount: context.candidate.pages.length,
        findings: issues.slice(0, 200).map((issue) => rawFinding(definition.role, context.runId, issue, "PRIMARY")),
      };
    } catch (error) {
      const timedOut = error instanceof RoleTimeoutError;
      return {
        role: definition.role,
        mission: definition.mission,
        status: timedOut ? "TIMED_OUT" : "FAILED",
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
        actionCount: 0,
        findings: [],
        failure: {
          code: timedOut ? "ROLE_TIMEOUT" : "ROLE_FAILED",
          message: timedOut ? "The role exceeded its execution deadline." : "The role could not complete its evidence pass.",
        },
      };
    }
  }));
}

function roleOrder(role: QaRole | "RED_TEAM") {
  return role === "RED_TEAM" ? QA_ROLES.length : QA_ROLES.indexOf(role);
}

export function normalizeSwarmFindings(rawFindings: RawSwarmFinding[]): NormalizedSwarmFinding[] {
  const groups = new Map<string, RawSwarmFinding[]>();
  for (const finding of rawFindings) {
    const key = `${finding.source}|${finding.issueIdentity}`;
    const group = groups.get(key) ?? [];
    group.push(finding);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([normalizationKey, group]) => {
    const canonical = group[0]!;
    const roles = [...new Set(group.map((entry) => entry.role))].sort((left, right) => roleOrder(left) - roleOrder(right));
    return {
      id: randomUUID(),
      normalizationKey,
      canonicalRawFindingId: canonical.id,
      rawFindingIds: group.map((entry) => entry.id),
      roles,
      source: canonical.source,
      ruleId: canonical.ruleId,
      category: canonical.category,
      severity: canonical.severity,
      title: canonical.title,
      route: canonical.route,
      interaction: canonical.interaction,
      evidence: group.map((entry) => entry.evidence).slice(0, 12),
    };
  });
}

function findingMap(findings: ChallengeFinding[]) {
  return new Map(findings.map((finding) => [finding.identity, finding]));
}

function isReleaseBlocker(finding: RawSwarmFinding) {
  return finding.severity === "CRITICAL" || finding.severity === "WARNING";
}

export function judgeSwarmFindings(
  rawFindings: RawSwarmFinding[],
  normalizedFindings: NormalizedSwarmFinding[],
  comparison: ChallengeComparison,
): JudgeDecision[] {
  const confirmed = findingMap(comparison.newRegressions);
  const baseline = findingMap(comparison.existingIssues);
  const unverified = findingMap(comparison.unverifiedChanges);
  const rawById = new Map(rawFindings.map((finding) => [finding.id, finding]));
  const decisions: JudgeDecision[] = [];

  for (const normalized of normalizedFindings) {
    const canonical = rawById.get(normalized.canonicalRawFindingId);
    if (!canonical) continue;
    const confirmedFinding = confirmed.get(canonical.issueIdentity);
    const baselineFinding = baseline.get(canonical.issueIdentity);
    const weakFinding = unverified.get(canonical.issueIdentity);
    const decisionId = randomUUID();
    let disposition: JudgeDecision["disposition"] = "REJECTED";
    let reason = "The independent comparison did not retain evidence for this observation.";
    let candidateReproduction = { observed: 0, attempts: 1 };
    let baselineReproduction = { observed: 0, attempts: 1 };

    if (ENVIRONMENTAL_RULES.has(canonical.ruleId)) {
      disposition = "ENVIRONMENTAL";
      reason = "The observed variance cannot be attributed reliably to the candidate environment.";
    } else if (confirmedFinding) {
      disposition = "CONFIRMED";
      reason = cleanText(confirmedFinding.reason, 800) || "A fresh candidate verification reproduced evidence that was absent from the covered production route.";
      candidateReproduction = { ...confirmedFinding.reproduction };
    } else if (baselineFinding) {
      disposition = "BASELINE_ISSUE";
      reason = "Equivalent evidence exists in production, so this is not a candidate-only regression.";
      candidateReproduction = { observed: 1, attempts: 1 };
      baselineReproduction = { observed: 1, attempts: 1 };
    } else if (weakFinding) {
      disposition = ENVIRONMENTAL_RULES.has(weakFinding.ruleId) ? "ENVIRONMENTAL" : "UNVERIFIED";
      reason = cleanText(weakFinding.reason, 800) || "The observation did not meet the independent reproduction standard.";
      candidateReproduction = { ...weakFinding.reproduction };
    }

    decisions.push({
      id: decisionId,
      rawFindingId: canonical.id,
      normalizedFindingId: normalized.id,
      disposition,
      reason,
      releaseBlocker: disposition === "CONFIRMED" && isReleaseBlocker(canonical),
      source: canonical.source,
      roles: normalized.roles,
      reproduction: { candidate: candidateReproduction, baseline: baselineReproduction },
      decidedAt: new Date().toISOString(),
    });

    for (const duplicateId of normalized.rawFindingIds.slice(1)) {
      decisions.push({
        id: randomUUID(),
        rawFindingId: duplicateId,
        normalizedFindingId: normalized.id,
        canonicalDecisionId: decisionId,
        disposition: "DUPLICATE",
        reason: "This role recorded the same route, rule, and evidence signature as the canonical observation.",
        releaseBlocker: false,
        source: canonical.source,
        roles: normalized.roles,
        reproduction: { candidate: candidateReproduction, baseline: baselineReproduction },
        decidedAt: new Date().toISOString(),
      });
    }
  }
  return decisions;
}

export function derivePreliminaryVerdict(input: {
  decisions: Pick<JudgeDecision, "disposition" | "releaseBlocker">[];
  rolesComplete: boolean;
  evidenceComplete: boolean;
}): PreliminaryVerdict {
  if (input.decisions.some((decision) => decision.disposition === "CONFIRMED" && decision.releaseBlocker)) return "PRELIMINARY_HOLD";
  if (!input.rolesComplete || !input.evidenceComplete) return "PRELIMINARY_INCOMPLETE";
  return "PRELIMINARY_READY";
}

export function deriveFinalVerification(input: {
  preliminaryVerdict: PreliminaryVerdict;
  redTeamStatus: RedTeamStatus;
  redTeamDecisions: Pick<JudgeDecision, "disposition" | "releaseBlocker">[];
}): { finalVerdict: FinalVerificationVerdict; adversariallyVerified: boolean; readyRevoked: boolean } {
  if (input.preliminaryVerdict === "PRELIMINARY_HOLD") return { finalVerdict: "HOLD", adversariallyVerified: false, readyRevoked: false };
  if (input.preliminaryVerdict === "PRELIMINARY_INCOMPLETE") return { finalVerdict: "INCOMPLETE", adversariallyVerified: false, readyRevoked: false };
  const blocker = input.redTeamDecisions.some((decision) => decision.disposition === "CONFIRMED" && decision.releaseBlocker);
  if (input.redTeamStatus === "BLOCKER_FOUND" && blocker) return { finalVerdict: "HOLD", adversariallyVerified: true, readyRevoked: true };
  if (input.redTeamStatus === "CLEAR") return { finalVerdict: "READY", adversariallyVerified: true, readyRevoked: false };
  return { finalVerdict: "INCOMPLETE", adversariallyVerified: false, readyRevoked: false };
}

export function swarmCounts(decisions: JudgeDecision[], normalizedCount: number, discovered: number): SwarmRun["counts"] {
  const count = (disposition: JudgeDecision["disposition"]) => decisions.filter((entry) => entry.disposition === disposition).length;
  return {
    discovered,
    normalized: normalizedCount,
    confirmed: count("CONFIRMED"),
    rejected: count("REJECTED"),
    duplicates: count("DUPLICATE"),
    baselineIssues: count("BASELINE_ISSUE"),
    unverified: count("UNVERIFIED"),
    environmental: count("ENVIRONMENTAL"),
    releaseBlockers: decisions.filter((entry) => entry.disposition === "CONFIRMED" && entry.releaseBlocker).length,
  };
}

export function createSwarmRun(challengeId: string, challengeRunId: string): SwarmRun {
  return {
    id: randomUUID(), challengeId, challengeRunId, createdAt: new Date().toISOString(), stage: "PENDING",
    roleRuns: QA_ROLE_DEFINITIONS.map((definition) => ({ role: definition.role, mission: definition.mission, status: "PENDING", durationMs: 0, actionCount: 0, findings: [] })),
    rawFindings: [], normalizedFindings: [], judgeDecisions: [],
    redTeam: { status: "NOT_STARTED", targetRoutes: [], scanIds: {}, rawFindings: [], normalizedFindings: [], decisions: [] },
    adversariallyVerified: false, readyRevoked: false,
    counts: { discovered: 0, normalized: 0, confirmed: 0, rejected: 0, duplicates: 0, baselineIssues: 0, unverified: 0, environmental: 0, releaseBlockers: 0 },
    operations: { durationMs: 0, roleDurationMs: 0, actionCount: 0, verificationRetries: 0 }, events: [],
  };
}

export type RedTeamTarget = { route: string; productionUrl: string; candidateUrl: string };

export function selectRedTeamTargets(production: ScanRecord, candidate: ScanRecord, maxTargets: number): RedTeamTarget[] {
  const candidateOrigin = new URL(candidate.normalizedUrl).origin;
  const productionOrigin = new URL(production.normalizedUrl).origin;
  const inspected = new Set(candidate.pages.map((page) => normalizeUrl(page.url)));
  const candidates = [
    ...candidate.coverage.unverifiedUrls,
    ...candidate.pages.flatMap((page) => page.facts.links.map((link) => link.href)),
  ];
  const selected: RedTeamTarget[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    let candidateUrl: string;
    try { candidateUrl = normalizeUrl(new URL(raw, candidate.normalizedUrl).toString()); } catch { continue; }
    if (seen.has(candidateUrl) || inspected.has(candidateUrl) || !isCrawlableUrl(candidateUrl, candidateOrigin)) continue;
    seen.add(candidateUrl);
    const parsed = new URL(candidateUrl);
    const productionUrl = new URL(`${parsed.pathname}${parsed.search}`, productionOrigin).toString();
    selected.push({ route: `${parsed.pathname}${parsed.search}`, productionUrl, candidateUrl });
    if (selected.length >= maxTargets) break;
  }
  return selected;
}

export function redTeamRawFindings(runId: string, comparison: ChallengeComparison) {
  return [...comparison.newRegressions, ...comparison.existingIssues, ...comparison.unverifiedChanges].map((finding) => ({
    id: randomUUID(), role: "RED_TEAM" as const, runId, source: "RED_TEAM" as const, issueIdentity: finding.identity, ruleId: finding.ruleId,
    category: finding.category, severity: finding.severity, title: cleanText(finding.title, 200), route: finding.route, interaction: finding.affectedInteraction,
    observedBehavior: cleanText(finding.description, 600), evidence: finding.candidateEvidence ?? { url: finding.route }, discoveredAt: new Date().toISOString(),
    initialConfidence: "OBSERVED" as const, reproductionStatus: finding.confidence === "CONFIRMED" ? "REPRODUCED" as const : "NOT_REPRODUCED" as const,
  }));
}

function mergeFindings(left: ChallengeFinding[], right: ChallengeFinding[]) {
  const byIdentity = new Map(left.map((finding) => [finding.identity, finding]));
  for (const finding of right) byIdentity.set(finding.identity, finding);
  return [...byIdentity.values()];
}

export function mergeChallengeComparisons(primary: ChallengeComparison, adversarial: ChallengeComparison): ChallengeComparison {
  const primaryClass = new Map([...primary.newRegressions, ...primary.existingIssues, ...primary.fixedIssues, ...primary.unverifiedChanges].map((finding) => [finding.identity, finding.classification]));
  const adversarialFindings = [...adversarial.newRegressions, ...adversarial.existingIssues, ...adversarial.fixedIssues, ...adversarial.unverifiedChanges];
  const adversarialClass = new Map(adversarialFindings.map((finding) => [finding.identity, finding.classification]));
  const disagreement = new Set([...primaryClass].filter(([identity, classification]) => adversarialClass.has(identity) && adversarialClass.get(identity) !== classification).map(([identity]) => identity));
  const withoutDisagreement = (findings: ChallengeFinding[]) => findings.filter((finding) => !disagreement.has(finding.identity));
  const newRegressions = mergeFindings(withoutDisagreement(primary.newRegressions), withoutDisagreement(adversarial.newRegressions));
  const existingIssues = mergeFindings(withoutDisagreement(primary.existingIssues), withoutDisagreement(adversarial.existingIssues));
  const fixedIssues = mergeFindings(withoutDisagreement(primary.fixedIssues), withoutDisagreement(adversarial.fixedIssues));
  const settled = new Set([...newRegressions, ...existingIssues, ...fixedIssues].map((finding) => finding.identity));
  const disagreementFindings = [...disagreement].map((identity) => {
    const source = adversarialFindings.find((finding) => finding.identity === identity)
      ?? [...primary.newRegressions, ...primary.existingIssues, ...primary.fixedIssues, ...primary.unverifiedChanges].find((finding) => finding.identity === identity)!;
    return { ...source, classification: "UNVERIFIED" as const, confidence: "UNVERIFIED" as const, reason: "Primary and adversarial evidence disagreed, so no confirmed claim was made." };
  });
  return {
    newRegressions,
    existingIssues,
    fixedIssues,
    unverifiedChanges: mergeFindings(withoutDisagreement(primary.unverifiedChanges), withoutDisagreement(adversarial.unverifiedChanges))
      .filter((finding) => !settled.has(finding.identity))
      .concat(disagreementFindings),
    qualifyingRegressionCount: newRegressions.length,
    verificationRequired: primary.verificationRequired || adversarial.verificationRequired,
    evidenceComplete: primary.evidenceComplete && adversarial.evidenceComplete && disagreement.size === 0,
  };
}
