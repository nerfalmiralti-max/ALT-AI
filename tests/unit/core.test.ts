import assert from "node:assert/strict";
import { test } from "node:test";

import { PNG } from "pngjs";

import { dedupeIssues } from "../../lib/qr/dedupe";
import { comparePngBuffers } from "../../lib/qr/diff";
import { buildFixQueue, buildPageHealth, groupIssues } from "../../lib/qr/analysis";
import { compareIssueSets } from "../../lib/qr/comparison";
import { hasUsableLighthouseData, runLighthouseAudit } from "../../lib/qr/lighthouse";
import { coalesceNetworkFailures, filterStructuredNetworkConsoleDuplicates } from "../../lib/qr/network";
import { buildPerformanceReadings } from "../../lib/qr/performance";
import { DEFAULT_RELEASE_GATE, deriveShipVerdict, evaluateReleaseGate } from "../../lib/qr/release";
import { isAllowedByRobots, parseRobotsPolicy } from "../../lib/qr/robots";
import { evaluatePages, stableIssueFingerprint } from "../../lib/qr/rules/evaluate";
import { calculateScore } from "../../lib/qr/scoring";
import { sanitizeDiagnosticText } from "../../lib/qr/sanitize";
import { assertSafeTarget, guardBrowserRequest, isLikelyMaliciousDownload, isPrivateAddress, TargetUrlError } from "../../lib/qr/security";
import type { PageAudit, ScanIssue } from "../../lib/qr/types";
import { normalizeTargetInput, normalizeUrl, selectCrawlTargets } from "../../lib/qr/url";
import { classifyVisualChange } from "../../lib/qr/visual";

function basePage(overrides: Partial<PageAudit> = {}): PageAudit {
  return {
    id: "page", url: "https://example.com/", status: 200, contentType: "text/html", durationMs: 100, redirects: 0,
    headers: { "content-security-policy": "default-src 'self'", "strict-transport-security": "max-age=1000" },
    facts: { title: "Example", metaDescription: "Description", lang: "en", viewport: "width=device-width", canonical: "", headings: [{ level: 1, text: "Example" }], headingSkips: [], duplicateIds: [], images: [], links: [], unlabeledControls: [], documentWidth: 1000, viewportWidth: 1000, htmlBytes: 100 },
    consoleErrors: [], consoleWarnings: [], consoleEvents: [], pageErrors: [], requestFailures: [], networkFailures: [], axeViolations: [], auditFailures: [], eventLimits: { consoleDropped: 0, networkDropped: 0, dialogsDismissed: 0, popupsBlocked: 0, downloadsBlocked: 0 }, ...overrides,
  };
}

test("URL normalization removes fragments, tracking, defaults, and duplicate slashes", () => {
  assert.equal(normalizeUrl("https://Example.com:443/path///?utm_source=x&b=2&a=1#part"), "https://example.com/path?a=1&b=2");
});

test("target input normalization adds HTTPS without rewriting explicit schemes", () => {
  assert.equal(normalizeTargetInput(" example.com "), "https://example.com");
  assert.equal(normalizeTargetInput("example.com:8080/path"), "https://example.com:8080/path");
  assert.equal(normalizeTargetInput("http://example.com"), "http://example.com");
  assert.equal(normalizeTargetInput("javascript:alert(1)"), "javascript:alert(1)");
});

test("Lighthouse availability requires at least one finite score or metric", () => {
  assert.equal(hasUsableLighthouseData({}, {}), false);
  assert.equal(hasUsableLighthouseData({ performance: undefined }, { lcp: undefined }), false);
  assert.equal(hasUsableLighthouseData({ performance: 92 }, {}), true);
  assert.equal(hasUsableLighthouseData({}, { lcp: 1_200 }), true);
});

