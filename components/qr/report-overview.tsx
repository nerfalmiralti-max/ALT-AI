"use client";

import Link from "next/link";
import { useState } from "react";

import type { IssueCategory, ScanRecord } from "@/lib/qr/types";
import { VerificationMark } from "./verification-mark";
import type { ComparisonTarget, ReportPayload } from "./report-model";
import { displayHost, issueAnchorId, pathLabel, signed } from "./report-model";

export const REPORT_LINKS = [
  ["overview", "Overview"],
  ["priority", "Fix first"],
  ["changed", "Changes"],
  ["issues", "Issues"],
  ["pages", "Pages"],
  ["performance", "Performance"],
  ["visual", "Visual"],
  ["history", "History"],
] as const;

function releaseState(scan: ScanRecord) {
  if (scan.verdict === "READY TO SHIP") return "verified" as const;
  if (scan.verdict === "BLOCKED") return "blocked" as const;
  return "partial" as const;
}

export function ReportNavigation() {
  return <nav className="report-nav" aria-label="Report sections">{REPORT_LINKS.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}</nav>;
}

export function ReleaseBrief({ payload }: { payload: ReportPayload }) {
  const { scan } = payload;
  const activeGroups = scan.issueGroups.filter((group) => group.lifecycle !== "IGNORED");
  const critical = activeGroups.filter((group) => group.severity === "CRITICAL").length;
  const warning = activeGroups.filter((group) => group.severity === "WARNING").length;
  const notice = activeGroups.filter((group) => group.severity === "NOTICE").length;
  const delta = scan.comparisons.previous;
  const failedChecks = scan.releaseGate?.checks.filter((check) => !check.passed) ?? [];
  return (
    <section className="release-brief" id="overview" aria-labelledby="release-heading">
      <div className="release-brief__title">
        <div className="status-line"><VerificationMark state={releaseState(scan)} /><span>{scan.verdict ?? "Needs attention"}</span></div>
        <p className="technical-label">{displayHost(scan.normalizedUrl)}</p>
        <h1 id="release-heading">{scan.releaseGate?.status === "FAIL" ? `${failedChecks.length} configured release-gate check${failedChecks.length === 1 ? " is" : "s are"} failing.` : scan.verdict === "READY TO SHIP" ? "This release is ready to ship." : "Review the measured warnings before launch."}</h1>
        <p>{scan.coverage.inspectedPages} pages checked in {Math.max(1, Math.round(scan.timings.totalMs / 1_000))}s. {delta ? `${delta.issues.fixedCount} fixed and ${delta.issues.newCount} new since the previous scan.` : "This is the first completed reading for this site."}</p>
      </div>

      <div className="release-brief__readings" aria-label="Release status readings">
        <div className="score-reading"><span>Quality score</span><strong>{scan.score?.overall ?? "—"}</strong><small>/ 100</small>{delta ? <b data-positive={delta.scoreDelta >= 0}>{signed(delta.scoreDelta)} since previous</b> : <b>First scan</b>}</div>
        <div className="gate-reading" data-gate={scan.releaseGate?.status ?? "UNKNOWN"}><span>Release gate</span><strong>{scan.releaseGate?.status ?? "NOT SET"}</strong><small>{!scan.releaseGate ? "Gate result was not recorded for this legacy scan" : failedChecks[0] ? `${failedChecks[0].label}: ${failedChecks[0].actual} / ${failedChecks[0].expected}` : "All configured checks passed"}</small></div>
      </div>

      <div className="release-counts">
        <div data-tone="critical"><strong>{critical}</strong><span>Critical</span></div>
        <div data-tone="warning"><strong>{warning}</strong><span>Warnings</span></div>
        <div><strong>{notice}</strong><span>Notices</span></div>
        <div><strong>{scan.coverage.inspectedPages}</strong><span>Pages</span></div>
        <div data-tone="success"><strong>{delta?.issues.fixedCount ?? 0}</strong><span>Fixed</span></div>
        <div><strong>{delta?.issues.regressionCount ?? 0}</strong><span>Regressions</span></div>
      </div>

      {failedChecks.length ? <div className="gate-reasons"><span>Why the gate failed</span><ul>{failedChecks.map((check) => <li key={check.id}><b>{check.label}</b><small>{check.actual} / {check.expected}</small></li>)}</ul></div> : null}
    </section>
  );
}

function categoryTone(score: number) {
  if (score >= 90) return "good";
  if (score >= 70) return "warning";
  return "critical";
}

