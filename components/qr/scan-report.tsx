"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { IssueCategory, ProjectRecord, ScanIssue, ScanRecord } from "@/lib/qr/types";
import { CompareIcon, SettingsIcon } from "./icons";
import { ScanForm } from "./scan-form";
import { ScanProgress } from "./scan-progress";
import { displayHost, type ReportPayload } from "./report-model";
import { CategoryHealth, FixFirst, ReleaseBrief, ReportNavigation, WhatChanged } from "./report-overview";
import { IssueLedger, PageExplorer, RuntimeAndPerformance, ScanHistory } from "./report-sections";
import { VerificationMark } from "./verification-mark";
import { VisualInspector } from "./visual-inspector";

export function ScanReport({ scanId }: { scanId: string }) {
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [category, setCategory] = useState<IssueCategory | "all">("all");

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function read() {
      try {
        const response = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
        const body = (await response.json()) as ReportPayload & { error?: string };
        if (!response.ok) throw new Error(body.error || "Scan not found.");
        if (disposed) return;
        setPayload(body);
        if (!["COMPLETE", "FAILED", "CANCELLED"].includes(body.scan.progress.stage)) timer = setTimeout(read, 850);
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : "Scan could not be loaded.");
      }
    }
    void read();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [scanId]);

  async function cancel() {
    setCancelling(true);
    try {
      const response = await fetch(`/api/scans/${scanId}`, { method: "DELETE" });
      const body = await response.json() as { scan?: ScanRecord; error?: string };
      if (!response.ok || !body.scan) throw new Error(body.error || "Scan could not be cancelled.");
      setPayload((current) => current ? { ...current, scan: body.scan! } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Scan could not be cancelled."); }
    finally { setCancelling(false); }
  }

  async function setBaseline(enabled: boolean) {
    if (!payload) return;
    setActionMessage("");
    try {
      const response = await fetch(`/api/scans/${scanId}/baseline`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
      const body = await response.json() as { project?: ProjectRecord; error?: string; syncWarning?: string };
      if (!response.ok || !body.project) throw new Error(body.error || "Baseline could not be updated.");
      setPayload({ ...payload, project: body.project, baseline: enabled ? { id: payload.scan.id, screenshots: payload.scan.screenshots, score: payload.scan.score, verdict: payload.scan.verdict, completedAt: payload.scan.completedAt } : null });
      setActionMessage(body.syncWarning ?? (enabled ? "This scan is now the project baseline." : "Project baseline cleared."));
    } catch (reason) { setActionMessage(reason instanceof Error ? reason.message : "Baseline could not be updated."); }
  }

  async function toggleIgnore(issue: ScanIssue) {
    if (!payload) return;
    try {
      const response = await fetch(`/api/scans/${scanId}/issues/${issue.fingerprint}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ignored: issue.lifecycle !== "IGNORED" }) });
      const body = await response.json() as { scan?: ScanRecord; error?: string; syncWarning?: string };
      if (!response.ok || !body.scan) throw new Error(body.error || "Finding lifecycle could not be updated.");
      setPayload({ ...payload, scan: body.scan });
      setActionMessage(body.syncWarning ?? (issue.lifecycle === "IGNORED" ? "Finding restored." : "Finding ignored for this project."));
    } catch (reason) { setActionMessage(reason instanceof Error ? reason.message : "Finding lifecycle could not be updated."); }
  }

  function selectCategory(next: IssueCategory | "all", moveToIssues = false) {
    setCategory(next);
    if (moveToIssues) window.requestAnimationFrame(() => document.getElementById("issues")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const completed = payload?.scan.progress.stage === "COMPLETE";
  const isBaseline = payload?.project.baselineScanId === payload?.scan.id;
  const canCompare = Boolean(payload?.scan.comparisons.previous || payload?.scan.comparisons.baseline);

  return (
    <main id="main-content" className="control-page report-shell">
      {actionMessage ? <p className="action-message" role="status">{actionMessage}</p> : null}
      {error ? <section className="load-error" role="alert"><VerificationMark state="blocked" /><h1>{error}</h1><Link href="/scan/new">Return to scanner</Link></section> : null}
      {!payload && !error ? <div className="report-loading"><VerificationMark state="scanning" /><span>Loading scan record…</span></div> : null}

      <div id="report-main">{payload ? !completed ? <ScanProgress scan={payload.scan} onCancel={() => void cancel()} cancelling={cancelling} /> : <>
        <div className="report-context">
          <div><span>Project / scan</span><Link href={`/projects/${payload.project.id}`}><strong>{displayHost(payload.scan.normalizedUrl)}</strong></Link><small>{payload.scan.id.slice(0, 8)}</small></div>
          <time dateTime={payload.scan.completedAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(payload.scan.completedAt!))}</time>
          <div className="report-actions">
            <ScanForm buttonOnly initialUrl={payload.scan.normalizedUrl} />
            {canCompare ? <Link href={`/scan/${scanId}/compare`}><CompareIcon />Compare</Link> : null}
            <a href={`/api/scans/${scanId}/receipt`} download>Export</a>
            <button type="button" onClick={() => void setBaseline(!isBaseline)}>{isBaseline ? "Clear baseline" : "Set baseline"}</button>
            <Link href={`/projects/${payload.project.id}/settings`}><SettingsIcon />Gate</Link>
            <button type="button" onClick={() => window.print()}>Print</button>
          </div>
        </div>
        <div className="report-workspace">
          <ReportNavigation />
          <div className="report-canvas">
            <ReleaseBrief payload={payload} />
            <div className="overview-panels"><FixFirst scan={payload.scan} /><CategoryHealth scan={payload.scan} selected={category} onSelect={(next) => selectCategory(next, true)} /></div>
            <WhatChanged scan={payload.scan} />
            <IssueLedger scan={payload.scan} category={category} onCategoryChange={selectCategory} onToggleIgnore={toggleIgnore} />
            <PageExplorer scan={payload.scan} />
            <RuntimeAndPerformance scan={payload.scan} />
            <VisualInspector payload={payload} />
            <ScanHistory payload={payload} />
          </div>
        </div>
      </> : null}</div>
    </main>
  );
}
