"use client";

import { useEffect, useMemo, useState } from "react";

import { SCAN_STAGES, type ScanRecord, type ScanStage } from "@/lib/qr/types";
import { ScanForm } from "./scan-form";
import { VerificationMark } from "./verification-mark";
import { displayHost, formatDuration, pathLabel } from "./report-model";

const ACTIVE_STAGES = SCAN_STAGES.filter((stage) => !["FAILED", "CANCELLED"].includes(stage));
const STAGE_LABELS: Partial<Record<ScanStage, string>> = {
  QUEUED: "Queued",
  DISCOVERING: "Discovering pages",
  INSPECTING: "Inspecting pages",
  AUDITING: "Accessibility & performance",
  CAPTURING: "Screenshots",
  COMPARING: "Visual comparison",
  SCORING: "Scoring & release gate",
  COMPLETE: "Report ready",
};

function lastActiveStage(scan: ScanRecord) {
  if (!(["FAILED", "CANCELLED"] as ScanStage[]).includes(scan.progress.stage)) return scan.progress.stage;
  return [...scan.stageHistory].reverse().find((entry) => ACTIVE_STAGES.includes(entry.stage))?.stage ?? "QUEUED";
}

export function ScanProgress({ scan, onCancel, cancelling }: { scan: ScanRecord; onCancel: () => void; cancelling: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const stopped = scan.progress.stage === "FAILED" || scan.progress.stage === "CANCELLED";
  const currentStage = lastActiveStage(scan);
  const activeIndex = Math.max(0, ACTIVE_STAGES.indexOf(currentStage));
  const elapsed = Math.max(0, now - new Date(scan.startedAt ?? scan.createdAt).getTime());
  const unitReading = scan.progress.totalUnits
    ? `${Math.min(scan.progress.completedUnits, scan.progress.totalUnits)} / ${scan.progress.totalUnits}`
    : scan.progress.completedUnits > 0 ? String(scan.progress.completedUnits) : "—";

  useEffect(() => {
    if (stopped) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [stopped]);

  const stageRows = useMemo(() => ACTIVE_STAGES.map((stage, index) => ({
    stage,
    state: index < activeIndex ? "complete" : index === activeIndex && !stopped ? "active" : stopped && index === activeIndex ? "stopped" : "pending",
  })), [activeIndex, stopped]);

  return (
    <section className="scan-progress" aria-labelledby="scan-progress-heading">
      <div className="scan-progress__header">
        <div className="scan-progress__identity">
          <VerificationMark state={stopped ? "partial" : "scanning"} />
          <div><span>Live scan</span><h1 id="scan-progress-heading">{stopped ? scan.progress.stage === "FAILED" ? "Scan failed" : "Scan cancelled" : `Scanning ${displayHost(scan.normalizedUrl)}`}</h1></div>
        </div>
        <a href={scan.normalizedUrl} target="_blank" rel="noreferrer">{scan.normalizedUrl}</a>
      </div>

      <div className="scan-progress__body">
        <div className="scan-progress__current" aria-live="polite">
          <span>Current stage</span>
          <strong>{stopped ? scan.progress.stage : STAGE_LABELS[scan.progress.stage] ?? scan.progress.stage}</strong>
          <p>{scan.progress.detail}</p>
          <dl>
            <div><dt>Progress</dt><dd>{unitReading}</dd></div>
            <div><dt>Elapsed</dt><dd>{formatDuration(stopped ? scan.timings.totalMs || elapsed : elapsed)}</dd></div>
            <div><dt>Current page</dt><dd>{scan.progress.currentUrl ? pathLabel(scan.progress.currentUrl) : "Waiting for page evidence"}</dd></div>
          </dl>
          {scan.progress.totalUnits ? <div className="scan-progress__bar" role="progressbar" aria-label="Scan work units" aria-valuemin={0} aria-valuemax={scan.progress.totalUnits} aria-valuenow={Math.min(scan.progress.completedUnits, scan.progress.totalUnits)}><i style={{ transform: `scaleX(${Math.min(1, scan.progress.completedUnits / scan.progress.totalUnits)})` }} /></div> : null}
          {scan.progress.stage === "FAILED" ? <p className="failure-line" role="alert">{scan.failure?.message}</p> : null}
          {!stopped ? <button className="button button--danger button--quiet" type="button" onClick={onCancel} disabled={cancelling}>{cancelling ? "Cancelling…" : "Cancel scan"}</button> : <ScanForm compact initialUrl={scan.normalizedUrl} />}
        </div>

        <ol className="scan-stages" aria-label="Scan stages">
          {stageRows.map(({ stage, state }) => (
            <li key={stage} data-state={state}>
              <VerificationMark state={state === "complete" ? "verified" : state === "active" ? "scanning" : state === "stopped" ? "partial" : "idle"} label={`${STAGE_LABELS[stage] ?? stage}: ${state}`} />
              <span>{STAGE_LABELS[stage] ?? stage}</span>
              <b>{state === "complete" ? "Done" : state === "active" ? unitReading : state === "stopped" ? "Stopped" : "Waiting"}</b>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
