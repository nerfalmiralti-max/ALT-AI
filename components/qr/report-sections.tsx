"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ISSUE_CATEGORIES, type ConsoleEvent, type IssueCategory, type IssueDeltaStatus, type IssueLifecycle, type IssueSeverity, type NetworkFailure, type ProjectRecord, type ScanIssue, type ScanRecord } from "@/lib/qr/types";
import type { ReportPayload } from "./report-model";
import { assetUrl, cleanEvidenceText, formatDuration, formatMetric, issueAnchorId, issueEvidenceLines, pathLabel } from "./report-model";
import { VerificationMark } from "./verification-mark";

const SEVERITIES: (IssueSeverity | "ALL")[] = ["ALL", "CRITICAL", "WARNING", "NOTICE"];

function deltaLabel(scan: ScanRecord, fingerprint: string) {
  return scan.comparisons.previous?.issues.items.find((item) => item.fingerprint === fingerprint)?.status;
}

function captureForIssue(scan: ScanRecord, issue: ScanIssue) {
  return scan.screenshots.find((asset) => asset.viewport === "desktop" && issue.affectedPageIds.includes(asset.pageId));
}

export function IssueLedger({ scan, category, onCategoryChange, onToggleIgnore }: { scan: ScanRecord; category: IssueCategory | "all"; onCategoryChange: (category: IssueCategory | "all") => void; onToggleIgnore: (issue: ScanIssue) => Promise<void> }) {
  const [severity, setSeverity] = useState<IssueSeverity | "ALL">("ALL");
  const [view, setView] = useState<IssueLifecycle | IssueDeltaStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [updating, setUpdating] = useState("");
  const deltaByFingerprint = useMemo(() => new Map(scan.comparisons.previous?.issues.items.map((item) => [item.fingerprint, item.status]) ?? []), [scan.comparisons.previous]);
  const categories = ISSUE_CATEGORIES;
  const pageUrlById = useMemo(() => new Map(scan.pages.map((page) => [page.id, page.url])), [scan.pages]);
  const filtered = useMemo(() => scan.issueGroups.filter((group) => {
    const findings = scan.issues.filter((issue) => group.fingerprints.includes(issue.fingerprint));
    if (category !== "all" && !findings.some((issue) => issue.category === category)) return false;
    if (severity !== "ALL" && group.severity !== severity) return false;
    if ((view === "ACTIVE" || view === "IGNORED") && group.lifecycle !== view) return false;
    if (view !== "ALL" && view !== "ACTIVE" && view !== "IGNORED" && !findings.some((issue) => deltaByFingerprint.get(issue.fingerprint) === view)) return false;
    const search = query.trim().toLowerCase();
    if (search && !findings.some((issue) => [issue.title, issue.description, issue.ruleId, issue.evidence.url, issue.evidence.selector, issue.evidence.consoleMessage, issue.evidence.requestUrl].some((value) => String(value ?? "").toLowerCase().includes(search)))) return false;
    return true;
  }), [scan.issueGroups, scan.issues, category, severity, view, query, deltaByFingerprint]);

  async function toggle(issue: ScanIssue) {
    setUpdating(issue.fingerprint);
    try { await onToggleIgnore(issue); } finally { setUpdating(""); }
  }

  return (
    <section className="issue-ledger report-section" id="issues" aria-labelledby="issues-heading">
      <div className="section-heading"><div><span>Evidence</span><h2 id="issues-heading">Issue ledger</h2><p>{filtered.length} grouped finding{filtered.length === 1 ? "" : "s"}</p></div></div>
      <div className="issue-filters" aria-label="Filter issues">
        <label className="issue-search"><span>Search</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rule, page, or evidence" /></label>
        <div className="severity-filter" role="group" aria-label="Severity">{SEVERITIES.map((item) => <button key={item} type="button" aria-pressed={severity === item} onClick={() => setSeverity(item)}>{item === "ALL" ? "All severities" : item.toLowerCase()}</button>)}</div>
        <label><span>Category</span><select value={category} onChange={(event) => onCategoryChange(event.target.value as IssueCategory | "all")}><option value="all">All categories</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label><span>State</span><select value={view} onChange={(event) => setView(event.target.value as typeof view)}><option value="ALL">All states</option><option value="NEW">New</option><option value="REGRESSION">Regressions</option><option value="ACTIVE">Active</option><option value="IGNORED">Ignored</option></select></label>
      </div>

      <div className="issue-groups">
        {filtered.map((group) => {
          const findings = scan.issues.filter((issue) => group.fingerprints.includes(issue.fingerprint));
          const lead = findings[0];
          return <details className="issue-group" id={group.lifecycle === "IGNORED" ? undefined : issueAnchorId(group.ruleId, group.scope, group.title)} key={group.key}>
            <summary>
              <span className="severity-dot" data-severity={group.severity} aria-hidden="true" />
              <div><b>{group.title}</b><small>{lead?.category} · {group.affectedPages.length} page{group.affectedPages.length === 1 ? "" : "s"}</small></div>
              <span className="issue-impact">−{group.scoreImpact} max</span>
              <span className="issue-state">{findings.some((issue) => deltaLabel(scan, issue.fingerprint) === "REGRESSION") ? "Regression" : findings.some((issue) => deltaLabel(scan, issue.fingerprint) === "NEW") ? "New" : group.lifecycle === "IGNORED" ? "Ignored" : "Active"}</span>
              <span className="disclosure" aria-hidden="true" />
            </summary>
            <div className="issue-group__body">
              <div className="issue-explanation">
                <div><span>What failed</span><p>{group.title}</p></div>
                <div><span>Why it matters</span><p>{lead?.description}</p></div>
                <div><span>How ALT QR detected it</span><p>Deterministic rule <code>{group.ruleId}</code> evaluated captured {lead?.scope.toLowerCase()} evidence.</p></div>
                <div><span>Recommended fix</span><p>{lead?.recommendation}</p></div>
              </div>
              <div className="affected-pages"><span>Where</span><div>{group.affectedPages.map((pageId) => <a href={`#page-${pageId}`} key={pageId} onClick={() => window.requestAnimationFrame(() => { const details = document.getElementById(`page-${pageId}`) as HTMLDetailsElement | null; if (details) details.open = true; })}><code>{pathLabel(pageUrlById.get(pageId) ?? lead?.evidence.url ?? pageId)}</code></a>)}</div></div>
              <div className="occurrence-list"><span>Evidence by occurrence</span>{findings.map((issue) => {
                const capture = captureForIssue(scan, issue);
                return <details className="occurrence" key={issue.fingerprint}>
                  <summary><span>{pathLabel(issue.evidence.url)}</span><small>{deltaByFingerprint.get(issue.fingerprint) ?? issue.lifecycle}</small><b>{issue.occurrences}×</b></summary>
                  <div>
                    <dl>{issueEvidenceLines(issue).map(([label, value]) => <div key={label}><dt>{label}</dt><dd><code>{value}</code></dd></div>)}</dl>
                    <div className="occurrence-actions">{capture ? <a href={assetUrl(capture)} target="_blank" rel="noreferrer">Open screenshot</a> : <span>No screenshot for this page</span>}<button type="button" onClick={() => void toggle(issue)} disabled={updating === issue.fingerprint}>{updating === issue.fingerprint ? "Saving…" : issue.lifecycle === "IGNORED" ? "Restore finding" : "Ignore finding"}</button></div>
                  </div>
                </details>;
              })}</div>
            </div>
          </details>;
        })}
        {!filtered.length ? <p className="empty-state">No issue groups match these filters.</p> : null}
      </div>
    </section>
  );
}

