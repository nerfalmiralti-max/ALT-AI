import { buildChallengeComparison, deriveChallengeVerdict } from "./challenge";
import { scannerConfig } from "./config";
import { assertSafeTarget } from "./security";
import { appendChallengeRun, createScan, getChallenge, getScan, updateChallenge } from "./store";
import {
  createSwarmRun,
  deriveFinalVerification,
  derivePreliminaryVerdict,
  judgeSwarmFindings,
  mergeChallengeComparisons,
  normalizeSwarmFindings,
  redTeamRawFindings,
  runIndependentRoles,
  selectRedTeamTargets,
  swarmCounts,
} from "./swarm";
import type { ChallengeComparison, ChallengeRun, ChallengeStage, ScanRecord, SwarmEvent, SwarmRun } from "./types";
import { cancelScan, releaseScanSlot, reserveScanSlot, startScan } from "./worker";

type ActiveChallengeJob = { promise: Promise<void>; controller: AbortController; runId: string; deadline: ReturnType<typeof setTimeout> };
type ChallengeScanRole = NonNullable<ScanRecord["challengeContext"]>["role"];
declare global {
  var __altQrActiveChallengeJobs: Map<string, ActiveChallengeJob> | undefined;
  var __altQrChallengeReservations: Set<string> | undefined;
}
const activeChallengeJobs = globalThis.__altQrActiveChallengeJobs ??= new Map<string, ActiveChallengeJob>();
const challengeReservations = globalThis.__altQrChallengeReservations ??= new Set<string>();
const TERMINAL = new Set<ChallengeStage>(["COMPLETE", "CANCELLED", "FAILED"]);

export class ChallengeCapacityError extends Error {
  readonly code = "CHALLENGE_CAPACITY";
}

class ChallengeCancelledError extends Error {}
class ChallengeTimeoutError extends Error {}

function blankComparison(evidenceComplete = false): ChallengeComparison {
  return {
    newRegressions: [],
    existingIssues: [],
    fixedIssues: [],
    unverifiedChanges: [],
    qualifyingRegressionCount: 0,
    verificationRequired: false,
    evidenceComplete,
  };
}

async function mutateRun(challengeId: string, runId: string, mutation: (run: ChallengeRun) => void) {
  await updateChallenge(challengeId, (challenge) => {
    const run = challenge.runs.find((entry) => entry.id === runId);
    if (!run) throw new Error("Challenge run not found");
    mutation(run);
    challenge.status = run.progress.stage;
  });
}

async function mutateSwarm(challengeId: string, runId: string, mutation: (swarm: SwarmRun) => void) {
  await mutateRun(challengeId, runId, (run) => {
    if (!run.swarm) throw new Error("Swarm run not initialized");
    mutation(run.swarm);
    run.swarm.events = run.swarm.events.slice(-500);
  });
}

function event(name: SwarmEvent["name"], detail?: string, role?: SwarmEvent["role"]): SwarmEvent {
  return { name, at: new Date().toISOString(), detail, role };
}

async function updateProgress(challengeId: string, runId: string, stage: ChallengeStage, detail: string, currentScanId?: string) {
  await mutateRun(challengeId, runId, (run) => {
    if (TERMINAL.has(run.progress.stage) && run.progress.stage !== stage) return;
    const now = new Date().toISOString();
    if (!run.startedAt && stage !== "QUEUED") run.startedAt = now;
    run.progress = { stage, detail, currentScanId, updatedAt: now };
  });
}

async function acquireScanSlot(signal: AbortSignal) {
  while (!signal.aborted) {
    const token = reserveScanSlot();
    if (token) return token;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 250);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new ChallengeCancelledError());
      }, { once: true });
    });
  }
  throw new ChallengeCancelledError();
}

