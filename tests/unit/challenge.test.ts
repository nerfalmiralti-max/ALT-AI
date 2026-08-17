import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildChallengeComparison,
  challengeIssueIdentity,
  deriveChallengeVerdict,
} from "../../lib/qr/challenge";
import type { ExistingQaVerdict, ScanIssue, ScanRecord } from "../../lib/qr/types";

function issue(overrides: Partial<ScanIssue> = {}): ScanIssue {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    ruleId: "console-error",
    category: "browser",
    severity: "WARNING",
    title: "Browser console error",
    description: "Client-side code emitted an error while the page loaded.",
    recommendation: "Resolve the runtime error.",
    scoreImpact: 6,
    evidence: {
      url: "https://candidate.example/checkout",
      consoleMessage: "Checkout failed to initialize",
    },
    fingerprint: overrides.fingerprint ?? crypto.randomUUID().replaceAll("-", "").slice(0, 24),
    scope: "PAGE",
    lifecycle: "ACTIVE",
    occurrences: 1,
    affectedPageIds: [],
    ...overrides,
  };
}

function scan(origin: string, issues: ScanIssue[] = [], routes = ["/", "/checkout"], complete = true): ScanRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    targetUrl: origin,
    normalizedUrl: origin,
    createdAt: now,
    progress: {
      stage: complete ? "COMPLETE" : "FAILED",
      detail: complete ? "Complete" : "Failed",
      completedUnits: complete ? 1 : 0,
      totalUnits: 1,
      updatedAt: now,
    },
    stageHistory: [],
    pages: routes.map((route) => ({
      id: crypto.randomUUID(),
      url: new URL(route, origin).toString(),
      status: 200,
      contentType: "text/html",
      durationMs: 10,
      redirects: 0,
      headers: {},
      facts: {
        title: "Page",
        metaDescription: "Description",
        lang: "en",
        viewport: "width=device-width",
        canonical: "",
        headings: [{ level: 1, text: "Page" }],
        headingSkips: [],
        duplicateIds: [],
        images: [],
        links: [],
        unlabeledControls: [],
        documentWidth: 390,
        viewportWidth: 390,
        htmlBytes: 100,
      },
      consoleErrors: [],
      consoleWarnings: [],
      consoleEvents: [],
      pageErrors: [],
      requestFailures: [],
      networkFailures: [],
      axeViolations: [],
      auditFailures: [],
      eventLimits: { consoleDropped: 0, networkDropped: 0, dialogsDismissed: 0, popupsBlocked: 0, downloadsBlocked: 0 },
    })),
    issues,
    screenshots: [],
    visualComparisons: [],
    lighthouse: { available: true },
    performance: [],
    comparisons: {},
    pageHealth: [],
    issueGroups: [],
    fixQueue: [],
    coverage: {
      discoveredPages: routes.length,
      selectedPages: routes.length,
      inspectedPages: routes.length,
      failedPages: 0,
      skippedByLimit: 0,
      robotsExcluded: 0,
      unverifiedUrls: [],
    },
    timings: { totalMs: 10, browserAuditMs: 10, lighthouseMs: 0, rulesMs: 0, screenshotMs: 0 },
    scannerVersion: "test",
    rulesVersion: "test",
    configSnapshot: {} as ScanRecord["configSnapshot"],
  };
}

function verdict(existingQaVerdict: ExistingQaVerdict, qualifyingRegressionCount: number, evidenceComplete = true) {
  return deriveChallengeVerdict({ existingQaVerdict, qualifyingRegressionCount, evidenceComplete });
}

describe("Challenge verdict truth table", () => {
  it("claims ALT QR won only when QA passed and a qualifying regression is confirmed", () => {
    assert.equal(verdict("PASSED", 1), "ALT_QR_WON");
  });

  it("reports regressions without claiming a win when QA did not pass", () => {
    assert.equal(verdict("UNKNOWN", 1), "RELEASE_HAS_REGRESSIONS");
    assert.equal(verdict("FAILED", 1), "RELEASE_HAS_REGRESSIONS");
  });

  it("reports no qualifying miss when complete evidence confirms none", () => {
    assert.equal(verdict("PASSED", 0), "NO_QUALIFYING_MISS");
  });

  it("never turns incomplete evidence into a pass", () => {
    assert.equal(verdict("PASSED", 0, false), "INSUFFICIENT_EVIDENCE");
    assert.equal(verdict("PASSED", 2, false), "INSUFFICIENT_EVIDENCE");
  });
});