test("crawler remains same-origin, deduplicates, bounds query variants, and avoids destructive/download URLs", () => {
  const targets = selectCrawlTargets("https://example.com/", [
    "https://example.com/about", "https://example.com/about#team", "https://other.test/", "https://example.com/logout",
    "https://example.com/file.pdf", "https://example.com/search?q=1", "https://example.com/search?q=2", "https://example.com/search?q=3",
    "https://example.com/api/scans/123/receipt", "https://example.com/assets/capture.png",
    "https://example.com/%6cogout", "https://example.com/account?action=delete",
    `https://example.com/too-large?value=${"x".repeat(2_100)}`,
  ], 10);
  assert.deepEqual(targets, ["https://example.com/", "https://example.com/about", "https://example.com/search?q=1", "https://example.com/search?q=2"]);
});

test("SSRF address classifier rejects private and special ranges", async () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.4.3.2"), true);
  assert.equal(isPrivateAddress("169.254.1.1"), true);
  assert.equal(isPrivateAddress("100.64.0.1"), true);
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateAddress("::ffff:169.254.169.254"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  await assert.rejects(() => assertSafeTarget("file:///etc/passwd"), (error: unknown) => error instanceof TargetUrlError && error.code === "UNSUPPORTED_SCHEME");
  await assert.rejects(() => assertSafeTarget("https://user:secret@example.com"), (error: unknown) => error instanceof TargetUrlError && error.code === "CREDENTIALS_NOT_ALLOWED");
  await assert.rejects(() => assertSafeTarget("http://127.0.0.1", { allowPrivate: false }), (error: unknown) => error instanceof TargetUrlError && error.code === "PRIVATE_TARGET");
});

test("browser resource guard blocks unsupported schemes and executable/archive downloads", async () => {
  assert.equal(isLikelyMaliciousDownload("https://example.com/release.zip?download=1"), true);
  assert.equal(isLikelyMaliciousDownload("https://example.com/image.png"), false);
  await assert.rejects(() => guardBrowserRequest("file:///etc/passwd"), (error: unknown) => error instanceof TargetUrlError && error.code === "UNSUPPORTED_RESOURCE");
  await assert.rejects(() => guardBrowserRequest("https://example.com/setup.exe"), (error: unknown) => error instanceof TargetUrlError && error.code === "DOWNLOAD_BLOCKED");
});

test("robots parser applies every matching agent in a grouped record", () => {
  const policy = parseRobotsPolicy("https://example.com", `
User-agent: *
User-agent: Googlebot
Disallow: /private

User-agent: OtherBot
Disallow: /other-only
`);
  assert.equal(isAllowedByRobots("https://example.com/private/report", policy), false);
  assert.equal(isAllowedByRobots("https://example.com/other-only/report", policy), true);
  assert.equal(isAllowedByRobots("https://example.com/public", policy), true);
});

test("rule evaluation creates evidence-backed findings", () => {
  const page = basePage({ facts: { ...basePage().facts, title: "", images: [{ src: "https://example.com/a.png", alt: null }], documentWidth: 1200, viewportWidth: 390 } });
  const issues = evaluatePages([page], { available: false });
  assert.ok(issues.some((issue) => issue.ruleId === "missing-title" && issue.severity === "CRITICAL"));
  assert.ok(issues.some((issue) => issue.ruleId === "missing-alt" && issue.evidence.value));
  assert.ok(issues.some((issue) => issue.ruleId === "horizontal-overflow"));
});

test("scoring is deterministic, weighted, and clamped", () => {
  const issue = (category: ScanIssue["category"], impact: number): ScanIssue => ({ id: crypto.randomUUID(), ruleId: "test", category, severity: "WARNING", title: "Test", description: "Test", recommendation: "Fix", scoreImpact: impact, evidence: { url: "https://example.com" }, fingerprint: crypto.randomUUID(), scope: "PAGE", lifecycle: "ACTIVE", occurrences: 1, affectedPageIds: ["page"] });
  const score = calculateScore([issue("performance", 20), issue("accessibility", 10)]);
  assert.equal(score.overall, 94);
  assert.equal(score.status, "READY");
  assert.equal(calculateScore([issue("performance", 500)]).categories[0].score, 0);
});

