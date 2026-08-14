import { getSupabaseAdmin } from "../supabase-server";
import { getProject } from "./store";
import type { ScanRecord } from "./types";

function assertResult(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}

export async function mirrorCompletedScan(scan: ScanRecord, options: { updateLatest?: boolean; updateBaseline?: boolean } = {}) {
  const db = getSupabaseAdmin();
  if (!db) {
    if (process.env.ALT_QR_STORAGE === "supabase") throw new Error("Supabase storage mode is enabled but its server configuration is incomplete.");
    return { backend: "local" as const, synchronized: true };
  }
  const ownerId = process.env.ALT_QR_OWNER_ID?.trim() || "local";
  const localProject = await getProject(scan.projectId);
  const project = {
    id: scan.projectId, owner_id: ownerId, name: new URL(scan.normalizedUrl).hostname,
    origin: new URL(scan.normalizedUrl).origin,
    gate_config: localProject?.gateConfig ?? {}, ignored_fingerprints: localProject?.ignoredFingerprints ?? [],
    created_at: localProject?.createdAt ?? scan.createdAt, updated_at: localProject?.updatedAt ?? scan.completedAt ?? scan.createdAt,
  };
  assertResult(await db.from("alt_qr_projects").upsert(project, { onConflict: "id" }));
  assertResult(await db.from("alt_qr_scans").upsert({
    id: scan.id, project_id: scan.projectId, target_url: scan.targetUrl, normalized_url: scan.normalizedUrl,
    stage: scan.progress.stage, score: scan.score?.overall, score_status: scan.score?.status,
    scanner_version: scan.scannerVersion, rules_version: scan.rulesVersion, config_snapshot: scan.configSnapshot,
    progress: scan.progress, stage_history: scan.stageHistory, lighthouse: scan.lighthouse, performance: scan.performance,
    release_gate: scan.releaseGate ?? {}, verdict: scan.verdict ?? null, comparisons: scan.comparisons,
    page_health: scan.pageHealth, issue_groups: scan.issueGroups, fix_queue: scan.fixQueue,
    coverage: scan.coverage, timings: scan.timings,
    failure: scan.failure ?? null, started_at: scan.startedAt, completed_at: scan.completedAt, created_at: scan.createdAt,
  }, { onConflict: "id" }));
  if (scan.pages.length) assertResult(await db.from("alt_qr_pages").upsert(scan.pages.map((page) => ({
    id: page.id, scan_id: scan.id, url: page.url, http_status: page.status, content_type: page.contentType,
    duration_ms: page.durationMs, redirects: page.redirects, headers: page.headers, facts: page.facts,
    console_errors: page.consoleErrors, console_warnings: page.consoleWarnings, console_events: page.consoleEvents,
    page_errors: page.pageErrors, request_failures: page.requestFailures, network_failures: page.networkFailures,
    axe_violations: page.axeViolations, audit_failures: page.auditFailures, event_limits: page.eventLimits, failure: page.failure ?? null,
  })), { onConflict: "id" }));
  const pageIdByUrl = new Map(scan.pages.map((page) => [page.url, page.id]));
  if (scan.issues.length) assertResult(await db.from("alt_qr_issues").upsert(scan.issues.map((issue) => ({
    id: issue.id, scan_id: scan.id, page_id: pageIdByUrl.get(issue.evidence.url) ?? null,
    rule_id: issue.ruleId, category: issue.category, severity: issue.severity, title: issue.title,
    description: issue.description, recommendation: issue.recommendation, score_impact: issue.scoreImpact,
    evidence: issue.evidence, fingerprint: issue.fingerprint, scope: issue.scope, lifecycle: issue.lifecycle,
    occurrences: issue.occurrences, affected_page_ids: issue.affectedPageIds,
  })), { onConflict: "scan_id,fingerprint" }));
  if (scan.screenshots.length) assertResult(await db.from("alt_qr_screenshots").upsert(scan.screenshots.map((asset) => ({
    id: asset.id, scan_id: scan.id, page_id: asset.pageId, viewport: asset.viewport,
    storage_path: asset.relativePath, width: asset.width, height: asset.height,
    source_viewport: asset.sourceViewport ?? null, comparison_target: asset.comparisonTarget ?? null,
  })), { onConflict: "id" }));
  const metrics = [
    ...(scan.score?.categories.map((category) => ({ metric_key: `score.${category.category}`, numeric_value: category.score, unit: "score" })) ?? []),
    ...Object.entries(scan.lighthouse.metrics ?? {}).map(([key, value]) => ({ metric_key: `lighthouse.${key}`, numeric_value: value, unit: key === "cls" ? "ratio" : "ms" })),
  ].map((metric) => ({ scan_id: scan.id, ...metric }));
  if (metrics.length) assertResult(await db.from("alt_qr_scan_metrics").upsert(metrics, { onConflict: "scan_id,metric_key" }));
  if (scan.visualComparisons.length) assertResult(await db.from("alt_qr_visual_comparisons").upsert(scan.visualComparisons.map((comparison) => ({
    id: comparison.id, baseline_scan_id: comparison.baselineScanId, current_scan_id: comparison.currentScanId,
    baseline_screenshot_id: comparison.baselineScreenshotId, current_screenshot_id: comparison.currentScreenshotId,
    diff_screenshot_id: comparison.diffScreenshotId, changed_pixels: comparison.changedPixels,
    total_pixels: comparison.totalPixels, diff_percentage: comparison.diffPercentage,
    viewport: comparison.viewport, comparison_target: comparison.comparisonTarget, rating: comparison.rating,
  })), { onConflict: "id" }));
  const projectReferences: { latest_scan_id?: string; baseline_scan_id?: string | null; updated_at: string } = { updated_at: localProject?.updatedAt ?? scan.completedAt ?? scan.createdAt };
  if (options.updateLatest !== false) projectReferences.latest_scan_id = scan.id;
  if (options.updateBaseline) projectReferences.baseline_scan_id = localProject?.baselineScanId ?? null;
  if (Object.keys(projectReferences).length > 1) {
    assertResult(await db.from("alt_qr_projects").update(projectReferences).eq("id", scan.projectId));
  }
  return { backend: "supabase" as const, synchronized: true };
}
