import assert from "node:assert/strict";
import { test } from "node:test";

import { BENCHMARK_VERSION, PROFILES, SCENARIOS } from "../reliability/catalog";
import { evaluateBenchmarkProfile, semanticScanSignature } from "../reliability/evaluate";
import { startReliabilityFixture } from "../reliability/fixture-server";
import { aggregateEvaluations, evaluateDeterminism } from "../reliability/report";
import type { BenchmarkScenario } from "../reliability/types";
import type { BenchmarkEvaluation } from "../reliability/types";
import type { ScanIssue, ScanRecord } from "../../lib/qr/types";

function issue(overrides: Partial<ScanIssue> & Pick<ScanIssue, "ruleId" | "severity">): ScanIssue {
  return {
    ...overrides,
    id: overrides.id ?? crypto.randomUUID(),
    ruleId: overrides.ruleId,
    category: "seo",
    severity: overrides.severity,
    title: overrides.ruleId,
    description: "Controlled finding",
    recommendation: "Correct the fixture defect",
    scoreImpact: 5,
    evidence: { url: "http://127.0.0.1:4567/missing-title", ...overrides.evidence },
    fingerprint: overrides.fingerprint ?? crypto.randomUUID(),
    scope: overrides.scope ?? "PAGE",
    lifecycle: "ACTIVE",
    occurrences: overrides.occurrences ?? 1,
    affectedPageIds: overrides.affectedPageIds ?? ["page-1"],
  };
}

function scan(overrides: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: crypto.randomUUID(), projectId: crypto.randomUUID(), targetUrl: "http://127.0.0.1:4567/",
    normalizedUrl: "http://127.0.0.1:4567/", createdAt: new Date().toISOString(),
    progress: { stage: "COMPLETE", detail: "Ready", completedUnits: 1, totalUnits: 1, updatedAt: new Date().toISOString() },
    stageHistory: [], pages: [], issues: [], screenshots: [], visualComparisons: [], lighthouse: { available: false },
    performance: [], comparisons: {}, pageHealth: [], issueGroups: [], fixQueue: [],
    coverage: { discoveredPages: 1, selectedPages: 1, inspectedPages: 1, failedPages: 0, skippedByLimit: 0, robotsExcluded: 0, unverifiedUrls: [] },
    timings: { totalMs: 100, browserAuditMs: 80, lighthouseMs: 0, rulesMs: 1, screenshotMs: 5 },
    scannerVersion: "2.1.0", rulesVersion: "2.1.0",
    configSnapshot: {
      maxPages: 10, crawlConcurrency: 2, pageTimeoutMs: 15_000, scanTimeoutMs: 120_000,
      maxRedirects: 5, maxResponseBytes: 2_000_000, maxResourceBytes: 5_000_000,
      maxScanResponseBytes: 50_000_000, maxInflightRequests: 8, maxDomNodes: 5_000, maxRenderedDomChars: 500_000,
      maxScreenshotPixels: 10_000_000, maxScreenshotHeight: 6_000, maxScreenshotBytes: 8_000_000, maxLinksPerPage: 40,
      maxConsoleEvents: 200, maxNetworkFailures: 200, maxRequestsPerContext: 600,
      maxDialogs: 10, maxPopups: 5, maxStoredScans: 250, maxStoredBytes: 2_000_000_000,
      desktopViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
      mobileViewport: { width: 390, height: 844, deviceScaleFactor: 1 },
    },
    ...overrides,
  };
}