export function PageExplorer({ scan }: { scan: ScanRecord }) {
  const pageById = new Map(scan.pages.map((page) => [page.id, page]));
  return (
    <section className="page-explorer report-section" id="pages" aria-labelledby="pages-heading">
      <div className="section-heading"><div><span>Page health</span><h2 id="pages-heading">Pages</h2><p>{scan.coverage.inspectedPages} of {scan.coverage.discoveredPages} discovered pages inspected</p></div></div>
      <div className="coverage-summary" aria-label="Scan coverage"><div><span>Verified</span><strong>{scan.coverage.inspectedPages - scan.coverage.failedPages - (scan.coverage.partialPages ?? 0)}</strong></div><div><span>Partial</span><strong>{scan.coverage.failedPages + (scan.coverage.partialPages ?? 0)}</strong></div><div><span>Skipped by limit</span><strong>{scan.coverage.skippedByLimit}</strong></div><div><span>Robots excluded</span><strong>{scan.coverage.robotsExcluded}</strong></div></div>
      <div className="page-list">{scan.pageHealth.map((health) => {
        const page = pageById.get(health.pageId);
        const issues = scan.issues.filter((issue) => issue.evidence.url === health.url || issue.affectedPageIds.includes(health.pageId));
        const capture = scan.screenshots.find((asset) => asset.pageId === health.pageId && asset.viewport === "desktop");
        return <details className="page-item" id={`page-${health.pageId}`} key={health.pageId}>
          <summary><VerificationMark state={health.status === "HEALTHY" ? "verified" : health.status === "BLOCKED" ? "blocked" : "partial"} label={health.status} /><div><b>{pathLabel(health.url)}</b><small>{health.url}</small></div><strong>{health.score}</strong><span data-status={health.status}>{health.status.toLowerCase()}</span><small>{health.blockers} blockers · {health.warnings} warnings</small><i className="disclosure" aria-hidden="true" /></summary>
          <div className="page-inspector">
            <section><h3>Page health</h3><dl><div><dt>HTTP</dt><dd>{page?.status || "—"}</dd></div><div><dt>Load</dt><dd>{formatDuration(page?.durationMs ?? 0)}</dd></div><div><dt>Network failures</dt><dd>{health.networkFailures}</dd></div><div><dt>Console events</dt><dd>{health.consoleFailures}</dd></div></dl></section>
            <section><h3>Issues</h3>{issues.length ? <ul>{issues.slice(0, 8).map((issue) => <li key={issue.fingerprint}><span data-severity={issue.severity}>{issue.severity}</span>{issue.title}</li>)}</ul> : <p>No page-specific issues.</p>}</section>
            <section><h3>Network & console</h3>{page?.networkFailures.length ? page.networkFailures.slice(0, 4).map((event) => <p key={`${event.url}-${event.reason}`}><code>{event.status ?? event.reason}</code> {pathLabel(event.url)}</p>) : <p>No failed requests.</p>}{page?.consoleEvents.length ? page.consoleEvents.slice(0, 4).map((event) => <p key={`${event.level}-${event.message}`}><code>{event.level}</code> {cleanEvidenceText(event.message)}</p>) : <p>No console warnings or errors.</p>}{page?.auditFailures.map((failure) => <p key={`${failure.system}-${failure.message}`}><code>{failure.system}</code> {cleanEvidenceText(failure.message)}</p>)}</section>
            <section><h3>Screenshot</h3>{capture ? <a className="page-capture" href={assetUrl(capture)} target="_blank" rel="noreferrer"><Image src={assetUrl(capture)} alt={`Desktop capture of ${pathLabel(health.url)}`} width={capture.width} height={capture.height} unoptimized /><span>Open full screenshot</span></a> : <p>No page capture recorded.</p>}</section>
          </div>
        </details>;
      })}</div>
    </section>
  );
}