async function executeScan(
  challengeId: string,
  runId: string,
  role: ChallengeScanRole,
  rawUrl: string,
  stage: ChallengeStage,
  detail: string,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new ChallengeCancelledError();
  const safe = await assertSafeTarget(rawUrl);
  const scan = await createScan(rawUrl, safe.toString(), { challengeId, runId, role });
  await mutateRun(challengeId, runId, (run) => {
    if (role === "PRODUCTION" || role === "CANDIDATE" || role === "VERIFICATION") {
      const key = role === "PRODUCTION" ? "production" : role === "CANDIDATE" ? "candidate" : "verification";
      run.scanIds[key] = scan.id;
    } else if (run.swarm) {
      const key = role === "RED_TEAM_PRODUCTION" ? "production" : role === "RED_TEAM_CANDIDATE" ? "candidate" : "verification";
      run.swarm.redTeam.scanIds[key] = scan.id;
    }
  });
  if (role === "PRODUCTION") {
    await updateChallenge(challengeId, (challenge) => { challenge.projectId ??= scan.projectId; });
  }
  await updateProgress(challengeId, runId, stage, detail, scan.id);
  const reservation = await acquireScanSlot(signal);
  try {
    await startScan(scan.id, reservation);
  } catch (error) {
    releaseScanSlot(reservation);
    throw error;
  }
  if (signal.aborted) throw new ChallengeCancelledError();
  const completed = await getScan(scan.id);
  if (!completed) throw new Error("Challenge scan record disappeared during execution");
  return completed;
}

function completedScan(scan: ScanRecord) {
  return scan.progress.stage === "COMPLETE" && scan.pages.length > 0;
}

async function finishInsufficient(challengeId: string, runId: string, detail: string, comparison = blankComparison(false)) {
  await mutateRun(challengeId, runId, (run) => {
    const now = new Date().toISOString();
    run.comparison = { ...comparison, evidenceComplete: false };
    if (run.swarm) {
      run.swarm.stage = "FAILED";
      run.swarm.finalVerdict = "INCOMPLETE";
      run.swarm.adversariallyVerified = false;
      run.swarm.completedAt = now;
      run.swarm.operations.durationMs = run.swarm.startedAt ? Date.now() - Date.parse(run.swarm.startedAt) : 0;
      run.swarm.failure = { code: "EVIDENCE_INCOMPLETE", message: detail };
      run.swarm.events.push(event("final_verdict", "Evidence incomplete; no READY claim was made."));
    }
    run.verdict = "INSUFFICIENT_EVIDENCE";
    run.completedAt = now;
    run.progress = { ...run.progress, stage: "COMPLETE", detail, updatedAt: now };
  });
  await updateChallenge(challengeId, (challenge) => {
    delete challenge.activeRunId;
    const at = new Date().toISOString();
    challenge.events.push({ name: "challenge_completed", at, runId }, { name: "challenge_insufficient_evidence", at, runId });
    challenge.events = challenge.events.slice(-200);
  });
}

async function runPrimaryRoles(
  challengeId: string,
  runId: string,
  production: ScanRecord,
  candidate: ScanRecord,
) {
  await updateProgress(challengeId, runId, "COMPARING", "Running six isolated evidence roles against the completed candidate scan");
  await mutateSwarm(challengeId, runId, (swarm) => {
    const now = new Date().toISOString();
    swarm.startedAt ??= now;
    swarm.stage = "RUNNING_ROLES";
    swarm.events.push(event("swarm_started", "Independent primary verification started."));
    swarm.roleRuns = swarm.roleRuns.map((role) => ({ ...role, status: "RUNNING", startedAt: now }));
    for (const role of swarm.roleRuns) swarm.events.push({ name: "role_started", at: now, role: role.role, detail: role.mission });
  });
  const roleRuns = await runIndependentRoles({ runId, production, candidate }, { timeoutMs: scannerConfig.swarmRoleTimeoutMs });
  const rawFindings = roleRuns.flatMap((role) => role.findings);
  const normalizedFindings = normalizeSwarmFindings(rawFindings);
  await mutateSwarm(challengeId, runId, (swarm) => {
    swarm.roleRuns = roleRuns;
    swarm.rawFindings = rawFindings;
    swarm.normalizedFindings = normalizedFindings;
    swarm.stage = "NORMALIZING";
    for (const role of roleRuns) {
      swarm.events.push(event(role.status === "COMPLETE" ? "role_completed" : "role_failed", role.failure?.message, role.role));
    }
    swarm.operations.roleDurationMs = roleRuns.reduce((total, role) => total + role.durationMs, 0);
    swarm.operations.actionCount = roleRuns.reduce((total, role) => total + role.actionCount, 0);
  });

  return { roleRuns, rawFindings, normalizedFindings };
}

