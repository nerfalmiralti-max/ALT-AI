import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildFixQueue, buildPageHealth, groupIssues } from "./analysis";
import { buildPerformanceReadings } from "./performance";
import { scannerConfig, RULES_VERSION, SCANNER_VERSION, scanConfigSnapshot } from "./config";
import { DEFAULT_RELEASE_GATE } from "./release";
import { sanitizeDiagnosticText } from "./sanitize";
import { storageCapacityReason } from "./storage-quota";
import type { ChallengeIndex, ChallengeIndexEntry, ChallengeRecord, ChallengeRun, ExistingQaVerdict, PageAudit, ProjectIndex, ProjectRecord, ReleaseGateConfig, ScanIssue, ScanProgress, ScanRecord } from "./types";

const root = path.resolve(process.cwd(), scannerConfig.dataDir);
const scansDir = path.join(root, "scans");
const assetsDir = path.join(root, "assets");
const challengesDir = path.join(root, "challenges");
const projectsFile = path.join(root, "projects.json");
const challengesFile = path.join(root, "challenges.json");
let projectMutation: Promise<unknown> = Promise.resolve();
let challengeMutation: Promise<unknown> = Promise.resolve();

export class StorageCapacityError extends Error {}

async function boundedDirectoryBytes(directory: string, stopAfter: number): Promise<number> {
  let total = 0;
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) total += await boundedDirectoryBytes(target, Math.max(0, stopAfter - total));
      else if (entry.isFile()) total += (await lstat(target)).size;
      if (total > stopAfter) return total;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return total;
}

async function ensureStore() {
  await Promise.all([mkdir(scansDir, { recursive: true }), mkdir(assetsDir, { recursive: true }), mkdir(challengesDir, { recursive: true })]);
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    try {
      return JSON.parse(await readFile(`${file}.bak`, "utf8")) as T;
    } catch {
      throw new Error("Stored scan data is unreadable. Restore the last known-good local backup or start a new scan.");
    }
  }
}

async function atomicJson(file: string, value: unknown) {
  await ensureStore();
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    try {
      JSON.parse(await readFile(file, "utf8"));
      await copyFile(file, `${file}.bak`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && code !== "ENOENT") throw error;
      // Keep the known-good backup when repairing an unreadable primary file.
    }
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temp, file);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!code || !["EACCES", "EBUSY", "EPERM"].includes(code) || attempt >= 7) throw error;
        // Windows may briefly lock a JSON file while a polling reader closes it.
        // Retrying preserves atomic replacement without deleting the last good record.
        await new Promise((resolve) => setTimeout(resolve, 8 * (attempt + 1)));
      }
    }
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

function normalizeProject(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    scanIds: project.scanIds ?? [],
    gateConfig: { ...DEFAULT_RELEASE_GATE, ...project.gateConfig },
    ignoredFingerprints: project.ignoredFingerprints ?? [],
  };
}

function normalizeChallenge(challenge: ChallengeRecord): ChallengeRecord {
  return {
    ...challenge,
    existingQaVerdict: challenge.existingQaVerdict ?? "UNKNOWN",
    status: challenge.status ?? challenge.runs?.at(-1)?.progress.stage ?? "QUEUED",
    runs: challenge.runs ?? [],
    events: challenge.events ?? [],
  };
}

function challengeIndexEntry(challenge: ChallengeRecord): ChallengeIndexEntry {
  const latest = challenge.runs.at(-1);
  return {
    id: challenge.id,
    projectId: challenge.projectId,
    productionUrl: challenge.productionUrl,
    candidateUrl: challenge.candidateUrl,
    existingQaVerdict: challenge.existingQaVerdict,
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt,
    latestRun: latest ? {
      id: latest.id,
      createdAt: latest.createdAt,
      completedAt: latest.completedAt,
      progress: latest.progress,
      verdict: latest.verdict,
    } : undefined,
  };
}

function safeStoredText(value: string) {
  return sanitizeDiagnosticText(value).replace(/\s+/g, " ").trim().slice(0, scannerConfig.maxEventTextChars);
}