export function RuntimeAndPerformance({ scan }: { scan: ScanRecord }) {
  const network = useMemo(() => {
    const items = new Map<string, NetworkFailure>();
    for (const page of scan.pages) for (const event of page.networkFailures ?? []) {
      const key = `${event.resourceType}|${event.url}|${event.reason}`;
      const existing = items.get(key);
      items.set(key, existing ? { ...existing, count: existing.count + event.count } : { ...event });
    }
    return [...items.values()].sort((a, b) => b.count - a.count);
  }, [scan.pages]);
  const consoleEvents = useMemo(() => {
    const items = new Map<string, ConsoleEvent>();
    for (const page of scan.pages) for (const event of page.consoleEvents ?? []) {
      const key = `${event.level}|${event.message}`;
      const existing = items.get(key);
      items.set(key, existing ? { ...existing, count: existing.count + event.count } : { ...event });
    }
    return [...items.values()].sort((a, b) => b.count - a.count);
  }, [scan.pages]);
  return (
    <section className="performance-section report-section" id="performance" aria-labelledby="performance-heading">
      <div className="section-heading"><div><span>Measured health</span><h2 id="performance-heading">Performance & runtime</h2><p>Only captured metrics and deduplicated failures are shown.</p></div></div>
      {scan.performance.length ? <div className="performance-grid">{scan.performance.map((reading) => <div key={reading.key} data-rating={reading.rating}><span>{reading.label}</span><strong>{formatMetric(reading.value, reading.unit)}</strong><b>{reading.rating.toLowerCase()}</b><small>Good ≤ {formatMetric(reading.goodThreshold, reading.unit)}</small></div>)}</div> : <p className="empty-state">No Lighthouse metrics were available for this scan.</p>}
      <div className="runtime-columns">
        <section><div><h3>Network</h3><span>{network.reduce((sum, item) => sum + item.count, 0)} failed requests</span></div>{network.slice(0, 8).map((item) => <div className="runtime-item" key={`${item.resourceType}-${item.url}-${item.reason}`}><code>{item.status ?? item.reason}</code><span>{pathLabel(item.url)}</span><small>{item.resourceType} · {item.count}×</small></div>)}{!network.length ? <p>No failed requests recorded.</p> : null}</section>
        <section><div><h3>Console health</h3><span>{consoleEvents.filter((item) => item.level === "error").reduce((sum, item) => sum + item.count, 0)} errors</span></div>{consoleEvents.slice(0, 8).map((item) => <div className="runtime-item" key={`${item.level}-${item.message}`}><code>{item.level}</code><span>{cleanEvidenceText(item.message)}</span><small>{item.count}×</small></div>)}{!consoleEvents.length ? <p>No console warnings or errors recorded.</p> : null}</section>
      </div>
      {scan.persistence && !scan.persistence.synchronized ? <p className="empty-state" role="status">{scan.persistence.warning ?? "Remote persistence is unavailable; this report remains stored locally."}</p> : null}
      <details className="diagnostics"><summary>Scanner diagnostics</summary><dl><div><dt>Total</dt><dd>{formatDuration(scan.timings.totalMs)}</dd></div><div><dt>Browser audit</dt><dd>{formatDuration(scan.timings.browserAuditMs)}</dd></div><div><dt>Lighthouse</dt><dd>{formatDuration(scan.timings.lighthouseMs)}</dd></div><div><dt>Rules</dt><dd>{formatDuration(scan.timings.rulesMs)}</dd></div><div><dt>Screenshots</dt><dd>{formatDuration(scan.timings.screenshotMs)}</dd></div></dl></details>
    </section>
  );
}