async function judgePrimarySwarm(
  challengeId: string,
  runId: string,
  comparison: ChallengeComparison,
  primary: Awaited<ReturnType<typeof runPrimaryRoles>>,
) {
  const { roleRuns, rawFindings, normalizedFindings } = primary;
  await updateProgress(challengeId, runId, "BUILDING_EVIDENCE", "Evidence Judge is rejecting duplicates, baseline issues, environmental noise, and unsupported claims");
  await mutateSwarm(challengeId, runId, (swarm) => {
    swarm.stage = "JUDGING";
    swarm.events.push(event("judge_started", `${rawFindings.length} raw observations entered evidence review.`));
  });
  const decisions = judgeSwarmFindings(rawFindings, normalizedFindings, comparison);
  const rolesComplete = roleRuns.every((role) => role.status === "COMPLETE");
  const preliminaryVerdict = derivePreliminaryVerdict({ decisions, rolesComplete, evidenceComplete: comparison.evidenceComplete });
  await mutateSwarm(challengeId, runId, (swarm) => {
    swarm.stage = "PRELIMINARY_VERDICT";
    swarm.judgeDecisions = decisions;
    swarm.preliminaryVerdict = preliminaryVerdict;
    swarm.counts = swarmCounts(decisions, normalizedFindings.length, rawFindings.length);
    swarm.operations.verificationRetries = comparison.verificationRequired ? 1 : 0;
    swarm.events.push(event("judge_completed", `${swarm.counts.confirmed} confirmed; ${swarm.counts.rejected + swarm.counts.duplicates + swarm.counts.baselineIssues + swarm.counts.environmental} rejected, merged, or attributed to baseline/environment.`));
    swarm.events.push(event("preliminary_verdict", preliminaryVerdict.replaceAll("_", " ")));
  });
  return { roleRuns, rawFindings, normalizedFindings, decisions, preliminaryVerdict };
}