describe("Challenge comparison", () => {
  it("matches the same finding across different production and candidate origins", () => {
    const production = issue({ evidence: { url: "https://production.example/checkout", consoleMessage: "Checkout failed to initialize" } });
    const candidate = issue({ evidence: { url: "https://preview.example/checkout", consoleMessage: "Checkout failed to initialize" } });
    assert.equal(challengeIssueIdentity(production), challengeIssueIdentity(candidate));

    const comparison = buildChallengeComparison(scan("https://production.example", [production]), scan("https://preview.example", [candidate]));
    assert.equal(comparison.existingIssues.length, 1);
    assert.equal(comparison.newRegressions.length, 0);
  });

  it("normalizes absolute resource evidence across origins", () => {
    const production = issue({ ruleId: "missing-alt", category: "accessibility", title: "Image alternative text is missing", evidence: { url: "https://production.example/missing", selector: "html > body img", value: "https://production.example/asset.png" } });
    const candidate = issue({ ruleId: "missing-alt", category: "accessibility", title: "Image alternative text is missing", evidence: { url: "https://preview.example/missing", selector: "html > body img", value: "https://preview.example/asset.png" } });
    assert.equal(challengeIssueIdentity(production), challengeIssueIdentity(candidate));
    const comparison = buildChallengeComparison(scan("https://production.example", [production], ["/", "/missing"]), scan("https://preview.example", [candidate], ["/", "/missing"]));
    assert.equal(comparison.existingIssues.length, 1);
    assert.equal(comparison.newRegressions.length, 0);
  });

  it("classifies findings that disappeared from the candidate as fixed", () => {
    const production = issue({ evidence: { url: "https://production.example/checkout", consoleMessage: "Legacy error" } });
    const comparison = buildChallengeComparison(scan("https://production.example", [production]), scan("https://preview.example"));
    assert.equal(comparison.fixedIssues.length, 1);
  });

  it("does not call a baseline finding fixed when the candidate route was not inspected", () => {
    const production = issue({ evidence: { url: "https://production.example/checkout", consoleMessage: "Legacy error" } });
    const comparison = buildChallengeComparison(
      scan("https://production.example", [production], ["/", "/checkout"]),
      scan("https://preview.example", [], ["/"]),
    );
    assert.equal(comparison.fixedIssues.length, 0);
    assert.match(comparison.unverifiedChanges[0]?.reason ?? "", /candidate coverage/i);
    assert.equal(comparison.evidenceComplete, false);
  });

  it("confirms a supported candidate-only finding on a baseline-covered route after reproduction", () => {
    const candidate = issue();
    const verification = issue({ evidence: { ...candidate.evidence }, fingerprint: "aaaaaaaaaaaaaaaaaaaaaaaa" });
    const comparison = buildChallengeComparison(
      scan("https://production.example"),
      scan("https://candidate.example", [candidate]),
      scan("https://candidate.example", [verification]),
    );
    assert.equal(comparison.newRegressions.length, 1);
    assert.equal(comparison.newRegressions[0]?.confidence, "CONFIRMED");
    assert.deepEqual(comparison.newRegressions[0]?.reproduction, { observed: 2, attempts: 2 });
    assert.equal(comparison.qualifyingRegressionCount, 1);
  });

  it("keeps an unreproduced candidate-only finding unverified", () => {
    const comparison = buildChallengeComparison(scan("https://production.example"), scan("https://candidate.example", [issue()]));
    assert.equal(comparison.unverifiedChanges.length, 1);
    assert.equal(comparison.qualifyingRegressionCount, 0);
  });

  it("does not claim absence when production never inspected the equivalent route", () => {
    const candidate = issue({ evidence: { url: "https://candidate.example/new-route", consoleMessage: "New route error" } });
    const comparison = buildChallengeComparison(
      scan("https://production.example", [], ["/"]),
      scan("https://candidate.example", [candidate], ["/", "/new-route"]),
      scan("https://candidate.example", [candidate], ["/", "/new-route"]),
    );
    assert.equal(comparison.newRegressions.length, 0);
    assert.match(comparison.unverifiedChanges[0]?.reason ?? "", /production coverage/i);
  });

  it("excludes environmental performance variance from qualifying regressions", () => {
    const slow = issue({
      ruleId: "slow-response",
      category: "performance",
      severity: "WARNING",
      title: "Initial response is slow",
      evidence: { url: "https://candidate.example/checkout", value: 1700 },
    });
    const comparison = buildChallengeComparison(
      scan("https://production.example"),
      scan("https://candidate.example", [slow]),
      scan("https://candidate.example", [slow]),
    );
    assert.equal(comparison.newRegressions.length, 0);
    assert.match(comparison.unverifiedChanges[0]?.reason ?? "", /not eligible/i);
  });

  it("redacts tokenized evidence URLs from persisted comparison output", () => {
    const candidate = issue({ evidence: { url: "https://candidate.example/checkout?access_token=top-secret", consoleMessage: "Checkout failed to initialize" } });
    const comparison = buildChallengeComparison(
      scan("https://production.example", [], ["/", "/checkout?access_token=top-secret"]),
      scan("https://candidate.example", [candidate], ["/", "/checkout?access_token=top-secret"]),
      scan("https://candidate.example", [candidate], ["/", "/checkout?access_token=top-secret"]),
    );
    const serialized = JSON.stringify(comparison);
    assert.doesNotMatch(serialized, /top-secret/);
    assert.match(serialized, /%5Bredacted%5D/);
  });
});
