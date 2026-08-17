import assert from "node:assert/strict";
import test from "node:test";

import { comparisonTargets, summarizeProjectRelease } from "../../lib/qr/presentation";
import type { ProjectRecord, ScanRecord } from "../../lib/qr/types";

const project: ProjectRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "example.com",
  origin: "https://example.com",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  scanIds: [],
  gateConfig: { minimumScore: 80, failOnCritical: true, maximumBrokenPages: 0, maximumBrokenLinks: 0 },
  ignoredFingerprints: [],
};

function scan(patch: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    projectId: project.id,
    targetUrl: project.origin,
    normalizedUrl: project.origin,
    createdAt: "2026-08-14T00:00:00.000Z",
    completedAt: "2026-08-14T00:01:00.000Z",
    progress: { stage: "COMPLETE", detail: "Complete", completedUnits: 1, totalUnits: 1, updatedAt: "2026-08-14T00:01:00.000Z" },
    stageHistory: [], pages: [], issues: [], screenshots: [], visualComparisons: [],
    lighthouse: { available: false }, performance: [], comparisons: {}, pageHealth: [], issueGroups: [], fixQueue: [],
    coverage: { discoveredPages: 1, selectedPages: 1, inspectedPages: 1, failedPages: 0, skippedByLimit: 0, robotsExcluded: 0, unverifiedUrls: [] },
    timings: { totalMs: 60_000, browserAuditMs: 0, lighthouseMs: 0, rulesMs: 0, screenshotMs: 0 },
    score: { overall: 92, status: "READY", categories: [] },
    releaseGate: { status: "PASS", checks: [] },
    verdict: "READY TO SHIP",
    scannerVersion: "test", rulesVersion: "test",
    configSnapshot: {} as ScanRecord["configSnapshot"],
    ...patch,
  };
}

test("project release summary reports a measured ready state", () => {
  const result = summarizeProjectRelease(project, scan());
  assert.equal(result.state, "ready");
  assert.equal(result.label, "Ready to ship");
  assert.match(result.reason, /passed/i);
  assert.equal(result.score, 92);
});

test("project release summary explains the first failed release check", () => {
  const result = summarizeProjectRelease(project, scan({
    verdict: "BLOCKED",
    releaseGate: { status: "FAIL", checks: [{ id: "broken-pages", label: "Broken pages", passed: false, actual: 2, expected: "0 or fewer" }] },
  }));
  assert.equal(result.state, "blocked");
  assert.equal(result.reason, "Broken pages: 2 (expected 0 or fewer).");
});

test("project release summary keeps active and failed scans distinct", () => {
  assert.equal(summarizeProjectRelease(project, scan({ progress: { stage: "INSPECTING", detail: "Inspecting", completedUnits: 2, totalUnits: 4, updatedAt: "2026-08-14T00:00:20.000Z" }, verdict: undefined })).state, "scanning");
  const failed = summarizeProjectRelease(project, scan({ progress: { stage: "FAILED", detail: "Stopped", completedUnits: 1, totalUnits: 4, updatedAt: "2026-08-14T00:00:20.000Z" }, verdict: undefined, failure: { code: "SCAN_FAILED", message: "The scan could not complete." } }));
  assert.equal(failed.state, "failed");
  assert.match(failed.reason, /could not complete/i);
});

test("project release summary never exposes raw browser call logs or local paths", () => {
  const result = summarizeProjectRelease(project, scan({
    progress: { stage: "FAILED", detail: "Stopped", completedUnits: 1, totalUnits: 4, updatedAt: "2026-08-14T00:00:20.000Z" },
    verdict: undefined,
    failure: { code: "SCAN_FAILED", message: "page.goto failed at C:\\Users\\user\\Documents\\ALT ai\\node_modules\\playwright\\index.js Call log: navigating to target" },
  }));
  assert.doesNotMatch(result.reason, /Users|node_modules|Call log|playwright/i);
  assert.match(result.reason, /local path/i);
});

test("project release summary never exposes Chromium navigation internals", () => {
  const result = summarizeProjectRelease(project, scan({
    progress: { stage: "FAILED", detail: "Stopped", completedUnits: 0, totalUnits: 4, updatedAt: "2026-08-14T00:00:20.000Z" },
    verdict: undefined,
    failure: { code: "NAVIGATION_FAILED", message: "page.goto: net::ERR_NETWORK_ACCESS_DENIED at https://example.com/ Call log: navigating" },
  }));
  assert.doesNotMatch(result.reason, /page\.goto|net::|Call log|playwright/i);
  assert.match(result.reason, /could not inspect.*public URL.*try again/i);
});

test("project release summary is honest when a project has no scan", () => {
  const result = summarizeProjectRelease(project, null);
  assert.equal(result.state, "unscanned");
  assert.equal(result.score, null);
  assert.match(result.reason, /first scan/i);
});

test("comparison targets expose only persisted comparisons", () => {
  assert.deepEqual(comparisonTargets(scan()), []);
  assert.deepEqual(comparisonTargets(scan({ comparisons: {
    previous: { baseScanId: "a", currentScanId: "b", scoreDelta: 2, categoryDeltas: {}, issues: { baseScanId: "a", currentScanId: "b", newCount: 1, fixedCount: 2, unchangedCount: 3, changedCount: 0, regressionCount: 0, items: [] }, performance: [] },
    baseline: { baseScanId: "c", currentScanId: "b", scoreDelta: -1, categoryDeltas: {}, issues: { baseScanId: "c", currentScanId: "b", newCount: 2, fixedCount: 1, unchangedCount: 2, changedCount: 1, regressionCount: 1, items: [] }, performance: [] },
  } })), ["previous", "baseline"]);
});