test("reliability evaluator separates detection, severity, evidence, and verdict accuracy", () => {
  const scenarios: BenchmarkScenario[] = [{
    id: "evaluation-contract", profileId: "document", category: "seo-document", description: "Evaluator contract",
    classification: "deterministic",
    expectedFindings: [
      { id: "title", ruleId: "missing-title", severity: "CRITICAL", pagePath: "/missing-title", evidence: { source: "dom", required: ["url"] } },
      { id: "alt", ruleId: "missing-alt", severity: "WARNING", pagePath: "/missing-alt", evidence: { source: "dom", required: ["url", "selector"] } },
    ],
    forbiddenFindings: [],
    expectedScan: { gate: "FAIL", verdict: "BLOCKED" },
  }];
  const result = evaluateBenchmarkProfile({
    profileId: "document", origin: "http://127.0.0.1:4567", scenarios,
    scan: scan({
      issues: [
        issue({ ruleId: "missing-title", severity: "WARNING" }),
        issue({ ruleId: "console-error", severity: "WARNING", evidence: { url: "http://127.0.0.1:4567/clean", consoleMessage: "Unexpected" } }),
      ],
      releaseGate: { status: "FAIL", checks: [] }, verdict: "BLOCKED",
    }),
  });

  assert.deepEqual({ tp: result.truePositives, fp: result.falsePositives, fn: result.falseNegatives }, { tp: 1, fp: 1, fn: 1 });
  assert.deepEqual(result.severity, { correct: 0, evaluated: 1 });
  assert.deepEqual(result.severityConfusion, { "CRITICALв†’WARNING": 1 });
  assert.deepEqual(result.evidence, { correct: 1, evaluated: 1 });
  assert.deepEqual(result.verdict, { correct: 1, evaluated: 1 });
  assert.equal(result.severityMismatches[0]?.expected, "CRITICAL");
  assert.equal(result.missingFindings[0]?.id, "alt");
  assert.equal(result.unexpectedFindings[0]?.ruleId, "console-error");
});

test("semantic scan signatures ignore volatile fields but preserve evidence and release meaning", () => {
  const first = scan({
    issues: [issue({ ruleId: "http-status", severity: "CRITICAL", evidence: { url: "http://127.0.0.1:4567/broken", httpStatus: 404 } })],
    releaseGate: { status: "FAIL", checks: [{ id: "broken-pages", label: "Broken pages", passed: false, actual: 1, expected: "0" }] },
    verdict: "BLOCKED",
  });
  const sameMeaning = scan({
    issues: first.issues.map((entry) => ({ ...entry, id: crypto.randomUUID() })),
    releaseGate: first.releaseGate, verdict: first.verdict,
    timings: { totalMs: 9_999, browserAuditMs: 8_888, lighthouseMs: 777, rulesMs: 2, screenshotMs: 50 },
  });
  assert.deepEqual(semanticScanSignature(first, "http://127.0.0.1:4567"), semanticScanSignature(sameMeaning, "http://127.0.0.1:4567"));

  const changedEvidence = scan({ ...first, issues: first.issues.map((entry) => ({ ...entry, evidence: { ...entry.evidence, httpStatus: 500 } })) });
  assert.notDeepEqual(semanticScanSignature(first, "http://127.0.0.1:4567"), semanticScanSignature(changedEvidence, "http://127.0.0.1:4567"));
  assert.notDeepEqual(semanticScanSignature(first, "http://127.0.0.1:4567"), semanticScanSignature({ ...first, verdict: "NEEDS ATTENTION" }, "http://127.0.0.1:4567"));
});

test("benchmark catalog is versioned, focused, unique, and explicit", () => {
  assert.match(BENCHMARK_VERSION, /^1\.\d+\.\d+$/);
  assert.ok(SCENARIOS.length >= 30 && SCENARIOS.length <= 50, `expected 30-50 scenarios, got ${SCENARIOS.length}`);
  assert.equal(new Set(SCENARIOS.map((scenario) => scenario.id)).size, SCENARIOS.length);
  assert.ok(SCENARIOS.every((scenario) => PROFILES.some((profile) => profile.id === scenario.profileId)));
  assert.ok(SCENARIOS.every((scenario) => Array.isArray(scenario.expectedFindings) && Array.isArray(scenario.forbiddenFindings)));
  assert.ok(SCENARIOS.some((scenario) => scenario.classification === "environmental"));
});