test("issue deduplication keeps the strongest finding for a fingerprint", () => {
  const common: ScanIssue = { id: "1", ruleId: "x", category: "browser", severity: "NOTICE", title: "x", description: "x", recommendation: "x", scoreImpact: 1, evidence: { url: "https://example.com" }, fingerprint: "same", scope: "PAGE", lifecycle: "ACTIVE", occurrences: 1, affectedPageIds: ["page"] };
  const result = dedupeIssues([common, { ...common, id: "2", severity: "CRITICAL" }]);
  assert.equal(result.length, 1); assert.equal(result[0].severity, "CRITICAL");
});

test("visual diff returns exact changed pixel measurements", () => {
  const first = new PNG({ width: 2, height: 2, colorType: 6 }); first.data.fill(255);
  const second = new PNG({ width: 2, height: 2, colorType: 6 }); second.data.fill(255); second.data[0] = 0;
  const result = comparePngBuffers(PNG.sync.write(first), PNG.sync.write(second));
  assert.equal(result.totalPixels, 4); assert.equal(result.changedPixels, 1); assert.equal(result.diffPercentage, 25);
});

test("issue fingerprints remain stable across IDs and changing numeric evidence", () => {
  const first = stableIssueFingerprint({ ruleId: "horizontal-overflow", scope: "PAGE", url: "https://EXAMPLE.com/path#one", selector: "main.content" });
  const second = stableIssueFingerprint({ ruleId: "horizontal-overflow", scope: "PAGE", url: "https://example.com/path#two", selector: "main.content" });
  assert.equal(first, second);
});

test("issue comparison distinguishes fixed, new, unchanged, changed, and regression findings", () => {
  const finding = (fingerprint: string, value: number, title = fingerprint): ScanIssue => ({
    id: crypto.randomUUID(), ruleId: fingerprint, category: "mobile", severity: "WARNING", title, description: title,
    recommendation: "Fix", scoreImpact: 2, evidence: { url: "https://example.com", value }, fingerprint,
    scope: "PAGE", lifecycle: "ACTIVE", occurrences: 1, affectedPageIds: ["page"],
  });
  const result = compareIssueSets("a", "b", [finding("fixed", 1), finding("same", 1), finding("worse", 10), finding("changed", 5)], [
    finding("new", 1), finding("same", 1), finding("worse", 20), finding("changed", 2),
  ]);
  assert.equal(result.fixedCount, 1); assert.equal(result.newCount, 1); assert.equal(result.unchangedCount, 1);
  assert.equal(result.regressionCount, 1); assert.equal(result.changedCount, 1);
});

test("release gate and verdict expose deterministic blocker reasoning", () => {
  const broken = basePage({ status: 404 });
  const issues = evaluatePages([broken], { available: false });
  const score = calculateScore(issues);
  const gate = evaluateReleaseGate(score, issues, [broken], DEFAULT_RELEASE_GATE);
  assert.equal(gate.status, "FAIL");
  assert.ok(gate.checks.some((check) => check.id === "broken-pages" && !check.passed));
  assert.equal(deriveShipVerdict(gate, issues), "BLOCKED");
});

test("performance and visual thresholds classify documented boundaries", () => {
  const readings = buildPerformanceReadings({ available: true, metrics: { lcp: 2500, cls: 0.1, tbt: 201, fcp: 1800, speedIndex: 3401 } });
  assert.equal(readings.find((reading) => reading.key === "lcp")?.rating, "GOOD");
  assert.equal(readings.find((reading) => reading.key === "tbt")?.rating, "NEEDS ATTENTION");
  assert.equal(classifyVisualChange(.1), "NO MEANINGFUL CHANGE");
  assert.equal(classifyVisualChange(.11), "MINOR CHANGE");
  assert.equal(classifyVisualChange(5.01), "MAJOR CHANGE");
});

test("analysis groups repeated findings, builds page health, and prioritizes blockers", () => {
  const page = basePage({ status: 404 });
  const issues = evaluatePages([page], { available: false });
  const groups = groupIssues(issues);
  const health = buildPageHealth([page], issues, []);
  const queue = buildFixQueue(groups, issues, evaluateReleaseGate(calculateScore(issues), issues, [page], DEFAULT_RELEASE_GATE));
  assert.ok(groups.length > 0);
  assert.equal(health[0].status, "BLOCKED");
  assert.equal(queue[0].gateBlocker, true);
});

