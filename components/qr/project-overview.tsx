import Link from "next/link";

import { summarizeProjectRelease } from "@/lib/qr/presentation";
import type { ProjectRecord, ScanRecord } from "@/lib/qr/types";
import { ArrowIcon, CompareIcon, ScanIcon, SettingsIcon } from "./icons";
import { issueAnchorId, signed } from "./report-model";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ProjectOverview({ project, scans }: { project: ProjectRecord; scans: ScanRecord[] }) {
  const latest = scans.find((scan) => scan.id === project.latestScanId) ?? scans[0] ?? null;
  const summary = summarizeProjectRelease(project, latest);
  const delta = latest?.comparisons.previous;
  const failedChecks = latest?.releaseGate?.checks.filter((check) => !check.passed) ?? [];
  const activeQueue = latest?.fixQueue.slice(0, 5) ?? [];

  return (
    <main id="main-content" className="control-page project-page">
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/dashboard">Dashboard</Link><span>/</span><span aria-current="page">{project.name}</span></nav>
      <header className="page-heading project-heading">
        <div><span className="eyebrow">Project overview</span><h1>{project.name}</h1><a href={project.origin} target="_blank" rel="noreferrer">{project.origin}</a></div>
        <div className="heading-actions"><Link className="secondary-action" href={`/projects/${project.id}/settings`}><SettingsIcon />Release gate</Link><Link className="primary-action" href={`/scan/new?url=${encodeURIComponent(project.origin)}`}><ScanIcon />New scan</Link></div>
      </header>

      <section className="project-decision" data-state={summary.state} aria-labelledby="release-state-heading">
        <div className="state-rail" aria-hidden="true" />
        <div className="project-decision__copy"><span className="state-label" data-state={summary.state}>{summary.label}</span><h2 id="release-state-heading">{summary.reason}</h2><p>{latest ? `Latest scan ${latest.id.slice(0, 8)} · ${formatDate(summary.updatedAt)}` : "No scan record is available for this project."}</p></div>
        <div className="decision-metric"><span>Quality score</span><strong>{summary.score ?? "—"}</strong><small>{latest?.score?.status ?? "No score"}</small></div>
        <div className="decision-metric"><span>Release gate</span><strong>{latest?.releaseGate?.status ?? "—"}</strong><small>{failedChecks.length ? `${failedChecks.length} failed ${failedChecks.length === 1 ? "check" : "checks"}` : latest?.releaseGate ? "Configured checks" : latest ? "Result not recorded" : "Awaiting scan"}</small></div>
        {latest ? <div className="decision-actions"><Link className="primary-action" href={`/scan/${latest.id}`}><ArrowIcon />Open report</Link>{delta ? <Link className="secondary-action" href={`/scan/${latest.id}/compare`}><CompareIcon />Compare changes</Link> : null}</div> : null}
      </section>

      {latest ? <div className="project-grid">
        <section className="control-panel" aria-labelledby="attention-heading">
          <div className="panel-heading"><div><span className="eyebrow">Priority</span><h2 id="attention-heading">What needs attention</h2></div><span>{activeQueue.length}</span></div>
          {activeQueue.length ? <ol className="priority-list">{activeQueue.map((item) => <li key={`${item.ruleId}-${item.title}`}><span>{String(item.rank).padStart(2, "0")}</span><div><strong>{item.title}</strong><small>{item.affectedPages} affected {item.affectedPages === 1 ? "page" : "pages"} · {item.severity.toLowerCase()}</small></div><Link href={`/scan/${latest.id}#${issueAnchorId(item.ruleId, item.scope, item.title)}`}>Evidence<ArrowIcon /></Link></li>)}</ol> : <div className="panel-empty"><p>No active priority items are recorded for the latest scan.</p></div>}
        </section>

        <section className="control-panel" aria-labelledby="change-heading">
          <div className="panel-heading"><div><span className="eyebrow">Since previous scan</span><h2 id="change-heading">What changed</h2></div>{delta ? <strong className="score-delta" data-direction={delta.scoreDelta >= 0 ? "up" : "down"}>{signed(delta.scoreDelta)} score</strong> : null}</div>
          {delta ? <div className="change-readings"><div><span>Fixed</span><strong>{delta.issues.fixedCount}</strong></div><div><span>New</span><strong>{delta.issues.newCount}</strong></div><div><span>Regressions</span><strong>{delta.issues.regressionCount}</strong></div><div><span>Changed</span><strong>{delta.issues.changedCount}</strong></div></div> : <div className="panel-empty"><p>A second completed scan is required before ALT QR can measure change.</p></div>}
          {delta ? <Link className="inline-action" href={`/scan/${latest.id}/compare`}>Open full comparison<ArrowIcon /></Link> : null}
        </section>
      </div> : <div className="control-empty"><ScanIcon /><h2>Establish the first release state</h2><p>This project has no readable scan record. Start a scan to create evidence.</p><Link className="primary-action" href={`/scan/new?url=${encodeURIComponent(project.origin)}`}>Start scan</Link></div>}

      <section className="control-section" aria-labelledby="history-heading">
        <div className="section-bar"><div><span className="eyebrow">History</span><h2 id="history-heading">Project scans</h2></div><p>{project.scanIds.length > scans.length ? `Latest ${scans.length} of ${project.scanIds.length} stored scans` : `${scans.length} stored ${scans.length === 1 ? "scan" : "scans"}`}</p></div>
        {scans.length ? <div className="history-table">{scans.map((scan) => <Link href={`/scan/${scan.id}`} key={scan.id} aria-current={scan.id === latest?.id ? "page" : undefined}><code>{scan.id.slice(0, 8)}</code><span>{scan.progress.stage === "COMPLETE" ? scan.verdict ?? scan.score?.status ?? "Complete" : scan.progress.stage}</span><strong>{scan.score?.overall ?? "—"}</strong><small>{typeof scan.comparisons.previous?.scoreDelta === "number" ? signed(scan.comparisons.previous.scoreDelta) : "First"}</small><time dateTime={scan.completedAt ?? scan.createdAt}>{formatDate(scan.completedAt ?? scan.createdAt)}</time><ArrowIcon /></Link>)}</div> : null}
      </section>
    </main>
  );
}