async function runRedTeam(
  challengeId: string,
  runId: string,
  production: ScanRecord,
  candidate: ScanRecord,
  primaryComparison: ChallengeComparison,
  preliminaryVerdict: NonNullable<SwarmRun["preliminaryVerdict"]>,
  signal: AbortSignal,
) {
  if (preliminaryVerdict !== "PRELIMINARY_READY") {
    const redTeamStatus = preliminaryVerdict === "PRELIMINARY_HOLD" ? "SKIPPED_HOLD" as const : "SKIPPED_INCOMPLETE" as const;
    const final = deriveFinalVerification({ preliminaryVerdict, redTeamStatus, redTeamDecisions: [] });
    await mutateSwarm(challengeId, runId, (swarm) => {
      swarm.redTeam.status = redTeamStatus;
      swarm.finalVerdict = final.finalVerdict;
      swarm.adversariallyVerified = final.adversariallyVerified;
      swarm.readyRevoked = final.readyRevoked;
      swarm.stage = "FINALIZING";
      swarm.events.push(event("final_verdict", final.finalVerdict));
    });
    return { comparison: primaryComparison, ...final };
  }

  const targets = selectRedTeamTargets(production, candidate, scannerConfig.redTeamMaxTargets);
  const target = targets[0] ?? {
    route: new URL(candidate.normalizedUrl).pathname || "/",
    productionUrl: production.normalizedUrl,
    candidateUrl: candidate.normalizedUrl,
  };
  await updateProgress(challengeId, runId, "VERIFYING", `Red Team is independently attacking ${target.route}`);
  await mutateSwarm(challengeId, runId, (swarm) => {
    swarm.stage = "RED_TEAM";
    swarm.redTeam.status = "RUNNING";
    swarm.redTeam.targetRoutes = [target.route];
    swarm.events.push(event("red_team_started", `Adversarial verification started on ${target.route}.`, "RED_TEAM"));
  });

  try {
    const redProduction = await executeScan(challengeId, runId, "RED_TEAM_PRODUCTION", target.productionUrl, "VERIFYING", `Red Team baseline check: ${target.route}`, signal);
    const redCandidate = await executeScan(challengeId, runId, "RED_TEAM_CANDIDATE", target.candidateUrl, "VERIFYING", `Red Team candidate check: ${target.route}`, signal);
    if (!completedScan(redProduction) || !completedScan(redCandidate)) throw new Error("Red Team route evidence is incomplete");
    const suspectedComparison = buildChallengeComparison(redProduction, redCandidate);
    const suspectedFindings = redTeamRawFindings(runId, suspectedComparison);
    if (suspectedFindings.length) {
      await mutateSwarm(challengeId, runId, (swarm) => {
        for (const finding of suspectedFindings) swarm.events.push({ ...event("red_team_finding", "Red Team recorded a candidate observation; independent reproduction is pending.", "RED_TEAM"), findingId: finding.id });
      });
    }
    const redVerification = await executeScan(challengeId, runId, "RED_TEAM_VERIFICATION", target.candidateUrl, "VERIFYING", `Red Team independent reproduction: ${target.route}`, signal);
    if (!completedScan(redVerification)) throw new Error("Red Team reproduction did not complete");

    const redComparison = buildChallengeComparison(redProduction, redCandidate, redVerification);
    const redRaw = redTeamRawFindings(runId, redComparison);
    const redNormalized = normalizeSwarmFindings(redRaw);
    const initialRedDecisions = judgeSwarmFindings(redRaw, redNormalized, redComparison);
    const mergedComparison = mergeChallengeComparisons(primaryComparison, redComparison);
    const redDecisions = mergedComparison.evidenceComplete ? initialRedDecisions : initialRedDecisions.map((decision) => decision.disposition === "CONFIRMED" ? {
      ...decision,
      disposition: "UNVERIFIED" as const,
      releaseBlocker: false,
      reason: "Primary and adversarial evidence disagreed, so the finding remains unverified.",
    } : decision);
    const blockerFound = redDecisions.some((decision) => decision.disposition === "CONFIRMED" && decision.releaseBlocker);
    const redTeamStatus = redComparison.evidenceComplete && mergedComparison.evidenceComplete ? (blockerFound ? "BLOCKER_FOUND" as const : "CLEAR" as const) : "FAILED" as const;
    const final = deriveFinalVerification({ preliminaryVerdict, redTeamStatus, redTeamDecisions: redDecisions });
    await mutateSwarm(challengeId, runId, (swarm) => {
      swarm.redTeam.status = redTeamStatus;
      swarm.redTeam.rawFindings = redRaw;
      swarm.redTeam.normalizedFindings = redNormalized;
      swarm.redTeam.decisions = redDecisions;
      swarm.finalVerdict = final.finalVerdict;
      swarm.adversariallyVerified = final.adversariallyVerified;
      swarm.readyRevoked = final.readyRevoked;
      swarm.stage = "FINALIZING";
      swarm.operations.verificationRetries += 1;
      const allDecisions = [...swarm.judgeDecisions, ...redDecisions];
      swarm.counts = swarmCounts(allDecisions, swarm.normalizedFindings.length + redNormalized.length, swarm.rawFindings.length + redRaw.length);
      for (const decision of redDecisions.filter((entry) => entry.disposition === "CONFIRMED")) {
        swarm.events.push({ ...event("red_team_finding", "Red Team independently confirmed a candidate-only finding.", "RED_TEAM"), findingId: decision.normalizedFindingId });
      }
      swarm.events.push(event("red_team_completed", redTeamStatus === "CLEAR" ? "No release blocker was confirmed during adversarial verification." : redTeamStatus === "BLOCKER_FOUND" ? "Red Team confirmed a release blocker." : "Adversarial evidence remained incomplete.", "RED_TEAM"));
      if (final.readyRevoked) swarm.events.push(event("verdict_revoked", "Preliminary READY revoked after independent Red Team reproduction."));
      swarm.events.push(event("final_verdict", final.finalVerdict));
    });
    return { comparison: mergedComparison, ...final };
  } catch (error) {
    const timedOut = signal.reason instanceof ChallengeTimeoutError;
    const cancelled = !timedOut && (signal.aborted || error instanceof ChallengeCancelledError);
    const redTeamStatus = cancelled ? "CANCELLED" as const : "FAILED" as const;
    const final = deriveFinalVerification({ preliminaryVerdict, redTeamStatus, redTeamDecisions: [] });
    await mutateSwarm(challengeId, runId, (swarm) => {
      swarm.redTeam.status = redTeamStatus;
      swarm.redTeam.failure = { code: cancelled ? "RED_TEAM_CANCELLED" : "RED_TEAM_FAILED", message: cancelled ? "Adversarial verification was cancelled." : "Adversarial verification could not produce complete evidence." };
      swarm.finalVerdict = final.finalVerdict;
      swarm.adversariallyVerified = false;
      swarm.readyRevoked = false;
      swarm.stage = cancelled ? "CANCELLED" : "FAILED";
      swarm.events.push(event("red_team_completed", swarm.redTeam.failure.message, "RED_TEAM"));
      swarm.events.push(event("final_verdict", "INCOMPLETE"));
    });
    if (cancelled) throw error;
    return { comparison: { ...primaryComparison, evidenceComplete: false }, ...final };
  }
}