export function CategoryHealth({ scan, selected, onSelect }: { scan: ScanRecord; selected: IssueCategory | "all"; onSelect: (category: IssueCategory | "all") => void }) {
  return (
    <section className="category-health" aria-labelledby="category-heading">
      <div className="compact-heading"><div><span>Category health</span><h2 id="category-heading">Where quality is weakest</h2></div><button type="button" onClick={() => onSelect("all")} aria-pressed={selected === "all"}>All issues</button></div>
      <div className="category-matrix">
        {scan.score?.categories.map((category) => (
          <button type="button" key={category.category} data-tone={categoryTone(category.score)} aria-pressed={selected === category.category} onClick={() => onSelect(category.category)}>
            <span>{category.category}</span><strong>{category.score}</strong><i><b style={{ transform: `scaleX(${category.score / 100})` }} /></i><small>{category.issueCount} issue{category.issueCount === 1 ? "" : "s"}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function FixFirst({ scan }: { scan: ScanRecord }) {
  return (
    <section className="fix-first" id="priority" aria-labelledby="priority-heading">
      <div className="compact-heading"><div><span>Priority</span><h2 id="priority-heading">Fix these first</h2></div><a href="#issues">View all issues</a></div>
      {scan.fixQueue.length ? <ol>{scan.fixQueue.slice(0, 5).map((item) => { const anchor = issueAnchorId(item.ruleId, item.scope, item.title); return <li key={`${item.rank}-${item.ruleId}-${item.title}`}>
        <span>{String(item.rank).padStart(2, "0")}</span>
        <div><b>{item.title}</b><small>{item.severity} · {item.affectedPages} page{item.affectedPages === 1 ? "" : "s"}</small></div>
        <strong>{item.gateBlocker ? "Blocks gate" : `−${item.scoreImpact} max`}</strong>
        <a href={`#${anchor}`} aria-label={`Open evidence for ${item.title}`} onClick={() => window.requestAnimationFrame(() => { const details = document.getElementById(anchor) as HTMLDetailsElement | null; if (details) details.open = true; })}>Evidence</a>
      </li>; })}</ol> : <p className="empty-state">No priority fixes. Review notices and release gate configuration.</p>}
    </section>
  );
}

export function WhatChanged({ scan }: { scan: ScanRecord }) {
  const [target, setTarget] = useState<ComparisonTarget>(scan.comparisons.baseline ? "baseline" : "previous");
  const delta = scan.comparisons[target];
  const meaningful = delta?.issues.items.filter((item) => item.status !== "UNCHANGED") ?? [];
  return (
    <section className="what-changed report-section" id="changed" aria-labelledby="changed-heading">
      <div className="section-heading"><div><span>Comparison</span><h2 id="changed-heading">What changed</h2></div><div className="segmented-control" role="group" aria-label="Comparison target"><button type="button" aria-pressed={target === "previous"} disabled={!scan.comparisons.previous} onClick={() => setTarget("previous")}>Previous</button><button type="button" aria-pressed={target === "baseline"} disabled={!scan.comparisons.baseline} onClick={() => setTarget("baseline")}>Baseline</button></div></div>
      {delta ? <>
        <div className="change-summary">
          <div><span>Score</span><strong>{signed(delta.scoreDelta)}</strong></div>
          <div data-tone="success"><span>Fixed</span><strong>{delta.issues.fixedCount}</strong></div>
          <div data-tone="critical"><span>New</span><strong>{delta.issues.newCount}</strong></div>
          <div data-tone="critical"><span>Regressions</span><strong>{delta.issues.regressionCount}</strong></div>
          <div><span>Visual change</span><strong>{delta.visualDifference === undefined ? "—" : `${delta.visualDifference}%`}</strong></div>
        </div>
        <p className="comparison-id">Scan {delta.baseScanId.slice(0, 8)} → {delta.currentScanId.slice(0, 8)}</p>
        <div className="change-list">{meaningful.slice(0, 8).map((item) => { const finding = item.current ?? item.previous; return <div key={`${item.status}-${item.fingerprint}`} data-delta={item.status}><span>{item.status}</span><b>{finding?.title}</b><small>{finding ? pathLabel(finding.evidence.url) : ""}</small></div>; })}</div>
        {delta.performance.length ? <div className="performance-movement"><span>Performance movement</span>{delta.performance.map((metric) => <div key={metric.key}><b>{metric.key}</b><small>{metric.previous.toFixed(metric.key === "cls" ? 3 : 0)} → {metric.current.toFixed(metric.key === "cls" ? 3 : 0)}</small><strong data-improved={metric.improved}>{signed(metric.delta)}</strong></div>)}</div> : null}
        <Link className="inline-action" href={`/scan/${scan.id}/compare?against=${target}`}>Open comparison workspace</Link>
      </> : <p className="empty-state">No reference scan yet. Set a baseline or run this site again to unlock comparison.</p>}
    </section>
  );
}