test("site and page findings remain explicitly separated when grouped", () => {
  const finding = (fingerprint: string, scope: ScanIssue["scope"], pageId: string): ScanIssue => ({
    id: crypto.randomUUID(), ruleId: "missing-csp", category: "infrastructure", severity: "NOTICE",
    title: "Content Security Policy is missing", description: "Missing policy", recommendation: "Add CSP",
    scoreImpact: 3, evidence: { url: `https://example.com/${pageId}` }, fingerprint, scope,
    lifecycle: "ACTIVE", occurrences: 1, affectedPageIds: [pageId],
  });
  const groups = groupIssues([
    finding("site-one", "SITE", "page-a"),
    finding("site-two", "SITE", "page-b"),
    finding("page-one", "PAGE", "page-a"),
  ]);
  assert.equal(groups.find((group) => group.scope === "SITE")?.affectedPages.length, 2);
  assert.equal(groups.find((group) => group.scope === "PAGE")?.affectedPages.length, 1);
});

test("failed documents produce only transport evidence, not fabricated DOM findings", () => {
  const failed = basePage({ status: 0, failure: { code: "NAVIGATION_FAILED", message: "Connection closed" }, facts: { ...basePage().facts, title: "", metaDescription: "", lang: "", viewport: "", headings: [] } });
  assert.deepEqual(evaluatePages([failed], { available: false }).map((issue) => issue.ruleId), ["http-status"]);
  const child = { ...failed, id: "child", url: "https://example.com/child" };
  assert.deepEqual(evaluatePages([basePage(), child], { available: false }).filter((issue) => issue.evidence.url === child.url).map((issue) => issue.ruleId), ["http-status", "broken-link"]);
});

test("manual accessibility rules suppress overlapping axe penalties while distinct axe rules keep identity", () => {
  const page = basePage({
    facts: { ...basePage().facts, images: [{ src: "https://example.com/a.png", alt: null, selector: "#hero" }] },
    axeViolations: [
      { id: "image-alt", impact: "critical", description: "Image alt", help: "Images need alt", helpUrl: "https://deque.test/image", nodes: [{ target: ["#hero"], html: "<img id=hero>" }] },
      { id: "color-contrast", impact: "serious", description: "Contrast", help: "Contrast", helpUrl: "https://deque.test/contrast", nodes: [{ target: ["#hero"], html: "<img id=hero>" }] },
      { id: "aria-valid-attr", impact: "serious", description: "ARIA", help: "ARIA valid", helpUrl: "https://deque.test/aria", nodes: [{ target: ["#hero"], html: "<img id=hero>" }] },
    ],
  });
  const issues = evaluatePages([page], { available: false });
  assert.equal(issues.filter((issue) => issue.ruleId === "missing-alt").length, 1);
  assert.equal(issues.filter((issue) => issue.ruleId === "axe-violation").length, 2);
  assert.equal(new Set(issues.filter((issue) => issue.ruleId === "axe-violation").map((issue) => issue.fingerprint)).size, 2);
});

test("heading-order, duplicate-ID, and console warning rules use captured evidence", () => {
  const page = basePage({
    facts: { ...basePage().facts, headingSkips: [{ from: 1, to: 3, text: "Skipped", selector: "#skipped" }], duplicateIds: [{ id: "same", count: 2, selector: "#same" }] },
    consoleEvents: [{ level: "warning", message: "Repeated warning", count: 2 }],
  });
  const issues = evaluatePages([page], { available: false });
  assert.ok(issues.some((issue) => issue.ruleId === "heading-order" && issue.evidence.selector === "#skipped"));
  assert.ok(issues.some((issue) => issue.ruleId === "duplicate-id" && issue.occurrences === 2));
  assert.ok(issues.some((issue) => issue.ruleId === "console-warning" && issue.occurrences === 2));
});