async function executeChallenge(challengeId: string, runId: string, signal: AbortSignal) {
  try {
    const challenge = await getChallenge(challengeId);
    if (!challenge) throw new Error("Challenge not found");
    await updateProgress(challengeId, runId, "PREPARING_BASELINE", "Validating targets and preparing the production baseline");

    const production = await executeScan(
      challengeId,
      runId,
      "PRODUCTION",
      challenge.productionUrl,
      "SCANNING_PRODUCTION",
      "Scanning production to establish route coverage and existing findings",
      signal,
    );
    if (!completedScan(production)) {
      await finishInsufficient(challengeId, runId, "Production evidence is incomplete. No competitive claim was made.");
      return;
    }

    const candidate = await executeScan(
      challengeId,
      runId,
      "CANDIDATE",
      challenge.candidateUrl,
      "SCANNING_CANDIDATE",
      "Scanning the candidate against the same deterministic rules",
      signal,
    );
    if (!completedScan(candidate)) {
      await finishInsufficient(challengeId, runId, "Candidate evidence is incomplete. No competitive claim was made.");
      return;
    }

    await updateProgress(challengeId, runId, "COMPARING", "Separating existing issues, fixes, candidate-only changes, and verification candidates");
    let comparison = buildChallengeComparison(production, candidate);
    const primaryEvidence = await runPrimaryRoles(challengeId, runId, production, candidate);
    let verification: ScanRecord | undefined;
    if (comparison.verificationRequired) {
      await mutateSwarm(challengeId, runId, (swarm) => {
        swarm.stage = "REPRODUCING";
        swarm.events.push(event("reproduction_started", "A fresh candidate scan is attempting to reproduce primary role findings."));
      });
      verification = await executeScan(
        challengeId,
        runId,
        "VERIFICATION",
        challenge.candidateUrl,
        "VERIFYING",
        "Re-scanning the candidate to verify suspected qualifying regressions",
        signal,
      );
      comparison = buildChallengeComparison(production, candidate, verification);
      await mutateSwarm(challengeId, runId, (swarm) => {
        swarm.events.push(event("reproduction_completed", completedScan(verification!) ? "Independent candidate reproduction completed." : "Independent candidate reproduction was incomplete."));
      });
    }

    const primary = await judgePrimarySwarm(challengeId, runId, comparison, primaryEvidence);
    const adversarial = await runRedTeam(challengeId, runId, production, candidate, comparison, primary.preliminaryVerdict, signal);
    comparison = adversarial.comparison;
    await updateProgress(challengeId, runId, "FINALIZING", "Applying the adversarial and competitive verdict truth tables");
    const verdict = deriveChallengeVerdict({
      existingQaVerdict: challenge.existingQaVerdict,
      qualifyingRegressionCount: comparison.qualifyingRegressionCount,
      evidenceComplete: comparison.evidenceComplete && (!verification || completedScan(verification)) && adversarial.finalVerdict !== "INCOMPLETE",
    });
    await mutateRun(challengeId, runId, (run) => {
      const now = new Date().toISOString();
      if (run.swarm) {
        run.swarm.stage = "COMPLETE";
        run.swarm.completedAt = now;
        run.swarm.operations.durationMs = run.swarm.startedAt ? Date.now() - Date.parse(run.swarm.startedAt) : 0;
      }
      run.comparison = comparison;
      run.verdict = verdict;
      run.completedAt = now;
      run.progress = {
        ...run.progress,
        stage: "COMPLETE",
        detail: verdict === "INSUFFICIENT_EVIDENCE"
          ? "Evidence is incomplete. No competitive claim was made."
          : "Challenge evidence and verdict are ready",
        updatedAt: now,
      };
    });
    await updateChallenge(challengeId, (stored) => {
      delete stored.activeRunId;
      const at = new Date().toISOString();
      stored.events.push({ name: "challenge_completed", at, runId });
      if (verdict === "ALT_QR_WON") stored.events.push({ name: "challenge_altqr_won", at, runId });
      else if (verdict === "NO_QUALIFYING_MISS") stored.events.push({ name: "challenge_no_miss_found", at, runId });
      else if (verdict === "INSUFFICIENT_EVIDENCE") stored.events.push({ name: "challenge_insufficient_evidence", at, runId });
      stored.events = stored.events.slice(-200);
    });
  } catch (error) {
    const timedOut = signal.reason instanceof ChallengeTimeoutError;
    const cancelled = !timedOut && (signal.aborted || error instanceof ChallengeCancelledError);
    await mutateRun(challengeId, runId, (run) => {
      if (TERMINAL.has(run.progress.stage)) return;
      const now = new Date().toISOString();
      run.completedAt = now;
      run.verdict = "INSUFFICIENT_EVIDENCE";
      run.comparison ??= blankComparison(false);
      if (run.swarm) {
        run.swarm.stage = cancelled ? "CANCELLED" : "FAILED";
        run.swarm.finalVerdict = "INCOMPLETE";
        run.swarm.adversariallyVerified = false;
        run.swarm.completedAt = now;
        run.swarm.operations.durationMs = run.swarm.startedAt ? Date.now() - Date.parse(run.swarm.startedAt) : 0;
      }
      run.failure = cancelled
        ? { code: "CHALLENGE_CANCELLED", message: "Challenge cancelled. No competitive claim was made." }
        : timedOut
          ? { code: "CHALLENGE_TIMEOUT", message: "The adversarial evidence run reached its total deadline. No release claim was made." }
          : { code: "CHALLENGE_FAILED", message: "ALT QR could not complete the evidence run. No competitive claim was made." };
      run.progress = {
        ...run.progress,
        stage: cancelled ? "CANCELLED" : "FAILED",
        detail: run.failure.message,
        updatedAt: now,
      };
    }).catch(() => undefined);
    await updateChallenge(challengeId, (challenge) => {
      delete challenge.activeRunId;
      const at = new Date().toISOString();
      challenge.events.push({ name: "challenge_insufficient_evidence", at, runId });
      challenge.events = challenge.events.slice(-200);
    }).catch(() => undefined);
  }
}

