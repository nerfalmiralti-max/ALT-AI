import assert from "node:assert/strict";
import test from "node:test";

import { readJsonBody, RequestBodyError } from "../../lib/qr/request";
import { ScanResourceBudget } from "../../lib/qr/safe-request";
import { storageCapacityReason } from "../../lib/qr/storage-quota";

test("scan resource budget enforces aggregate bytes and in-flight concurrency", async () => {
  const byteBudget = new ScanResourceBudget(10, 1);
  byteBudget.consume(6);
  assert.throws(() => byteBudget.consume(5), /aggregate response budget/i);

  const budget = new ScanResourceBudget(100, 1);
  const releaseFirst = await budget.acquire();
  let admittedSecond = false;
  const second = budget.acquire().then((release) => { admittedSecond = true; return release; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(admittedSecond, false);
  releaseFirst();
  const releaseSecond = await second;
  assert.equal(admittedSecond, true);
  releaseSecond();
});

test("JSON body reader stops a stalled upload on its own deadline", async () => {
  const body = new ReadableStream<Uint8Array>({ start() { /* intentionally never closes */ } });
  const request = new Request("http://localhost/api/scans", { method: "POST", body, duplex: "half" } as RequestInit & { duplex: "half" });
  await assert.rejects(() => readJsonBody(request, 4_096, 20), (error: unknown) => error instanceof RequestBodyError && /timed out/i.test(error.message));
});

test("persistent store quota reserves room before accepting another scan", () => {
  assert.equal(storageCapacityReason({ scanCount: 9, storedBytes: 100 }, { maxStoredScans: 10, maxStoredBytes: 1_000, reservationBytes: 100 }), null);
  assert.match(storageCapacityReason({ scanCount: 10, storedBytes: 100 }, { maxStoredScans: 10, maxStoredBytes: 1_000, reservationBytes: 100 }) ?? "", /scan-count limit/i);
  assert.match(storageCapacityReason({ scanCount: 1, storedBytes: 950 }, { maxStoredScans: 10, maxStoredBytes: 1_000, reservationBytes: 100 }) ?? "", /storage limit/i);
});