test("higher Lighthouse scores are improvements, not regressions", () => {
  const finding = (value: number): ScanIssue => ({
    id: crypto.randomUUID(), ruleId: "poor-lighthouse", category: "performance", severity: "WARNING", title: "Performance", description: "", recommendation: "", scoreImpact: 10,
    evidence: { url: "https://example.com/", value }, fingerprint: "lighthouse-score", scope: "SITE", lifecycle: "ACTIVE", occurrences: 1, affectedPageIds: ["page"],
  });
  assert.equal(compareIssueSets("a", "b", [finding(40)], [finding(60)]).items[0].status, "CHANGED");
  assert.equal(compareIssueSets("a", "b", [finding(60)], [finding(40)]).items[0].status, "REGRESSION");
});

test("clean scores reconcile and verdict boundaries never overrule failed gates", () => {
  const cleanScore = calculateScore([]);
  assert.equal(cleanScore.overall, 100);
  assert.equal(cleanScore.categories.reduce((sum, category) => sum + category.score * category.weight / 100, 0), 100);
  const pass = evaluateReleaseGate(cleanScore, [], [basePage()], DEFAULT_RELEASE_GATE);
  assert.equal(pass.status, "PASS");
  assert.equal(deriveShipVerdict(pass, []), "READY TO SHIP");
  const critical = evaluatePages([basePage({ facts: { ...basePage().facts, title: "" } })], { available: false });
  const highButBlocked = evaluateReleaseGate({ ...cleanScore, overall: 95 }, critical, [basePage()], DEFAULT_RELEASE_GATE);
  assert.equal(highButBlocked.status, "FAIL");
  assert.equal(deriveShipVerdict(highButBlocked, critical), "BLOCKED");
});

test("Lighthouse cancellation is honored before browser startup", async () => {
  const controller = new AbortController(); controller.abort();
  const started = performance.now();
  const result = await runLighthouseAudit("https://example.com", controller.signal);
  assert.equal(result.available, false);
  assert.ok(performance.now() - started < 2_000);
});

test("visual diff rejects hostile declared PNG dimensions before decode", () => {
  const hostile = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(hostile, 0);
  Buffer.from("IHDR").copy(hostile, 12);
  hostile.writeUInt32BE(100_000, 16); hostile.writeUInt32BE(100_000, 20);
  assert.throws(() => comparePngBuffers(hostile, hostile), /pixel budget/);
});

test("issue spread to more pages is a regression even when its fingerprint is stable", () => {
  const finding = (count: number): ScanIssue => ({
    id: crypto.randomUUID(), ruleId: "missing-csp", category: "infrastructure", severity: "NOTICE", title: "CSP", description: "", recommendation: "",
    scoreImpact: 3, evidence: { url: "https://example.com" }, fingerprint: "stable-site-finding", scope: "SITE", lifecycle: "ACTIVE", occurrences: count,
    affectedPageIds: Array.from({ length: count }, (_, index) => `page-${index}`),
  });
  assert.equal(compareIssueSets("a", "b", [finding(1)], [finding(3)]).items[0].status, "REGRESSION");
});

test("permissive gates never turn active critical findings into READY TO SHIP", () => {
  const cleanScore = calculateScore([]);
  const critical = evaluatePages([basePage({ facts: { ...basePage().facts, title: "" } })], { available: false });
  const permissive = evaluateReleaseGate({ ...cleanScore, overall: 95 }, critical, [basePage()], { ...DEFAULT_RELEASE_GATE, failOnCritical: false });
  assert.equal(permissive.status, "PASS");
  assert.equal(deriveShipVerdict(permissive, critical), "READY WITH WARNINGS");
});

test("weighted score rounds exact half boundaries mathematically", () => {
  const issue: ScanIssue = { id: "half", ruleId: "half", category: "seo", severity: "WARNING", title: "Half", description: "", recommendation: "", scoreImpact: 50, evidence: { url: "https://example.com" }, fingerprint: "half", scope: "SITE", lifecycle: "ACTIVE", occurrences: 1, affectedPageIds: ["page"] };
  assert.equal(calculateScore([issue]).overall, 93);
});

