import { redactSensitiveUrl, sanitizeDiagnosticText } from "./sanitize";
import { getScan } from "./store";
import type { ChallengeEvidence, ChallengeRecord, RawSwarmFinding, ScanRecord, SwarmRun } from "./types";

function safeText(value: string | undefined, max = 500) {
  return value ? sanitizeDiagnosticText(value).replace(/\s+/g, " ").trim().slice(0, max) : undefined;
}

function scanSummary(scan: ScanRecord | null) {
  if (!scan) return null;
  const desktop = scan.screenshots.find((asset) => asset.viewport === "desktop");
  return {
    id: scan.id,
    role: scan.challengeContext?.role,
    targetUrl: redactSensitiveUrl(scan.normalizedUrl),
    createdAt: scan.createdAt,
    completedAt: scan.completedAt,
    progress: {
      stage: scan.progress.stage,
      detail: safeText(scan.progress.detail),
      completedUnits: scan.progress.completedUnits,
      totalUnits: scan.progress.totalUnits,
      currentUrl: scan.progress.currentUrl ? redactSensitiveUrl(scan.progress.currentUrl) : undefined,
      updatedAt: scan.progress.updatedAt,
    },
    score: scan.score?.overall,
    verdict: scan.verdict,
    coverage: scan.coverage,
    screenshot: desktop ? {
      url: `/api/assets/${desktop.relativePath.split("/").map(encodeURIComponent).join("/")}`,
      width: desktop.width,
      height: desktop.height,
    } : undefined,
    inspectedRoutes: scan.pages
      .filter((page) => page.status >= 200 && page.status < 400 && !page.failure)
      .map((page) => {
        try { const url = new URL(page.url); return `${url.pathname}${url.search}`; } catch { return "/"; }
      }),
    failure: scan.failure ? { code: scan.failure.code, message: safeText(scan.failure.message) } : undefined,
  };
}

function safeEvidence(evidence: ChallengeEvidence): ChallengeEvidence {
  return {
    ...evidence,
    url: redactSensitiveUrl(evidence.url).slice(0, 2_048),
    requestUrl: evidence.requestUrl ? redactSensitiveUrl(evidence.requestUrl).slice(0, 2_048) : undefined,
    selector: safeText(evidence.selector, 500),
    excerpt: safeText(evidence.excerpt, 800),
    consoleMessage: safeText(evidence.consoleMessage, 800),
    axeNode: safeText(evidence.axeNode, 800),
    value: typeof evidence.value === "string" ? safeText(evidence.value, 500) : evidence.value,
  };
}

function safeRawFinding(finding: RawSwarmFinding): RawSwarmFinding {
  return {
    ...finding,
    title: safeText(finding.title, 200) ?? "Scanner finding",
    route: safeText(redactSensitiveUrl(finding.route), 2_048) ?? "/",
    interaction: safeText(finding.interaction, 300),
    observedBehavior: safeText(finding.observedBehavior, 800) ?? "Evidence recorded.",
    evidence: safeEvidence(finding.evidence),
  };
}

function safeSwarm(swarm: SwarmRun | undefined) {
  if (!swarm) return undefined;
  return {
    ...swarm,
    roleRuns: swarm.roleRuns.map((role) => ({
      ...role,
      mission: safeText(role.mission, 500) ?? "Role-specific evidence pass.",
      findings: role.findings.map(safeRawFinding),
      failure: role.failure ? { code: role.failure.code, message: safeText(role.failure.message, 500) } : undefined,
    })),
    rawFindings: swarm.rawFindings.map(safeRawFinding),
    normalizedFindings: swarm.normalizedFindings.map((finding) => ({
      ...finding,
      title: safeText(finding.title, 200) ?? "Scanner finding",
      route: safeText(redactSensitiveUrl(finding.route), 2_048) ?? "/",
      interaction: safeText(finding.interaction, 300),
      evidence: finding.evidence.map(safeEvidence),
    })),
    judgeDecisions: swarm.judgeDecisions.map((decision) => ({ ...decision, reason: safeText(decision.reason, 800) ?? "Evidence reviewed." })),
    redTeam: {
      ...swarm.redTeam,
      targetRoutes: swarm.redTeam.targetRoutes.map((route) => safeText(redactSensitiveUrl(route), 2_048) ?? "/"),
      rawFindings: swarm.redTeam.rawFindings.map(safeRawFinding),
      normalizedFindings: swarm.redTeam.normalizedFindings.map((finding) => ({
        ...finding,
        title: safeText(finding.title, 200) ?? "Scanner finding",
        route: safeText(redactSensitiveUrl(finding.route), 2_048) ?? "/",
        interaction: safeText(finding.interaction, 300),
        evidence: finding.evidence.map(safeEvidence),
      })),
      decisions: swarm.redTeam.decisions.map((decision) => ({ ...decision, reason: safeText(decision.reason, 800) ?? "Evidence reviewed." })),
      failure: swarm.redTeam.failure ? { code: swarm.redTeam.failure.code, message: safeText(swarm.redTeam.failure.message, 500) } : undefined,
    },
    events: swarm.events.map((entry) => ({ ...entry, detail: safeText(entry.detail, 500) })),
    failure: swarm.failure ? { code: swarm.failure.code, message: safeText(swarm.failure.message, 500) } : undefined,
  };
}

export async function presentChallenge(challenge: ChallengeRecord) {
  const scanIds = [...new Set(challenge.runs.flatMap((run) => [
    ...Object.values(run.scanIds),
    ...Object.values(run.swarm?.redTeam.scanIds ?? {}),
  ]).filter((id): id is string => Boolean(id)))];
  const scans = await Promise.all(scanIds.map(getScan));
  const byId = new Map(scans.filter((scan): scan is ScanRecord => Boolean(scan)).map((scan) => [scan.id, scan]));
  return {
    id: challenge.id,
    projectId: challenge.projectId,
    productionUrl: redactSensitiveUrl(challenge.productionUrl),
    candidateUrl: redactSensitiveUrl(challenge.candidateUrl),
    pullRequestUrl: challenge.pullRequestUrl ? redactSensitiveUrl(challenge.pullRequestUrl) : undefined,
    qaStack: safeText(challenge.qaStack, 300),
    existingQaVerdict: challenge.existingQaVerdict,
    status: challenge.status,
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt,
    activeRunId: challenge.activeRunId,
    runs: challenge.runs.map((run) => ({
      ...run,
      swarm: safeSwarm(run.swarm),
      failure: run.failure ? { code: run.failure.code, message: safeText(run.failure.message) } : undefined,
      scans: {
        production: scanSummary(run.scanIds.production ? byId.get(run.scanIds.production) ?? null : null),
        candidate: scanSummary(run.scanIds.candidate ? byId.get(run.scanIds.candidate) ?? null : null),
        verification: scanSummary(run.scanIds.verification ? byId.get(run.scanIds.verification) ?? null : null),
      },
      redTeamScans: {
        production: scanSummary(run.swarm?.redTeam.scanIds.production ? byId.get(run.swarm.redTeam.scanIds.production) ?? null : null),
        candidate: scanSummary(run.swarm?.redTeam.scanIds.candidate ? byId.get(run.swarm.redTeam.scanIds.candidate) ?? null : null),
        verification: scanSummary(run.swarm?.redTeam.scanIds.verification ? byId.get(run.swarm.redTeam.scanIds.verification) ?? null : null),
      },
    })),
  };
}

export type ChallengePresentation = Awaited<ReturnType<typeof presentChallenge>>;