function normalizePage(page: PageAudit): PageAudit {
  return {
    ...page,
    redirects: page.redirects ?? 0,
    consoleErrors: (page.consoleErrors ?? []).map(safeStoredText),
    consoleWarnings: (page.consoleWarnings ?? []).map(safeStoredText),
    consoleEvents: (page.consoleEvents ?? page.consoleErrors?.map((message) => ({ level: "error", message, count: 1 })) ?? []).map((event) => ({ ...event, message: safeStoredText(event.message) })),
    pageErrors: (page.pageErrors ?? []).map(safeStoredText),
    requestFailures: (page.requestFailures ?? []).map(safeStoredText),
    networkFailures: (page.networkFailures ?? page.requestFailures?.map((reason) => ({ method: "GET", url: page.url, resourceType: "other", reason, count: 1 })) ?? []).map((failure) => ({ ...failure, reason: safeStoredText(failure.reason) })),
    auditFailures: (page.auditFailures ?? []).map((failure) => ({ ...failure, message: safeStoredText(failure.message) })),
    failure: page.failure ? { ...page.failure, message: safeStoredText(page.failure.message) } : undefined,
    eventLimits: page.eventLimits ?? { consoleDropped: 0, networkDropped: 0, dialogsDismissed: 0, popupsBlocked: 0, downloadsBlocked: 0 },
    facts: {
      ...page.facts,
      headingSkips: page.facts.headingSkips ?? [],
      duplicateIds: page.facts.duplicateIds ?? [],
    },
  };
}

function normalizeIssue(issue: ScanIssue, pages: PageAudit[]): ScanIssue {
  const pageId = pages.find((page) => page.url === issue.evidence.url)?.id;
  return {
    ...issue,
    scope: issue.scope ?? "PAGE",
    lifecycle: issue.lifecycle ?? "ACTIVE",
    occurrences: issue.occurrences ?? 1,
    affectedPageIds: issue.affectedPageIds ?? (pageId ? [pageId] : []),
  };
}

function normalizeScan(scan: ScanRecord): ScanRecord {
  const pages = (scan.pages ?? []).map(normalizePage);
  const issues = (scan.issues ?? []).map((issue) => normalizeIssue(issue, pages));
  const visualComparisons = (scan.visualComparisons ?? []).map((comparison) => ({
    ...comparison,
    viewport: comparison.viewport ?? "desktop" as const,
    comparisonTarget: comparison.comparisonTarget ?? "previous" as const,
    rating: comparison.rating ?? (comparison.diffPercentage <= 0.1 ? "NO MEANINGFUL CHANGE" as const : comparison.diffPercentage <= 1 ? "MINOR CHANGE" as const : comparison.diffPercentage <= 5 ? "VISIBLE CHANGE" as const : "MAJOR CHANGE" as const),
  }));
  const issueGroups = scan.issueGroups?.length ? scan.issueGroups : groupIssues(issues);
  const primary = pages[0];
  const legacyPrimaryFailure = scan.progress.stage === "COMPLETE" && Boolean(primary) && (
    primary.status === 0 || primary.failure?.code === "NAVIGATION_FAILED" || primary.failure?.code === "PRIMARY_INSPECTION_FAILED"
  );
  const failureMessage = "ALT QR could not inspect the target's primary document. Confirm that the public URL is reachable and try again.";
  return {
    ...scan,
    progress: legacyPrimaryFailure ? { ...scan.progress, stage: "FAILED", detail: failureMessage } : scan.progress,
    failure: legacyPrimaryFailure ? { code: "PRIMARY_NAVIGATION_FAILED", message: failureMessage } : scan.failure,
    score: legacyPrimaryFailure ? undefined : scan.score,
    releaseGate: legacyPrimaryFailure ? undefined : scan.releaseGate,
    verdict: legacyPrimaryFailure ? undefined : scan.verdict,
    pages,
    issues,
    stageHistory: scan.stageHistory ?? [{ stage: scan.progress.stage, detail: scan.progress.detail, at: scan.progress.updatedAt }],
    screenshots: scan.screenshots ?? [],
    visualComparisons,
    lighthouse: legacyPrimaryFailure ? { available: false, error: "Primary document navigation failed." } : scan.lighthouse,
    performance: legacyPrimaryFailure ? [] : scan.performance ?? buildPerformanceReadings(scan.lighthouse ?? { available: false }),
    comparisons: scan.comparisons ?? {},
    pageHealth: scan.pageHealth?.length ? scan.pageHealth : buildPageHealth(pages, issues, visualComparisons),
    issueGroups,
    fixQueue: scan.fixQueue?.length ? scan.fixQueue : buildFixQueue(issueGroups, issues, scan.releaseGate),
    coverage: scan.coverage ?? { discoveredPages: pages.length, selectedPages: pages.length, inspectedPages: pages.length, failedPages: pages.filter((page) => page.status === 0 || page.status >= 400).length, skippedByLimit: 0, robotsExcluded: 0, unverifiedUrls: [] },
    timings: scan.timings ?? { totalMs: 0, browserAuditMs: 0, lighthouseMs: scan.lighthouse?.durationMs ?? 0, rulesMs: 0, screenshotMs: 0 },
    scannerVersion: scan.scannerVersion ?? "1.0.0",
    rulesVersion: scan.rulesVersion ?? "1.0.0",
    configSnapshot: scan.configSnapshot ?? scanConfigSnapshot(),
  };
}

