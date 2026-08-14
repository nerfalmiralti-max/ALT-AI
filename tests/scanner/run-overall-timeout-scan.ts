import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";

import { startFixtureServer } from "../fixtures/server";

async function main() {
  const testData = path.resolve(process.cwd(), ".alt-qr-data", "overall-timeout-test");
  const dataRoot = path.resolve(process.cwd(), ".alt-qr-data");
  if (!testData.startsWith(`${dataRoot}${path.sep}`)) throw new Error("Refusing to clear timeout data outside the ALT QR test store");
  await rm(testData, { recursive: true, force: true });
  process.env.ALT_QR_DATA_DIR = ".alt-qr-data/overall-timeout-test";
  process.env.ALT_QR_ALLOW_PRIVATE_TARGETS = "true";
  process.env.ALT_QR_SCAN_TIMEOUT_MS = "15000";
  process.env.ALT_QR_PAGE_TIMEOUT_MS = "45000";
  const fixture = await startFixtureServer();
  try {
    const [store, { normalizeUrl }, worker] = await Promise.all([import("../../lib/qr/store"), import("../../lib/qr/url"), import("../../lib/qr/worker")]);
    const target = `${fixture.origin}/timeout-root`;
    const seed = await store.createScan(target, normalizeUrl(target));
    const result = await worker.runScanAndWait(seed.id);
    assert.equal(result.progress.stage, "COMPLETE", "an overall timeout after primary evidence should preserve a partial report");
    assert.ok((result.coverage.partialPages ?? 0) >= 1);
    assert.ok(result.pages.some((page) => page.auditFailures.some((failure) => failure.system === "timeout")));
    assert.equal(result.lighthouse.available, false);
    assert.notEqual(result.verdict, "READY TO SHIP");
  } finally {
    await fixture.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
