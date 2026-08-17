import Link from "next/link";

import type { ProjectRecord, ScanRecord } from "@/lib/qr/types";
import { ArrowIcon, ChallengeIcon, DashboardIcon, ScanIcon } from "./icons";
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
    <main id="main-content" className="control-page home-shell">
      <section className="home-primary" id="scan-main" aria-labelledby="home-heading">
        <div className="home-copy">
          <span className="product-label">Release control, backed by browser evidence</span>
          <h1 id="home-heading">Check a site before you ship.</h1>
          <p>ALT QR turns real browser evidence into a release decision, a prioritized fix queue, and a comparison you can verify.</p>
        </div>
        <ScanForm recentUrls={recentUrls} />
        <div className="home-actions"><Link className="secondary-action" href="/dashboard"><DashboardIcon />Open control room</Link><Link className="secondary-action" href="/challenge"><ChallengeIcon />Beat your stack</Link><Link className="text-action" href="/scan/new">Dedicated scan view<ArrowIcon /></Link></div>
        <div className="scan-assurances" aria-label="Scan behavior"><span><b>01</b> Same-origin crawl</span><span><b>02</b> Desktop & mobile</span><span><b>03</b> Traceable release gate</span></div>
      </section>

      <section className="method-strip" aria-label="ALT QR workflow"><div><ScanIcon /><span>Collect</span><p>Bounded page, runtime, accessibility, performance, and visual evidence.</p></div><div><span className="method-index">02</span><span>Decide</span><p>Evaluate the project’s stored release-gate configuration.</p></div><div><span className="method-index">03</span><span>Act</span><p>Fix measured blockers, rescan, and compare against previous or baseline evidence.</p></div></section>

      <section className="recent-scans" aria-labelledby="recent-heading">
        <div className="section-heading"><div><span>Real project data</span><h2 id="recent-heading">Recent release checks</h2><p>Open a stored report or move into the project control room.</p></div><Link className="text-action" href="/dashboard">View all projects<ArrowIcon /></Link></div>
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
    </main>
  );
}