export function isChallengeActive(challengeId: string) {
  return activeChallengeJobs.has(challengeId);
}

export function reserveChallengeSlot() {
  if (activeChallengeJobs.size + challengeReservations.size >= scannerConfig.maxConcurrentScans) return null;
  const token = crypto.randomUUID();
  challengeReservations.add(token);
  return token;
}

export function releaseChallengeSlot(token: string | null | undefined) {
  if (token) challengeReservations.delete(token);
}

export function startChallenge(challengeId: string, runId: string, admitted = false) {
  const existing = activeChallengeJobs.get(challengeId);
  if (existing) return existing.promise;
  if (!admitted && activeChallengeJobs.size + challengeReservations.size >= scannerConfig.maxConcurrentScans) {
    throw new ChallengeCapacityError("ALT QR is already running the maximum number of challenges.");
  }
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(new ChallengeTimeoutError("Challenge deadline reached")), scannerConfig.challengeTimeoutMs);
  const promise = executeChallenge(challengeId, runId, controller.signal).finally(() => {
    clearTimeout(deadline);
    if (activeChallengeJobs.get(challengeId)?.promise === promise) activeChallengeJobs.delete(challengeId);
  });
  activeChallengeJobs.set(challengeId, { promise, controller, runId, deadline });
  return promise;
}

