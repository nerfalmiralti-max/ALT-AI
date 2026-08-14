import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { startFixtureServer } from "../fixtures/server";

async function main() {
  const testData = path.resolve(process.cwd(), ".alt-qr-data", "scanner-test");
  const dataRoot = path.resolve(process.cwd(), ".alt-qr-data");
  if (!testData.startsWith(`${dataRoot}${path.sep}`)) throw new Error("Refusing to clear scanner data outside the ALT QR test store");
  await rm(testData, { recursive: true, force: true });
  process.env.ALT_QR_DATA_DIR = ".alt-qr-data/scanner-test";
  process.env.ALT_QR_ALLOW_PRIVATE_TARGETS = "true";
  const fixture = await startFixtureServer();
  try {
    const [{ assertSafeTarget }, store, { normalizeUrl }, worker] = await Promise.all([
      import("../../lib/qr/security"), import("../../lib/qr/store"), import("../../lib/qr/url"), import("../../lib/qr/worker"),
    ]);
    const target = `${fixture.origin}/`;
    await assertSafeTarget(target);

    fixture.setVariant("A");
    const first = await store.createScan(target, normalizeUrl(target));
    const baseline = await worker.runScanAndWait(first.id);
    assert.equal(baseline.progress.stage, "COMPLETE", baseline.failure?.message);
    assert.deepEqual(baseline.stageHistory.map((entry) => entry.stage), ["QUEUED", "DISCOVERING", "INSPECTING", "AUDITING", "CAPTURING", "COMPARING", "SCORING", "COMPLETE"]);
    assert.ok(baseline.pages.length >= 7, `expected at least 7 pages, got ${baseline.pages.length}`);
    assert.equal(baseline.pages.length, 10, "fixture A should exercise the bounded ten-page crawl");
    assert.ok(baseline.pages.some((page) => page.url.endsWith("/deep")), "crawler must discover a route linked only from a child page");
    assert.ok(baseline.pages.some((page) => page.failure), "partial page failure should be preserved as evidence");
    assert.ok(
      baseline.pages.some((page) => page.status === 404 && page.networkFailures.some((failure) => failure.resourceType === "document" && failure.status === 404)),
      "network health must capture completed HTTP error responses, not only transport failures",
    );
    assert.ok(
      baseline.pages.some((page) => page.url.endsWith("/partial-failure") && page.failure?.code === "NAVIGATION_FAILED"),
      "failed navigation must preserve the requested URL instead of Chromium's internal error URL",
    );
    assert.deepEqual(
      baseline.issues.filter((issue) => issue.evidence.url.endsWith("/partial-failure")).map((issue) => issue.ruleId).sort(),
      ["broken-link", "http-status"],
      "a transport failure must not fabricate DOM, axe, header, or runtime findings",
    );
    const networkTypes = new Set(baseline.pages.flatMap((page) => page.networkFailures.map((failure) => failure.resourceType)));
    for (const type of ["document", "image", "script", "stylesheet", "font", "fetch/xhr"]) assert.ok(networkTypes.has(type as typeof baseline.pages[number]["networkFailures"][number]["resourceType"]), `missing network resource classification: ${type}`);
    assert.ok(baseline.pages.some((page) => page.networkFailures.some((failure) => failure.status === 413)), "oversized browser resources must be blocked before their full body is admitted");
    assert.equal(fixture.getUpgradeAttempts(), 0, "scanner pages must not create outbound WebSocket connections");
    assert.ok(baseline.pages.some((page) => page.consoleEvents.some((event) => event.level === "warning" && event.count === 2)), "repeated console warnings must be deduplicated with a repeat count");
    assert.ok(baseline.lighthouse.available, `Lighthouse must return real fixture metrics: ${baseline.lighthouse.error ?? "no metrics"}`);
    assert.ok(baseline.screenshots.some((asset) => asset.viewport === "desktop"));
    assert.ok(baseline.screenshots.some((asset) => asset.viewport === "mobile"));
    for (const ruleId of ["http-status", "broken-link", "missing-title", "missing-alt", "horizontal-overflow", "console-error", "console-warning", "unlabeled-control", "request-failure"]) {
      assert.ok(baseline.issues.some((issue) => issue.ruleId === ruleId), `missing fixture finding: ${ruleId}`);
    }
    assert.ok(baseline.score && baseline.score.overall >= 0 && baseline.score.overall <= 100);
    assert.ok(baseline.releaseGate && baseline.verdict && baseline.fixQueue.length && baseline.pageHealth.length);
    assert.equal(baseline.scannerVersion, "2.1.0");
    assert.equal(baseline.rulesVersion, "2.1.0");
    assert.deepEqual(baseline.configSnapshot.mobileViewport, { width: 390, height: 844, deviceScaleFactor: 1 });
    await store.setProjectBaseline(baseline.projectId, baseline.id);
    assert.equal((await store.getProject(baseline.projectId))?.baselineScanId, baseline.id, "project baseline must persist before the comparison scan");

    fixture.setVariant("B");
    const second = await store.createScan(target, normalizeUrl(target));
    const current = await worker.runScanAndWait(second.id);
    assert.equal(current.progress.stage, "COMPLETE", current.failure?.message);
    assert.equal(current.comparisons.previous?.baseScanId, baseline.id);
    assert.equal(current.comparisons.baseline?.baseScanId, baseline.id);
    assert.ok((current.comparisons.previous?.issues.fixedCount ?? 0) > 0, "expected fixed findings in variant B");
    assert.ok((current.comparisons.previous?.issues.newCount ?? 0) > 0, "expected new findings in variant B");
    assert.ok((current.comparisons.previous?.issues.regressionCount ?? 0) > 0, "expected a numeric overflow regression in variant B");
    for (const ruleId of ["heading-order", "duplicate-id"]) assert.ok(current.issues.some((issue) => issue.ruleId === ruleId), `missing new variant-B finding: ${ruleId}`);
    assert.ok(!current.issues.some((issue) => issue.ruleId === "unlabeled-control"), "variant B should repair the form label");
    assert.ok(!current.issues.some((issue) => issue.ruleId === "console-error" && issue.evidence.consoleMessage?.includes("fixture console failure")), "variant B should remove the intentional console error");
    assert.ok(!current.issues.some((issue) => issue.ruleId === "console-warning" && issue.evidence.consoleMessage?.includes("fixture repeated warning")), "variant B should remove the repeated warning");
    assert.ok(current.visualComparisons.some((comparison) => comparison.comparisonTarget === "previous" && comparison.diffPercentage > 0));
    assert.ok(current.visualComparisons.some((comparison) => comparison.comparisonTarget === "baseline"));
    assert.ok(current.screenshots.some((asset) => asset.viewport === "diff" && asset.sourceViewport === "mobile"));

    const cleanRedirectSeed = await store.createScan(`${fixture.origin}/redirect`, normalizeUrl(`${fixture.origin}/redirect`));
    const cleanRedirect = await worker.runScanAndWait(cleanRedirectSeed.id);
    assert.equal(cleanRedirect.progress.stage, "COMPLETE");
    assert.equal(cleanRedirect.pages[0]?.url, `${fixture.origin}/clean`, "same-origin redirects must preserve the final inspected URL");
    assert.equal(cleanRedirect.pages[0]?.redirects, 1);
    assert.equal(cleanRedirect.score?.overall, 100, "the clean deterministic fixture should score 100");
    assert.equal(cleanRedirect.releaseGate?.status, "PASS");
    assert.equal(cleanRedirect.verdict, "READY TO SHIP");

    const missingLangSeed = await store.createScan(`${fixture.origin}/missing-lang`, normalizeUrl(`${fixture.origin}/missing-lang`));
    const missingLang = await worker.runScanAndWait(missingLangSeed.id);
    assert.ok(missingLang.issues.some((issue) => issue.ruleId === "missing-lang"), "axe/manual language evidence must fire on a real page without html[lang]");

    const unreachableSeed = await store.createScan(`${fixture.origin}/partial-failure`, normalizeUrl(`${fixture.origin}/partial-failure`));
    const unreachable = await worker.runScanAndWait(unreachableSeed.id);
    assert.equal(unreachable.progress.stage, "FAILED", "an unreachable primary page must not produce a scored COMPLETE report");
    assert.equal(unreachable.failure?.code, "PRIMARY_NAVIGATION_FAILED");

    const slowTarget = `${fixture.origin}/slow`;
    const cancelledSeed = await store.createScan(slowTarget, normalizeUrl(slowTarget));
    const started = worker.startScan(cancelledSeed.id);
    let beforeCancel = await store.getScan(cancelledSeed.id);
    const progressDeadline = Date.now() + 10_000;
    while (!beforeCancel?.progress.currentUrl && Date.now() < progressDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      beforeCancel = await store.getScan(cancelledSeed.id);
    }
    assert.ok(beforeCancel?.progress.currentUrl, "active cancellation fixture should expose a factual current URL before cancellation");
    const cancelStarted = Date.now();
    const cancelled = await worker.cancelScan(cancelledSeed.id);
    await started;
    assert.equal(cancelled?.progress.stage, "CANCELLED");
    assert.equal(cancelled?.progress.completedUnits, beforeCancel?.progress.completedUnits);
    assert.equal(cancelled?.progress.totalUnits, beforeCancel?.progress.totalUnits);
    assert.equal(cancelled?.progress.currentUrl, beforeCancel?.progress.currentUrl);
    assert.ok(Date.now() - cancelStarted < 10_000, "cancellation should release the active browser promptly");

    const reserved = worker.reserveScanSlot();
    assert.ok(reserved, "the idle worker should reserve one atomic admission slot");
    assert.equal(worker.reserveScanSlot(), null, "a second concurrent admission must not pass the one-scan capacity gate");
    worker.releaseScanSlot(reserved);

    const interruptedSeed = await store.createScan(`${fixture.origin}/good`, normalizeUrl(`${fixture.origin}/good`));
    const recoveredInterrupted = await worker.recoverInterruptedScan(interruptedSeed.id);
    assert.equal(recoveredInterrupted?.progress.stage, "FAILED");
    assert.equal(recoveredInterrupted?.failure?.code, "WORKER_RESTARTED");

    await store.saveScan(current);
    await writeFile(path.join(testData, "scans", `${current.id}.json`), "{ interrupted write", "utf8");
    const recoveredJson = await store.getScan(current.id);
    assert.equal(recoveredJson?.progress.stage, "COMPLETE", "corrupt primary JSON should recover from the last-known-good backup");
    if (recoveredJson) await store.saveScan(recoveredJson);
    JSON.parse(await readFile(path.join(testData, "scans", `${current.id}.json.bak`), "utf8"));

    const unreadablePath = path.join(testData, "scans", `${interruptedSeed.id}.json`);
    await writeFile(unreadablePath, "{ corrupt primary", "utf8");
    await writeFile(`${unreadablePath}.bak`, "{ corrupt backup", "utf8");
    await assert.rejects(() => store.getScan(interruptedSeed.id), /last known-good local backup/);

    console.log(JSON.stringify({
      baseline: { scanId: baseline.id, pages: baseline.pages.length, issues: baseline.issues.length, score: baseline.score?.overall },
      current: {
        scanId: current.id, pages: current.pages.length, issues: current.issues.length, score: current.score?.overall,
        fixed: current.comparisons.previous?.issues.fixedCount, new: current.comparisons.previous?.issues.newCount,
        regressions: current.comparisons.previous?.issues.regressionCount, visual: current.comparisons.previous?.visualDifference,
        gate: current.releaseGate?.status, verdict: current.verdict,
      },
      clean: { scanId: cleanRedirect.id, score: cleanRedirect.score?.overall, gate: cleanRedirect.releaseGate?.status, verdict: cleanRedirect.verdict },
      cancellation: cancelled?.progress.stage,
    }, null, 2));
  } finally {
    fixture.server.closeAllConnections();
    await fixture.close();
  }
}

void main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