test("reliability fixture lab serves isolated controlled profile behavior", async () => {
  const clean = await startReliabilityFixture("clean");
  const document = await startReliabilityFixture("document");
  const runtime = await startReliabilityFixture("runtime");
  const navigation = await startReliabilityFixture("navigation");
  const security = await startReliabilityFixture("security");
  try {
    const cleanRoot = await fetch(`${clean.origin}/`);
    assert.equal(cleanRoot.status, 200);
    assert.match(cleanRoot.headers.get("content-security-policy") ?? "", /default-src/);
    assert.match(await cleanRoot.text(), /href="\/clean-static"/);
    const redirect = await fetch(`${clean.origin}/clean-redirect`, { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "/clean-static");

    const missingTitle = await fetch(`${document.origin}/missing-title`);
    assert.doesNotMatch(await missingTitle.text(), /<title>/);
    assert.ok(missingTitle.headers.has("content-security-policy"));

    const missingImage = await fetch(`${runtime.origin}/missing-image`);
    assert.equal(missingImage.status, 404);

    const redirectLoop = await fetch(`${navigation.origin}/redirect-loop-a`, { redirect: "manual" });
    assert.equal(redirectLoop.status, 302);
    assert.equal(redirectLoop.headers.get("location"), "/redirect-loop-b");

    const missingCsp = await fetch(`${security.origin}/missing-csp-a`);
    assert.equal(missingCsp.status, 200);
    assert.equal(missingCsp.headers.has("content-security-policy"), false);
    assert.equal((await fetch(`${security.origin}/shared-missing-script`)).status, 404);
  } finally {
    await Promise.all([clean.close(), document.close(), runtime.close(), navigation.close(), security.close()]);
  }
});

test("aggregate reliability metrics use exact TP/FP/FN and repeatability counts", () => {
  const evaluation: BenchmarkEvaluation = {
    profileId: "document", scenarioCount: 2, truePositives: 1, falsePositives: 1, falseNegatives: 1,
    severity: { correct: 0, evaluated: 1 }, severityConfusion: { "CRITICALв†’WARNING": 1 }, verdict: { correct: 1, evaluated: 1 }, gate: { correct: 1, evaluated: 1 }, evidence: { correct: 1, evaluated: 1 },
    missingFindings: [], unexpectedFindings: [], severityMismatches: [], evidenceFailures: [], forbiddenViolations: [], pageFailures: [], verdictFailures: [], gateFailures: [], environmentalFindings: [], passed: false,
  };
  const aggregate = aggregateEvaluations([evaluation]);
  assert.deepEqual({ tp: aggregate.truePositives, fp: aggregate.falsePositives, fn: aggregate.falseNegatives }, { tp: 1, fp: 1, fn: 1 });
  assert.equal(aggregate.precision, 0.5);
  assert.equal(aggregate.recall, 0.5);
  assert.equal(aggregate.severityAccuracy, 0);
  assert.deepEqual(aggregate.severityConfusion, { "CRITICALв†’WARNING": 1 });
  assert.equal(aggregate.evidenceAccuracy, 1);
  assert.equal(aggregate.verdictAccuracy, 1);

  const determinism = evaluateDeterminism("clean", [{ value: 1 }, { value: 1 }, { value: 2 }]);
  assert.deepEqual({ runs: determinism.runs, stable: determinism.stableRuns, rate: determinism.rate }, { runs: 3, stable: 2, rate: 2 / 3 });
});

test("empty-selector prohibitions match missing evidence, not valid selectors", () => {
  const scenario: BenchmarkScenario = {
    id: "selector-contract", profileId: "accessibility", category: "evidence", description: "Selector evidence contract", classification: "deterministic",
    expectedFindings: [], forbiddenFindings: [{ id: "missing-selector", reason: "Selector is required", ruleId: "axe-violation", selectorIncludes: "" }],
  };
  const withSelector = evaluateBenchmarkProfile({ profileId: "accessibility", origin: "http://127.0.0.1:4567", scenarios: [scenario], scan: scan({ issues: [issue({ ruleId: "axe-violation", severity: "WARNING", evidence: { url: "http://127.0.0.1:4567/contrast", selector: "#contrast" } })] }) });
  const withoutSelector = evaluateBenchmarkProfile({ profileId: "accessibility", origin: "http://127.0.0.1:4567", scenarios: [scenario], scan: scan({ issues: [issue({ ruleId: "axe-violation", severity: "WARNING", evidence: { url: "http://127.0.0.1:4567/contrast" } })] }) });
  assert.equal(withSelector.forbiddenViolations.length, 0);
  assert.equal(withoutSelector.forbiddenViolations.length, 1);
});
