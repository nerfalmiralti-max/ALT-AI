import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";

import { startFixtureServer } from "../fixtures/server";

async function main() {
  const testData = path.resolve(process.cwd(), ".alt-qr-data", "page-timeout-test");
  const dataRoot = path.resolve(process.cwd(), ".alt-qr-data");
  if (!testData.startsWith(`${dataRoot}${path.sep}`)) throw new Error("Refusing to clear timeout data outside the ALT QR test store");
  await rm(testData, { recursive: true, force: true });
  process.env.ALT_QR_DATA_DIR = ".alt-qr-data/page-timeout-test";
  process.env.ALT_QR_ALLOW_PRIVATE_TARGETS = "true";
  process.env.ALT_QR_SCAN_TIMEOUT_MS = "30000";
  process.env.ALT_QR_PAGE_TIMEOUT_MS = "2000";
  const fixture = await startFixtureServer();
  try {
    const [store, { normalizeUrl }, worker] = await Promise.all([import("../../lib/qr/store"), import("../../lib/qr/url"), import("../../lib/qr/worker")]);
    const target = `${fixture.origin}/timeout-root`;
    const seed = await store.createScan(target, normalizeUrl(target));
    const result = await worker.runScanAndWait(seed.id);
    assert.equal(result.progress.stage, "COMPLETE");
    const slow = result.pages.find((page) => page.url.endsWith("/slow"));
    assert.equal(slow?.failure?.code, "NAVIGATION_FAILED", "one slow child must time out without discarding completed pages");
    assert.ok(result.pages.some((page) => page.url.endsWith("/good") && page.status === 200));
  } finally {
    await fixture.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
