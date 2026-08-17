import type { ScanRecord } from "@/lib/qr/types";
import { ScanForm } from "./scan-form";

export function NewScan({ scans, initialUrl = "" }: { scans: ScanRecord[]; initialUrl?: string }) {
  const recentUrls = [...new Set(scans.map((scan) => scan.normalizedUrl))].slice(0, 8);
  return (
    <main id="main-content" className="control-page new-scan-page">
      <div className="scan-entry">
        <div className="scan-entry__copy"><span className="eyebrow">New release check</span><h1>Inspect a website before it ships.</h1><p>ALT QR collects bounded same-origin browser evidence, evaluates the configured release gate, and creates a report you can compare and act on.</p></div>
        <div className="scan-entry__panel"><ScanForm recentUrls={recentUrls} initialUrl={initialUrl} /><dl><div><dt>Coverage</dt><dd>Up to 10 same-origin pages</dd></div><div><dt>Views</dt><dd>Desktop and mobile evidence</dd></div><div><dt>Decision</dt><dd>Configured deterministic gate</dd></div></dl></div>
      </div>
    </main>
  );
}