test("diagnostic sanitization removes Windows paths containing spaces and Playwright suffixes", () => {
  const cleaned = sanitizeDiagnosticText("Error at C:\\Users\\user\\Documents\\ALT ai\\node_modules\\playwright\\index.js:10:2");
  assert.equal(cleaned.includes("ALT ai"), false);
  assert.equal(cleaned.includes("playwright"), false);
  assert.equal(cleaned.includes("[local path]"), true);
});

test("structured network failures suppress browser duplicates and aggregate shared resources across pages", () => {
  const failedUrl = "https://example.com/shared.js";
  const networkFailures: PageAudit["networkFailures"] = [
    { method: "GET", url: failedUrl, resourceType: "script", reason: "HTTP 404", status: 404, count: 1 },
    { method: "GET", url: failedUrl, resourceType: "script", reason: "net::ERR_ABORTED", count: 1 },
  ];
  const duplicateConsole: PageAudit["consoleEvents"] = [{
    level: "error", message: "Failed to load resource: the server responded with a status of 404 (Not Found)", url: failedUrl, count: 1,
  }];
  const first = basePage({ id: "page-a", url: "https://example.com/a", networkFailures, consoleEvents: duplicateConsole });
  const second = basePage({ id: "page-b", url: "https://example.com/b", networkFailures, consoleEvents: duplicateConsole });
  const issues = dedupeIssues(evaluatePages([first, second], { available: false }));
  const resourceFindings = issues.filter((entry) => entry.ruleId === "request-failure");
  assert.equal(resourceFindings.length, 1);
  assert.equal(resourceFindings[0].scope, "SITE");
  assert.equal(resourceFindings[0].occurrences, 2);
  assert.deepEqual(resourceFindings[0].affectedPageIds.sort(), ["page-a", "page-b"]);
  assert.equal(issues.some((entry) => entry.ruleId === "console-error"), false);
});

test("raw browser observations retain one structured event per failed request", () => {
  const url = "https://example.com/app.js";
  const failures: PageAudit["networkFailures"] = [
    { method: "GET", url, resourceType: "script", reason: "HTTP 404", status: 404, count: 1 },
    { method: "GET", url, resourceType: "script", reason: "net::ERR_ABORTED", count: 1 },
    { method: "GET", url: "https://example.com/offline.js", resourceType: "script", reason: "net::ERR_NAME_NOT_RESOLVED", count: 1 },
  ];
  const normalized = coalesceNetworkFailures(failures);
  assert.deepEqual(normalized.map((failure) => [failure.url, failure.reason]), [
    [url, "HTTP 404"],
    ["https://example.com/offline.js", "net::ERR_NAME_NOT_RESOLVED"],
  ]);
  const consoleEvents: PageAudit["consoleEvents"] = [
    { level: "error", message: "Failed to load resource: the server responded with a status of 404 (Not Found)", url, count: 1 },
    { level: "error", message: "Application failed to load resource", url: "https://example.com/page", count: 1 },
  ];
  assert.deepEqual(filterStructuredNetworkConsoleDuplicates(consoleEvents, normalized).map((event) => event.message), ["Application failed to load resource"]);
});

test("score and gate invariants follow deduplicated underlying findings", () => {
  const blockerPage = basePage({ facts: { ...basePage().facts, title: "" } });
  const blocker = evaluatePages([blockerPage], { available: false }).find((entry) => entry.ruleId === "missing-title");
  assert.ok(blocker);
  const oneFinding = calculateScore(dedupeIssues([blocker]));
  const duplicateObservation = calculateScore(dedupeIssues([blocker, { ...blocker, id: crypto.randomUUID() }]));
  const repaired = calculateScore([]);
  assert.deepEqual(duplicateObservation, oneFinding, "duplicate observations must not multiply the score penalty");
  assert.ok(oneFinding.overall < repaired.overall, "adding a genuine blocker must not improve the score");
  assert.equal(evaluateReleaseGate(oneFinding, [blocker], [blockerPage], DEFAULT_RELEASE_GATE).status, "FAIL");
  assert.equal(evaluateReleaseGate(repaired, [], [basePage()], DEFAULT_RELEASE_GATE).status, "PASS");
});
