import Link from "next/link";

import type { ProjectRecord, ScanRecord } from "@/lib/qr/types";
import { BrandMark } from "./brand-mark";
import { ScanForm } from "./scan-form";
import { VerificationMark } from "./verification-mark";

function displayHost(url: string) {
  try { return new URL(url).hostname; } catch { return url; }
}

function scanState(scan: ScanRecord) {
  if (scan.progress.stage === "COMPLETE" && scan.verdict === "READY TO SHIP") return "verified" as const;
  if (scan.progress.stage === "COMPLETE" && scan.verdict !== "BLOCKED") return "partial" as const;
  if (scan.progress.stage === "FAILED" || scan.verdict === "BLOCKED") return "blocked" as const;
  return "scanning" as const;
}

export function Home({ scans, projects }: { scans: ScanRecord[]; projects: ProjectRecord[] }) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const recentUrls = [...new Set(scans.map((scan) => scan.normalizedUrl))].slice(0, 8);
  return (
    <main className="app-shell home-shell">
      <a className="skip-link" href="#scan-main">Skip to scanner</a>
      <header className="topbar"><BrandMark /><div className="topbar-status"><VerificationMark state="idle" /><span>Scanner ready</span></div></header>

      <section className="home-primary" id="scan-main" aria-labelledby="home-heading">
        <div className="home-copy">
          <span className="product-label">Deterministic website QA</span>
          <h1 id="home-heading">Check a site before you ship.</h1>
          <p>Scan page health, accessibility, search readiness, runtime failures, performance, and visual change—with evidence for every finding.</p>
        </div>
        <ScanForm recentUrls={recentUrls} />
        <div className="scan-assurances" aria-label="Scan behavior"><span><b>01</b> Same-origin crawl</span><span><b>02</b> Desktop & mobile</span><span><b>03</b> Traceable release gate</span></div>
      </section>

      <section className="recent-scans" aria-labelledby="recent-heading">
        <div className="section-heading"><div><span>Recent activity</span><h2 id="recent-heading">Recent scans</h2><p>Open a report, review its baseline, or scan the same site again.</p></div><strong>{scans.length}</strong></div>
        {scans.length ? <div className="recent-list">{scans.slice(0, 12).map((scan) => {
          const project = projectById.get(scan.projectId);
          const baseline = project?.baselineScanId === scan.id;
          const delta = scan.comparisons?.previous?.scoreDelta;
          return <Link href={`/scan/${scan.id}`} className="recent-item" key={scan.id}>
            <VerificationMark state={scanState(scan)} label={scan.verdict ?? scan.progress.stage} />
            <div><b>{displayHost(scan.normalizedUrl)}</b><small>{scan.normalizedUrl}</small></div>
            <span data-verdict={scan.verdict ?? scan.progress.stage}>{baseline ? "Baseline" : scan.verdict ?? scan.progress.stage}</span>
            <strong>{scan.score?.overall ?? "—"}</strong>
            <small>{typeof delta === "number" ? `${delta > 0 ? "+" : ""}${delta}` : "New"}</small>
            <time dateTime={scan.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(scan.createdAt))}</time>
          </Link>;
        })}</div> : <div className="empty-state"><VerificationMark state="idle" /><div><b>No scans yet</b><p>Enter a public website above to create the first quality report.</p></div></div>}
      </section>
      <footer className="footer"><span>ALT Quality Radar</span><span>Deterministic · Local-first record</span></footer>
    </main>
  );
}
