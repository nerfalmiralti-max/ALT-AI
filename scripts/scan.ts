async function main() {
  const target = process.argv[2];
  if (!target) throw new Error("Usage: npm run scan -- https://example.com");
  const [{ assertSafeTarget }, { createScan }, { isCrawlableUrl, normalizeTargetInput, normalizeUrl }, { runScanAndWait }] = await Promise.all([
    import("../lib/qr/security"), import("../lib/qr/store"), import("../lib/qr/url"), import("../lib/qr/worker"),
  ]);
  const normalizedInput = normalizeTargetInput(target);
  const safe = await assertSafeTarget(normalizedInput);
  const normalized = normalizeUrl(safe.toString());
  if (!isCrawlableUrl(normalized, new URL(normalized).origin)) throw new Error("Executable, download, and destructive-action URLs cannot be scan targets.");
  const scan = await createScan(target, normalized);
  console.log(`ALT QR scan ${scan.id} queued for ${scan.normalizedUrl}`);
  const report = await runScanAndWait(scan.id);
  if (report.progress.stage === "FAILED") throw new Error(`${report.failure?.code}: ${report.failure?.message}`);
  console.log(JSON.stringify({ id: report.id, pages: report.pages.length, issues: report.issues.length, score: report.score, lighthouse: report.lighthouse.available }, null, 2));
}

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