export async function enqueueChallengeRun(challengeId: string, reservation?: string) {
  if (activeChallengeJobs.has(challengeId)) throw new ChallengeCapacityError("This challenge already has an active run.");
  const admitted = Boolean(reservation && challengeReservations.delete(reservation));
  if (!admitted && activeChallengeJobs.size + challengeReservations.size >= scannerConfig.maxConcurrentScans) throw new ChallengeCapacityError("ALT QR is already running the maximum number of challenges.");
  const now = new Date().toISOString();
  const run: ChallengeRun = {
    id: crypto.randomUUID(),
    createdAt: now,
    progress: { stage: "QUEUED", detail: "Challenge accepted", updatedAt: now },
    scanIds: {},
  };
  run.swarm = createSwarmRun(challengeId, run.id);
  try {
    await appendChallengeRun(challengeId, run);
    void startChallenge(challengeId, run.id, admitted);
  } catch (error) {
    releaseChallengeSlot(reservation);
    throw error;
  }
  return run;
}

export async function cancelChallenge(challengeId: string) {
  const challenge = await getChallenge(challengeId);
  if (!challenge?.activeRunId) return challenge;
  const active = activeChallengeJobs.get(challengeId);
  const run = challenge.runs.find((entry) => entry.id === challenge.activeRunId);
  if (active) {
    active.controller.abort(new ChallengeCancelledError());
    if (run?.progress.currentScanId) await cancelScan(run.progress.currentScanId);
    await active.promise;
  } else if (run && !TERMINAL.has(run.progress.stage)) {
    await mutateRun(challengeId, run.id, (storedRun) => {
      const now = new Date().toISOString();
      storedRun.completedAt = now;
      storedRun.verdict = "INSUFFICIENT_EVIDENCE";
      storedRun.comparison ??= blankComparison(false);
      if (storedRun.swarm) {
        storedRun.swarm.stage = "CANCELLED";
        storedRun.swarm.finalVerdict = "INCOMPLETE";
        storedRun.swarm.adversariallyVerified = false;
        storedRun.swarm.completedAt = now;
      }
      storedRun.progress = { ...storedRun.progress, stage: "CANCELLED", detail: "Challenge cancelled. No competitive claim was made.", updatedAt: now };
    });
    await updateChallenge(challengeId, (stored) => { delete stored.activeRunId; });
  }
  return getChallenge(challengeId);
}

export async function recoverInterruptedChallenge(challengeId: string) {
  const challenge = await getChallenge(challengeId);
  if (!challenge?.activeRunId || activeChallengeJobs.has(challengeId)) return challenge;
  const run = challenge.runs.find((entry) => entry.id === challenge.activeRunId);
  if (!run || TERMINAL.has(run.progress.stage)) {
    await updateChallenge(challengeId, (stored) => { delete stored.activeRunId; });
    return getChallenge(challengeId);
  }
  await mutateRun(challengeId, run.id, (storedRun) => {
    const now = new Date().toISOString();
    storedRun.completedAt = now;
    storedRun.verdict = "INSUFFICIENT_EVIDENCE";
    storedRun.comparison ??= blankComparison(false);
    if (storedRun.swarm) {
      storedRun.swarm.stage = "FAILED";
      storedRun.swarm.finalVerdict = "INCOMPLETE";
      storedRun.swarm.adversariallyVerified = false;
      storedRun.swarm.completedAt = now;
      storedRun.swarm.failure = { code: "WORKER_RESTARTED", message: "The worker restarted before adversarial verification finished." };
    }
    storedRun.failure = { code: "WORKER_RESTARTED", message: "The challenge worker restarted before evidence collection finished. Run the challenge again." };
    storedRun.progress = { ...storedRun.progress, stage: "FAILED", detail: storedRun.failure.message, updatedAt: now };
  });
  await updateChallenge(challengeId, (stored) => { delete stored.activeRunId; });
  return getChallenge(challengeId);
}
