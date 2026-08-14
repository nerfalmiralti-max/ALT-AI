import { buildFixQueue, buildPageHealth, groupIssues } from "./analysis";
import { runBrowserAudit, ScanCancelledError, type ComparisonReference } from "./browser-audit";
import { buildScanDelta } from "./comparison";
import { dedupeIssues } from "./dedupe";
import { buildPerformanceReadings } from "./performance";
import { mirrorCompletedScan } from "./persistence";
import { deriveShipVerdict, evaluateReleaseGate } from "./release";
import { evaluatePages } from "./rules/evaluate";
import { calculateScore } from "./scoring";
import { scannerConfig } from "./config";
import { assertSafeTarget, TargetUrlError } from "./security";
import { getBaselineCompletedScan, getPreviousCompletedScan, getProject, getScan, saveScan } from "./store";
import type { ProjectRecord, ScanRecord, ScanStage } from "./types";

type ActiveJob = { promise: Promise<void>; controller: AbortController };
declare global {
  var __altQrActiveJobs: Map<string, ActiveJob> | undefined;
  var __altQrReservedSlots: Set<string> | undefined;
}
const activeJobs = globalThis.__altQrActiveJobs ??= new Map<string, ActiveJob>();
const reservedSlots = globalThis.__altQrReservedSlots ??= new Set<string>();
const TERMINAL_STAGES = new Set<ScanStage>(["COMPLETE", "CANCELLED", "FAILED"]);

export class ScanCapacityError extends Error {
  readonly code = "SCAN_CAPACITY";
}

export function canStartScan() {
  return activeJobs.size + reservedSlots.size < scannerConfig.maxConcurrentScans;
}

export function reserveScanSlot() {
  if (!canStartScan()) return null;
  const token = crypto.randomUUID();
  reservedSlots.add(token);
  return token;
}

export function releaseScanSlot(token: string | null | undefined) {
  if (token) reservedSlots.delete(token);
}

export function isScanActive(scanId: string) {
  return activeJobs.has(scanId);
}

async function update(scanId: string, stage: ScanStage, detail: string, completedUnits: number, totalUnits: number | null, currentUrl?: string) {
  const scan = await getScan(scanId);
  if (!scan) throw new Error("Scan not found");
  if (TERMINAL_STAGES.has(scan.progress.stage) && scan.progress.stage !== stage) return;
  if (scan.stageHistory.at(-1)?.stage !== stage) scan.stageHistory.push({ stage, detail, at: new Date().toISOString() });
  scan.progress = { stage, detail, completedUnits, totalUnits, currentUrl, updatedAt: new Date().toISOString() };
  if (!scan.startedAt && stage !== "QUEUED") scan.startedAt = new Date().toISOString();
  await saveScan(scan);
}

function referenceFor(scan: ScanRecord | null, target: ComparisonReference["target"]): ComparisonReference | null {
  if (!scan) return null;
  return {
    target,
    scanId: scan.id,
    desktop: scan.screenshots.find((asset) => asset.viewport === "desktop"),
    mobile: scan.screenshots.find((asset) => asset.viewport === "mobile"),
  };
}

async function applyAnalysis(scan: ScanRecord, project: ProjectRecord, previous: ScanRecord | null, baseline: ScanRecord | null, rulesStarted = performance.now()) {
  scan.performance = buildPerformanceReadings(scan.lighthouse);
  scan.issues = dedupeIssues(evaluatePages(scan.pages, scan.lighthouse)).map((issue) => ({
    ...issue,
    lifecycle: project.ignoredFingerprints.includes(issue.fingerprint) ? "IGNORED" as const : "ACTIVE" as const,
  }));
  scan.score = calculateScore(scan.issues);
  scan.issueGroups = groupIssues(scan.issues);
  scan.pageHealth = buildPageHealth(scan.pages, scan.issues, scan.visualComparisons);
  scan.comparisons = {};
  if (previous) scan.comparisons.previous = buildScanDelta(previous, scan);
  if (baseline) scan.comparisons.baseline = buildScanDelta(baseline, scan);
  scan.releaseGate = evaluateReleaseGate(scan.score, scan.issues, scan.pages, project.gateConfig);
  scan.fixQueue = buildFixQueue(scan.issueGroups, scan.issues, scan.releaseGate);
  scan.verdict = deriveShipVerdict(scan.releaseGate, scan.issues, scan.comparisons.previous?.issues, !scan.lighthouse.available || scan.pages.some((page) => Boolean(page.auditFailures.length)));
  scan.analysisProjectUpdatedAt = project.updatedAt;
  scan.timings.rulesMs = Math.round(performance.now() - rulesStarted);
}