async function mutateProjects<T>(mutation: (index: ProjectIndex) => Promise<T> | T): Promise<T> {
  const task = projectMutation.then(async () => {
    const raw = await readJson<ProjectIndex>(projectsFile, { projects: [] });
    const index = { projects: raw.projects.map(normalizeProject) };
    const result = await mutation(index);
    await atomicJson(projectsFile, index);
    return result;
  });
  projectMutation = task.then(() => undefined, () => undefined);
  return task;
}

async function mutateChallengeStore<T>(mutation: (index: ChallengeIndex) => Promise<T>): Promise<T> {
  const task = challengeMutation.then(async () => {
    const index = await readJson<ChallengeIndex>(challengesFile, { challenges: [] });
    const result = await mutation(index);
    await atomicJson(challengesFile, index);
    return result;
  });
  challengeMutation = task.then(() => undefined, () => undefined);
  return task;
}

export async function listProjects() {
  await ensureStore();
  const index = await readJson<ProjectIndex>(projectsFile, { projects: [] });
  return index.projects.map(normalizeProject).filter((project) => !project.hidden).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string) {
  await ensureStore();
  const index = await readJson<ProjectIndex>(projectsFile, { projects: [] });
  const project = index.projects.find((entry) => entry.id === id);
  return project ? normalizeProject(project) : null;
}

export async function createScan(targetUrl: string, normalizedUrl: string, challengeContext?: ScanRecord["challengeContext"]) {
  const now = new Date().toISOString();
  const origin = new URL(normalizedUrl).origin;
  const scanId = randomUUID();
  const project = await mutateProjects(async (index) => {
    const scanCount = (await readdir(scansDir).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error)))
      .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name)).length;
    const reservationBytes = scannerConfig.maxScreenshotBytes * 6 + 5_000_000;
    const storedBytes = await boundedDirectoryBytes(root, scannerConfig.maxStoredBytes);
    const capacityReason = storageCapacityReason(
      { scanCount, storedBytes },
      { maxStoredScans: scannerConfig.maxStoredScans, maxStoredBytes: scannerConfig.maxStoredBytes, reservationBytes },
    );
    if (capacityReason) throw new StorageCapacityError(capacityReason);
    let current = index.projects.find((entry) => entry.origin === origin);
    if (!current) {
      current = {
        id: randomUUID(),
        name: new URL(origin).hostname,
        origin,
        createdAt: now,
        updatedAt: now,
        scanIds: [],
        gateConfig: { ...DEFAULT_RELEASE_GATE },
        ignoredFingerprints: [],
        hidden: Boolean(challengeContext),
      };
      index.projects.push(current);
    }
    if (!challengeContext) {
      current.hidden = false;
      current.scanIds.unshift(scanId);
      current.latestScanId = scanId;
      current.updatedAt = now;
    }
    return current;
  });
  const progress: ScanProgress = { stage: "QUEUED", detail: "Scan accepted", completedUnits: 0, totalUnits: null, updatedAt: now };
  const scan: ScanRecord = {
    id: scanId,
    projectId: project.id,
    targetUrl,
    normalizedUrl,
    createdAt: now,
    progress,
    stageHistory: [{ stage: "QUEUED", detail: progress.detail, at: now }],
    pages: [],
    issues: [],
    screenshots: [],
    visualComparisons: [],
    lighthouse: { available: false },
    performance: [],
    comparisons: {},
    pageHealth: [],
    issueGroups: [],
    fixQueue: [],
    coverage: { discoveredPages: 0, selectedPages: 0, inspectedPages: 0, failedPages: 0, skippedByLimit: 0, robotsExcluded: 0, unverifiedUrls: [] },
    timings: { totalMs: 0, browserAuditMs: 0, lighthouseMs: 0, rulesMs: 0, screenshotMs: 0 },
    scannerVersion: SCANNER_VERSION,
    rulesVersion: RULES_VERSION,
    configSnapshot: scanConfigSnapshot(),
    challengeContext,
  };
  await atomicJson(path.join(scansDir, `${scanId}.json`), scan);
  return scan;
}