export function ScanHistory({ payload }: { payload: ReportPayload }) {
  return (
    <section className="scan-history report-section" id="history" aria-labelledby="history-heading">
      <div className="section-heading"><div><span>Project history</span><h2 id="history-heading">Scan timeline</h2><p>Select a reading to inspect it. Previous and baseline comparisons are computed automatically.</p></div></div>
      <ol>{payload.history.map((item, index) => {
        const current = item.id === payload.scan.id;
        const baseline = item.id === payload.project.baselineScanId;
        return <li key={item.id}><Link href={`/scan/${item.id}`} aria-current={current ? "page" : undefined}><span>Scan {String(payload.history.length - index).padStart(3, "0")}</span><strong>{item.score ?? "—"}</strong><div><b>{current ? "Current" : baseline ? "Baseline" : item.verdict ?? item.stage}</b><time dateTime={item.completedAt ?? item.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.completedAt ?? item.createdAt))}</time></div>{typeof item.scoreDelta === "number" ? <small>{item.scoreDelta > 0 ? "+" : ""}{item.scoreDelta}</small> : null}</Link></li>;
      })}</ol>
    </section>
  );
}

export function GateConfigEditor({ payload, onUpdated }: { payload: ReportPayload; onUpdated: (next: ReportPayload) => void }) {
  const [config, setConfig] = useState(payload.project.gateConfig);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setConfig(payload.project.gateConfig), [payload.project.gateConfig]);
  async function save() {
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/projects/${payload.project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...config, scanId: payload.scan.id }) });
      const body = await response.json() as { project?: ProjectRecord; scan?: ScanRecord; error?: string; syncWarning?: string };
      if (!response.ok || !body.project) throw new Error(body.error || "Gate could not be updated.");
      onUpdated({ ...payload, project: body.project, scan: body.scan?.id === payload.scan.id ? body.scan : payload.scan });
      setMessage(body.syncWarning ?? "Release gate updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gate could not be updated."); }
    finally { setSaving(false); }
  }
  return <details className="gate-config"><summary>Release gate settings</summary><div><label>Minimum score<input type="number" min="0" max="100" value={config.minimumScore} onChange={(event) => setConfig({ ...config, minimumScore: Number(event.target.value) })} /></label><label>Broken pages allowed<input type="number" min="0" max="25" value={config.maximumBrokenPages} onChange={(event) => setConfig({ ...config, maximumBrokenPages: Number(event.target.value) })} /></label><label>Broken links allowed<input type="number" min="0" max="100" value={config.maximumBrokenLinks} onChange={(event) => setConfig({ ...config, maximumBrokenLinks: Number(event.target.value) })} /></label><label className="check-line"><input type="checkbox" checked={config.failOnCritical} onChange={(event) => setConfig({ ...config, failOnCritical: event.target.checked })} />Fail on critical findings</label><button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save gate"}</button>{message ? <p role="status">{message}</p> : null}</div></details>;
}
