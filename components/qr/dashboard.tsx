import Link from "next/link";

import { summarizeProjectRelease, type ReleaseState } from "@/lib/qr/presentation";
import type { ChallengeRecord, ProjectRecord, ScanRecord } from "@/lib/qr/types";
import { ArrowIcon, ChallengeIcon, CompareIcon, ScanIcon, SettingsIcon } from "./icons";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const STATE_ORDER: ReleaseState[] = ["blocked", "attention", "failed", "scanning", "ready", "unscanned"];

function displayHost(value: string) {
  try { return new URL(value).hostname; } catch { return value; }
}

export function Dashboard({ projects, scans, challenges }: { projects: ProjectRecord[]; scans: ScanRecord[]; challenges: ChallengeRecord[] }) {
  const scanById = new Map(scans.map((scan) => [scan.id, scan]));
  const rows = projects.map((project) => ({ project, scan: project.latestScanId ? scanById.get(project.latestScanId) ?? null : null }))
    .map((entry) => ({ ...entry, summary: summarizeProjectRelease(entry.project, entry.scan) }))
    .sort((a, b) => STATE_ORDER.indexOf(a.summary.state) - STATE_ORDER.indexOf(b.summary.state) || b.summary.updatedAt.localeCompare(a.summary.updatedAt));
  const counts = rows.reduce<Record<ReleaseState, number>>((result, row) => ({ ...result, [row.summary.state]: result[row.summary.state] + 1 }), { ready: 0, attention: 0, blocked: 0, scanning: 0, failed: 0, unscanned: 0 });
  const decisionCount = counts.blocked + counts.attention + counts.failed;

  return (
    <main id="main-content" className="control-page dashboard-page">
      <header className="page-heading">
        <div><span className="eyebrow">Release portfolio</span><h1>Control room</h1><p>See which real projects can ship, which cannot, and the measured reason before opening a report.</p></div>
        <Link className="primary-action" href="/scan/new"><ScanIcon />New scan</Link>
      </header>

      <section className="decision-strip" aria-label="Portfolio release summary">
        <div data-state="ready"><span>Ready</span><strong>{counts.ready}</strong><small>gate passed</small></div>
        <div data-state="blocked"><span>Blocked</span><strong>{counts.blocked}</strong><small>gate failed</small></div>
        <div data-state="attention"><span>Needs review</span><strong>{counts.attention}</strong><small>measured warnings</small></div>
        <div data-state="scanning"><span>In progress</span><strong>{counts.scanning}</strong><small>evidence collecting</small></div>
        <div data-state="failed"><span>Incomplete</span><strong>{counts.failed + counts.unscanned}</strong><small>missing release evidence</small></div>
      </section>

      <section className="control-section" aria-labelledby="projects-heading">
        <div className="section-bar"><div><span className="eyebrow">Projects</span><h2 id="projects-heading">Release state by project</h2></div><p>{rows.length ? `${decisionCount} ${decisionCount === 1 ? "project needs" : "projects need"} a decision or follow-up.` : "No project records yet."}</p></div>
        {rows.length ? <div className="project-table">{rows.map(({ project, scan, summary }) => (
          <article className="project-row" data-state={summary.state} key={project.id}>
            <div className="state-rail" aria-hidden="true" />
            <div className="project-identity"><span>{project.name}</span><code>{project.origin}</code></div>
            <div className="release-reading"><span className="state-label" data-state={summary.state}>{summary.label}</span><p>{summary.reason}</p></div>
            <div className="score-cell"><span>Score</span><strong>{summary.score ?? "—"}</strong></div>
            <time dateTime={summary.updatedAt}>{formatDate(summary.updatedAt)}</time>
            <div className="row-actions">
              <Link href={`/projects/${project.id}`} aria-label={`Open ${project.name} project`}><ArrowIcon />Overview</Link>
              {scan?.comparisons.previous || scan?.comparisons.baseline ? <Link href={`/scan/${scan.id}/compare`}><CompareIcon />Compare</Link> : null}
              <Link href={`/projects/${project.id}/settings`}><SettingsIcon />Gate</Link>
            </div>
          </article>
        ))}</div> : <div className="control-empty"><ScanIcon /><h2>No release data yet</h2><p>Run the first scan to create a project and establish a measured release state.</p><Link className="primary-action" href="/scan/new">Start first scan</Link></div>}
      </section>

      <section className="control-section challenge-dashboard-section" aria-labelledby="recent-challenges-heading">
        <div className="section-bar"><div><span className="eyebrow">Beat Your Stack</span><h2 id="recent-challenges-heading">Recent challenges</h2></div><Link className="secondary-action" href="/challenge"><ChallengeIcon />Run challenge</Link></div>
        {challenges.length ? <div className="challenge-dashboard-list">{challenges.map((challenge) => {
          const run = challenge.runs.at(-1);
          const count = run?.comparison?.qualifyingRegressionCount ?? 0;
          return <Link href={`/challenge/${challenge.id}`} key={challenge.id}><div><strong>{displayHost(challenge.productionUrl)}</strong><code>{displayHost(challenge.candidateUrl)}</code></div><span>{challenge.existingQaVerdict === "PASSED" ? "QA PASS" : `QA ${challenge.existingQaVerdict}`}</span><b data-verdict={run?.verdict}>{run?.verdict?.replaceAll("_", " ") ?? run?.progress.stage.replaceAll("_", " ") ?? "NOT STARTED"}</b><small>{count} confirmed · {run?.swarm?.finalVerdict ?? "Phase 1"}</small><time dateTime={challenge.updatedAt}>{formatDate(challenge.updatedAt)}</time><ArrowIcon /></Link>;
        })}</div> : <div className="challenge-dashboard-empty"><div><ChallengeIcon /><strong>No challenge history yet</strong><p>Compare a candidate release with production and verify candidate-only regressions.</p></div><Link href="/challenge">Open Beat Your Stack<ArrowIcon /></Link></div>}
      </section>
    </main>
  );
}