export async function getScan(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const scan = await readJson<ScanRecord | null>(path.join(scansDir, `${id}.json`), null);
  return scan ? normalizeScan(scan) : null;
}

export async function saveScan(scan: ScanRecord) {
  await atomicJson(path.join(scansDir, `${scan.id}.json`), scan);
  return scan;
}

export function getAssetDirectory(scanId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(scanId)) throw new Error("Invalid scan asset directory");
  return path.join(assetsDir, scanId);
}

export function resolveAssetPath(relativePath: string) {
  const safeRelative = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const resolved = path.resolve(assetsDir, safeRelative);
  if (resolved !== assetsDir && !resolved.startsWith(`${assetsDir}${path.sep}`)) throw new Error("Invalid asset path");
  return resolved;
}

export async function getPreviousCompletedScan(projectId: string, currentScanId: string) {
  const project = await getProject(projectId);
  if (!project) return null;
  const currentIndex = project.scanIds.indexOf(currentScanId);
  const olderScanIds = currentIndex >= 0 ? project.scanIds.slice(currentIndex + 1) : project.scanIds;
  for (const scanId of olderScanIds) {
    const scan = await getScan(scanId);
    if (scan?.progress.stage === "COMPLETE") return scan;
  }
  return null;
}

export async function getBaselineCompletedScan(projectId: string) {
  const project = await getProject(projectId);
  if (!project?.baselineScanId) return null;
  const scan = await getScan(project.baselineScanId);
  return scan?.progress.stage === "COMPLETE" && scan.projectId === projectId ? scan : null;
}

export async function setProjectBaseline(projectId: string, scanId: string | null) {
  return mutateProjects(async (index) => {
    const project = index.projects.find((entry) => entry.id === projectId);
    if (!project) throw new Error("Project not found");
    if (scanId) {
      const scan = await getScan(scanId);
      if (!scan || scan.projectId !== projectId || scan.progress.stage !== "COMPLETE") throw new Error("Only a completed scan from this project can be the baseline");
      project.baselineScanId = scanId;
    } else {
      delete project.baselineScanId;
    }
    project.updatedAt = new Date().toISOString();
    return project;
  });
}

export async function updateProjectGate(projectId: string, patch: Partial<ReleaseGateConfig>) {
  return mutateProjects((index) => {
    const project = index.projects.find((entry) => entry.id === projectId);
    if (!project) throw new Error("Project not found");
    project.gateConfig = { ...project.gateConfig, ...patch };
    project.updatedAt = new Date().toISOString();
    return project;
  });
}

export async function setIgnoredFingerprint(projectId: string, fingerprint: string, ignored: boolean) {
  if (!/^[0-9a-f]{24}$/i.test(fingerprint)) throw new Error("Invalid issue fingerprint");
  return mutateProjects((index) => {
    const project = index.projects.find((entry) => entry.id === projectId);
    if (!project) throw new Error("Project not found");
    const values = new Set(project.ignoredFingerprints);
    if (ignored) values.add(fingerprint); else values.delete(fingerprint);
    project.ignoredFingerprints = [...values].sort();
    project.updatedAt = new Date().toISOString();
    return project;
  });
}