async function execute(scanId: string, signal: AbortSignal) {
  const totalStarted = performance.now();
  try {
    const scan = await getScan(scanId);
    if (!scan) throw new Error("Scan not found");
    await assertSafeTarget(scan.normalizedUrl);
    const [project, previous, baseline] = await Promise.all([
      getProject(scan.projectId),
      getPreviousCompletedScan(scan.projectId, scan.id),
      getBaselineCompletedScan(scan.projectId),
    ]);
    if (!project) throw new Error("Project not found");
    const references = [referenceFor(previous, "previous"), referenceFor(baseline, "baseline")].filter((reference): reference is ComparisonReference => Boolean(reference));
    const result = await runBrowserAudit({
      scanId: scan.id,
      url: scan.normalizedUrl,
      references,
      signal,
      onProgress: (stage, detail, completed, total, currentUrl) => update(scan.id, stage, detail, completed, total, currentUrl),
    });
    if (signal.aborted) throw new ScanCancelledError();
    await update(scan.id, "SCORING", "Normalizing evidence, deltas, release gate, and deterministic scores", 0, 1);
    const current = await getScan(scan.id);
    const currentProject = await getProject(scan.projectId);
    if (!current || !currentProject) throw new Error("Scan disappeared during execution");
    current.pages = result.pages;
    current.screenshots = result.screenshots;
    current.visualComparisons = result.visualComparisons;
    current.lighthouse = result.lighthouse;
    current.coverage = result.coverage;
    current.timings = { ...current.timings, ...result.timings, totalMs: 0 };
    await applyAnalysis(current, currentProject, previous, baseline);
    if (signal.aborted) throw new ScanCancelledError();
    current.completedAt = new Date().toISOString();
    current.timings.totalMs = Math.round(performance.now() - totalStarted);
    current.stageHistory.push({ stage: "COMPLETE", detail: "Scan report and release gate are ready", at: current.completedAt });
    current.progress = { stage: "COMPLETE", detail: "Scan report and release gate are ready", completedUnits: 1, totalUnits: 1, updatedAt: current.completedAt };
    await saveScan(current);
    try {
      current.persistence = await mirrorCompletedScan(current);
    } catch (persistenceError) {
      current.persistence = { backend: "supabase", synchronized: false, warning: "Supabase synchronization failed; the complete local report remains available." };
    }
    await saveScan(current);
  } catch (error) {
    const scan = await getScan(scanId);
    if (!scan || TERMINAL_STAGES.has(scan.progress.stage)) return;
    scan.completedAt = new Date().toISOString();
    scan.timings.totalMs = Math.round(performance.now() - totalStarted);
    if (signal.aborted || error instanceof ScanCancelledError) {
      scan.progress = { ...scan.progress, stage: "CANCELLED", detail: "Scan cancelled; browser resources released", updatedAt: scan.completedAt };
      scan.stageHistory.push({ stage: "CANCELLED", detail: scan.progress.detail, at: scan.completedAt });
      await saveScan(scan);
      return;
    }
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "SCAN_FAILED";
    scan.failure = {
      code,
      message: error instanceof TargetUrlError
        ? error.message
        : `The scanner could not complete during ${scan.progress.stage.toLowerCase()}. Reference code: ${code}.`,
    };
    scan.progress = { ...scan.progress, stage: "FAILED", detail: scan.failure.message, updatedAt: scan.completedAt };
    scan.stageHistory.push({ stage: "FAILED", detail: scan.failure.message, at: scan.completedAt });
    await saveScan(scan);
  }
}

export function startScan(scanId: string, reservation?: string) {
  const existing = activeJobs.get(scanId);
  if (existing) { releaseScanSlot(reservation); return existing.promise; }
  const reserved = Boolean(reservation && reservedSlots.delete(reservation));
  if (!reserved && !canStartScan()) throw new ScanCapacityError("The scanner is already processing its maximum number of jobs.");
  const controller = new AbortController();
  const promise = execute(scanId, controller.signal).finally(() => {
    if (activeJobs.get(scanId)?.promise === promise) activeJobs.delete(scanId);
  });
  activeJobs.set(scanId, { promise, controller });
  return promise;
}

export async function recoverInterruptedScan(scanId: string) {
  const scan = await getScan(scanId);
  if (!scan || TERMINAL_STAGES.has(scan.progress.stage) || isScanActive(scanId)) return scan;
  const now = new Date().toISOString();
  scan.completedAt = now;
  scan.failure = { code: "WORKER_RESTARTED", message: "The scanner process restarted before this scan finished. Start a rescan to continue." };
  scan.progress = { ...scan.progress, stage: "FAILED", detail: scan.failure.message, updatedAt: now };
  scan.stageHistory.push({ stage: "FAILED", detail: scan.failure.message, at: now });
  await saveScan(scan);
  return scan;
}

export async function cancelScan(scanId: string) {
  const scan = await getScan(scanId);
  if (!scan) return null;
  if (TERMINAL_STAGES.has(scan.progress.stage)) return scan;
  const active = activeJobs.get(scanId);
  if (active) {
    active.controller.abort();
    await active.promise;
  } else {
    const now = new Date().toISOString();
    scan.completedAt = now;
    scan.progress = {
      stage: "CANCELLED",
      detail: scan.startedAt ? "Cancellation recorded; active work will stop at the next safe boundary" : "Scan cancelled before worker execution",
      completedUnits: scan.progress.completedUnits,
      totalUnits: scan.progress.totalUnits,
      currentUrl: scan.progress.currentUrl,
      updatedAt: now,
    };
    scan.stageHistory.push({ stage: "CANCELLED", detail: scan.progress.detail, at: now });
    await saveScan(scan);
  }
  return getScan(scanId);
}

export async function reanalyzeCompletedScan(scanId: string) {
  const scan = await getScan(scanId);
  if (!scan || scan.progress.stage !== "COMPLETE") throw new Error("Only completed scans can be reanalyzed");
  const [project, previous, baseline] = await Promise.all([
    getProject(scan.projectId),
    getPreviousCompletedScan(scan.projectId, scan.id),
    getBaselineCompletedScan(scan.projectId),
  ]);
  if (!project) throw new Error("Project not found");
  await applyAnalysis(scan, project, previous, baseline?.id === scan.id ? null : baseline);
  await saveScan(scan);
  return scan;
}

export async function runScanAndWait(scanId: string) {
  await startScan(scanId);
  const scan = await getScan(scanId);
  if (!scan) throw new Error("Scan not found after execution");
  return scan;
}