export async function recentScans(limit = 12) {
  const projects = await listProjects();
  const requested = Math.max(0, Math.min(limit, 100));
  if (!requested) return [];
  const heads = (await Promise.all(projects.map(async (project) => ({ project, index: 0, scan: project.scanIds[0] ? await getScan(project.scanIds[0]) : null }))))
    .filter((entry): entry is { project: ProjectRecord; index: number; scan: ScanRecord } => Boolean(entry.scan));
  const result: ScanRecord[] = [];
  while (heads.length && result.length < requested) {
    heads.sort((a, b) => b.scan.createdAt.localeCompare(a.scan.createdAt));
    const newest = heads.shift()!;
    result.push(newest.scan);
    const nextIndex = newest.index + 1;
    const nextId = newest.project.scanIds[nextIndex];
    if (nextId) {
      const next = await getScan(nextId);
      if (next) heads.push({ project: newest.project, index: nextIndex, scan: next });
    }
  }
  return result;
}

export async function createChallenge(input: {
  productionUrl: string;
  candidateUrl: string;
  pullRequestUrl?: string;
  qaStack?: string;
  existingQaVerdict?: ExistingQaVerdict;
  projectId?: string;
}) {
  const now = new Date().toISOString();
  const challenge: ChallengeRecord = {
    id: randomUUID(),
    projectId: input.projectId,
    productionUrl: input.productionUrl,
    candidateUrl: input.candidateUrl,
    pullRequestUrl: input.pullRequestUrl,
    qaStack: input.qaStack,
    existingQaVerdict: input.existingQaVerdict ?? "UNKNOWN",
    status: "QUEUED",
    createdAt: now,
    updatedAt: now,
    runs: [],
    events: [],
  };
  return mutateChallengeStore(async (index) => {
    await atomicJson(path.join(challengesDir, `${challenge.id}.json`), challenge);
    index.challenges = [challengeIndexEntry(challenge), ...index.challenges.filter((entry) => entry.id !== challenge.id)];
    return challenge;
  });
}

export async function getChallenge(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const challenge = await readJson<ChallengeRecord | null>(path.join(challengesDir, `${id}.json`), null);
  return challenge ? normalizeChallenge(challenge) : null;
}

export async function updateChallenge<T>(id: string, mutation: (challenge: ChallengeRecord) => T | Promise<T>) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid challenge ID");
  return mutateChallengeStore(async (index) => {
    const stored = await readJson<ChallengeRecord | null>(path.join(challengesDir, `${id}.json`), null);
    if (!stored) throw new Error("Challenge not found");
    const challenge = normalizeChallenge(stored);
    const result = await mutation(challenge);
    challenge.updatedAt = new Date().toISOString();
    await atomicJson(path.join(challengesDir, `${id}.json`), challenge);
    index.challenges = [challengeIndexEntry(challenge), ...index.challenges.filter((entry) => entry.id !== id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return result;
  });
}

export async function saveChallenge(challenge: ChallengeRecord) {
  await updateChallenge(challenge.id, (stored) => {
    Object.assign(stored, challenge);
    stored.runs = challenge.runs;
  });
  return challenge;
}

export async function appendChallengeRun(challengeId: string, run: ChallengeRun) {
  return updateChallenge(challengeId, (challenge) => {
    if (challenge.runs.some((entry) => entry.id === run.id)) throw new Error("Challenge run already exists");
    challenge.runs.push(run);
    challenge.activeRunId = run.id;
    challenge.status = run.progress.stage;
    challenge.events.push({ name: challenge.runs.length === 1 ? "challenge_started" : "challenge_rerun", at: run.createdAt, runId: run.id });
    challenge.events = challenge.events.slice(-200);
    return challenge;
  });
}

export async function listChallenges(limit = 20) {
  await ensureStore();
  const requested = Math.max(0, Math.min(limit, 100));
  if (!requested) return [];
  const index = await readJson<ChallengeIndex>(challengesFile, { challenges: [] });
  const entries = [...index.challenges].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, requested);
  const challenges = await Promise.all(entries.map((entry) => getChallenge(entry.id)));
  return challenges.filter((entry): entry is ChallengeRecord => Boolean(entry));
}
